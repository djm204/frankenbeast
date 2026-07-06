#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const root = process.env.FRANKENBEAST_SECRETS_SCAN_ROOT ?? defaultRoot;
const scannedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const sourceRoots = ['packages', 'scripts'];
const ignoredPathParts = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.turbo',
  '.vite',
  'test',
  'tests',
  '__tests__',
  'fixtures',
]);

const sensitiveEnvNames = [
  ['AWS', 'ACCESS', 'KEY', 'ID'],
  ['AWS', 'SECRET', 'ACCESS', 'KEY'],
  ['JWT', 'SECRET'],
  ['SECRET', 'KEY'],
].map((parts) => parts.join('_'));

const sensitiveIdentifierPattern = /\b(?:[A-Z0-9_]*(?:API_KEY|SECRET|PASSWORD|TOKEN|PRIVATE_KEY)|[A-Z0-9_]*(?:SECRET_KEY|ACCESS_KEY)|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)\b/i;
const stringLiteralPattern = /(['"`])((?:\\.|(?!\1).)*)\1/g;
const fallbackOperatorPattern = /(?:=|:|\?\?|\|\|)\s*$/;

function printLine(...args) {
  console.info(...args);
}

function extensionOf(path) {
  const match = /\.[^.]+$/.exec(path);
  return match?.[0] ?? '';
}

function toRepoPath(path) {
  return relative(root, path).split(sep).join('/');
}

function shouldScanSource(path) {
  const rel = toRepoPath(path);
  const parts = rel.split('/');
  if (parts.some((part) => ignoredPathParts.has(part))) {
    return false;
  }
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(path)) {
    return false;
  }
  return scannedExtensions.has(extensionOf(path));
}

async function* walk(dir, shouldScan) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredPathParts.has(entry.name)) {
        yield* walk(fullPath, shouldScan);
      }
      continue;
    }
    if (entry.isFile() && shouldScan(fullPath)) {
      yield fullPath;
    }
  }
}

async function collectEnvironmentExampleFiles() {
  const files = [];
  for await (const file of walk(root, (path) => /(^|\/)\.env(?:\.[^/]*)?example$|(^|\/)example\.env$/i.test(path))) {
    files.push(file);
  }
  return files;
}

function redactEnvLine(line) {
  return line.replace(/=(.*)$/, '=<redacted>');
}

function redactSourceLine(line) {
  return line.replace(stringLiteralPattern, (literal, quote) => `${quote}<redacted>${quote}`);
}

function hardcodedSensitiveEnvFinding(line) {
  const trimmed = line.trimStart();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }
  const match = trimmed.match(/^(?:export\s+)?([A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|ACCESS)[A-Z0-9_]*)=(.*)$/);
  if (!match) {
    return null;
  }
  const [, name, value] = match;
  if (!sensitiveIdentifierPattern.test(name) || value.trim().length === 0) {
    return null;
  }
  return redactEnvLine(trimmed);
}

function stripComments(line, state) {
  let remaining = line;
  let output = '';

  while (remaining.length > 0) {
    if (state.inBlockComment) {
      const end = remaining.indexOf('*/');
      if (end === -1) {
        return output;
      }
      remaining = remaining.slice(end + 2);
      state.inBlockComment = false;
      continue;
    }

    const lineComment = remaining.indexOf('//');
    const blockComment = remaining.indexOf('/*');

    if (lineComment !== -1 && (blockComment === -1 || lineComment < blockComment)) {
      output += remaining.slice(0, lineComment);
      return output;
    }

    if (blockComment !== -1) {
      output += remaining.slice(0, blockComment);
      remaining = remaining.slice(blockComment + 2);
      state.inBlockComment = true;
      continue;
    }

    output += remaining;
    return output;
  }

  return output;
}

function isSensitiveLiteralName(literal) {
  return /^[A-Z0-9_]+$/.test(literal) && (
    sensitiveEnvNames.some((name) => name === literal)
    || sensitiveIdentifierPattern.test(literal)
  );
}

function isAllowedSourceLiteral(literal) {
  return isSensitiveLiteralName(literal) || /^\[?<?redacted>?\]?$/i.test(literal);
}

function hasHardcodedSourceLiteral(line) {
  for (const match of line.matchAll(stringLiteralPattern)) {
    const literal = match[2].trim();
    if (!literal || isAllowedSourceLiteral(literal)) {
      continue;
    }
    return true;
  }
  return false;
}

function hasSensitiveEnvAccess(line) {
  const envAccessPattern = /(?:process\.env|import\.meta\.env)(?:\.([A-Z0-9_]+)|\[['"`]([^'"`]+)['"`]\])/gi;
  for (const match of line.matchAll(envAccessPattern)) {
    const name = match[1] ?? match[2] ?? '';
    if (sensitiveIdentifierPattern.test(name)) {
      return true;
    }
  }
  return false;
}

const sensitiveAssignmentNamePattern = /(?:[A-Z0-9_]*(?:API_KEY|SECRET|PASSWORD|PRIVATE_KEY|ACCESS_KEY)|[A-Z0-9_]*(?:AUTH|OPERATOR|BEARER)_TOKEN|[A-Za-z_$][\w$]*(?:ApiKey|Secret|Password|PrivateKey|AccessKey|AuthToken|OperatorToken|BearerToken))\b/;

function hasSensitiveConstantAssignment(prefix) {
  return new RegExp(`(?:^|\\b)(?:export\\s+)?(?:const|let|var)\\s+${sensitiveAssignmentNamePattern.source}[^=]*=\\s*$`).test(prefix);
}

function hasSensitiveDestructuredDefault(prefix) {
  return new RegExp(`[{,]\\s*(?:[A-Za-z_$][\\w$]*\\s*:\\s*)?${sensitiveAssignmentNamePattern.source}\\s*=\\s*$`).test(prefix);
}

function hasEnvObjectAccess(line) {
  return /(?:process\.env|import\.meta\.env)\b/.test(line);
}

function isFormattingOnlyLine(line) {
  return /^[([{,;]*$/.test(line.trim());
}

function hasInlineHardcodedSensitiveSourceValue(line) {
  for (const match of line.matchAll(stringLiteralPattern)) {
    const literal = match[2].trim();
    if (!literal || isAllowedSourceLiteral(literal)) {
      continue;
    }
    const prefix = line.slice(0, match.index);
    if (
      fallbackOperatorPattern.test(prefix)
      && (
        hasSensitiveEnvAccess(prefix)
        || hasSensitiveConstantAssignment(prefix)
        || (hasSensitiveDestructuredDefault(prefix) && hasEnvObjectAccess(line.slice(match.index)))
      )
    ) {
      return true;
    }
  }
  return false;
}

function leavesSensitiveFallbackOpen(line) {
  const trimmed = line.trimEnd();
  return fallbackOperatorPattern.test(trimmed) && (hasSensitiveEnvAccess(trimmed) || hasSensitiveConstantAssignment(trimmed));
}

async function scanEnvironmentFile(file, findings) {
  const content = await readFile(file, 'utf8');
  const lines = content.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const redacted = hardcodedSensitiveEnvFinding(line);
    if (redacted) {
      findings.push(`${toRepoPath(file)}:${index + 1}: ${redacted}`);
    }
  }
}

async function scanSourceFile(file, findings) {
  const content = await readFile(file, 'utf8');
  const lines = content.split(/\r?\n/);
  const commentState = { inBlockComment: false };
  let pendingSensitiveFallbackLine = null;

  for (const [index, line] of lines.entries()) {
    const code = stripComments(line, commentState).trim();
    if (!code) {
      continue;
    }

    if (pendingSensitiveFallbackLine && hasHardcodedSourceLiteral(code)) {
      findings.push(`${toRepoPath(file)}:${index + 1}: ${redactSourceLine(code)}`);
      pendingSensitiveFallbackLine = null;
      continue;
    }

    if (pendingSensitiveFallbackLine && isFormattingOnlyLine(code)) {
      continue;
    }

    if (hasInlineHardcodedSensitiveSourceValue(code)) {
      findings.push(`${toRepoPath(file)}:${index + 1}: ${redactSourceLine(code)}`);
      pendingSensitiveFallbackLine = null;
      continue;
    }

    pendingSensitiveFallbackLine = leavesSensitiveFallbackOpen(code) ? index + 1 : null;
  }
}

const findings = [];

for (const file of await collectEnvironmentExampleFiles()) {
  await scanEnvironmentFile(file, findings);
}

for (const scanRoot of sourceRoots) {
  for await (const file of walk(join(root, scanRoot), shouldScanSource)) {
    if (fileURLToPath(import.meta.url) === file) {
      continue;
    }
    await scanSourceFile(file, findings);
  }
}

if (findings.length > 0) {
  console.error('Hard-coded example secret values are not allowed. Read them from the environment or leave example values commented/blank.');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

printLine('No hard-coded example secret values found in environment examples or production sources.');
