#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
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

const sensitiveIdentifierPattern = /\b(?:[A-Z0-9_]*(?:API_KEY|SECRET|PASSWORD|TOKEN|PRIVATE_KEY|PASSPHRASE)|[A-Z0-9_]*(?:SECRET_KEY|ACCESS_KEY)|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)\b/i;
const fallbackOperatorPattern = /(?:=|:|\?\?|\|\|)\s*$/;
const DEFAULT_MAX_SCANNED_FILE_BYTES = 1_000_000;
const DEFAULT_MAX_SCANNED_LINE_CHARS = 20_000;
const maxScannedFileBytes = parsePositiveInteger(
  process.env.FRANKENBEAST_SECRETS_SCAN_MAX_FILE_BYTES,
  DEFAULT_MAX_SCANNED_FILE_BYTES,
);
const maxScannedLineChars = parsePositiveInteger(
  process.env.FRANKENBEAST_SECRETS_SCAN_MAX_LINE_CHARS,
  DEFAULT_MAX_SCANNED_LINE_CHARS,
);

function printLine(...args) {
  console.info(...args);
}

function parsePositiveInteger(value, fallback) {
  if (value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedScannerFinding(parserName, inputClass, file, lineNumber, detail) {
  const location = lineNumber === undefined ? toRepoPath(file) : `${toRepoPath(file)}:${lineNumber}`;
  return `${location}: parser=${parserName} input=${inputClass} ${detail}`;
}

async function readBoundedScanFile(file, parserName, findings) {
  const info = await stat(file);
  if (info.size > maxScannedFileBytes) {
    findings.push(
      boundedScannerFinding(
        parserName,
        'file-too-large',
        file,
        undefined,
        `limit=${maxScannedFileBytes}B`,
      ),
    );
    return null;
  }
  return readFile(file, 'utf8');
}

function boundedSplitLines(content, parserName, file, findings) {
  const lines = content.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (line.length > maxScannedLineChars) {
      findings.push(
        boundedScannerFinding(
          parserName,
          'line-too-large',
          file,
          index + 1,
          `limit=${maxScannedLineChars}chars`,
        ),
      );
      return null;
    }
  }
  return lines;
}

function stringLiterals(line) {
  const literals = [];
  for (let index = 0; index < line.length; index += 1) {
    const quote = line[index];
    if (quote !== '"' && quote !== "'" && quote !== '`') {
      continue;
    }

    const start = index;
    let value = '';
    let escaped = false;
    let closed = false;
    index += 1;

    for (; index < line.length; index += 1) {
      const char = line[index];
      if (escaped) {
        value += char;
        escaped = false;
        continue;
      }
      if (char === '\\') {
        value += char;
        escaped = true;
        continue;
      }
      if (char === quote) {
        closed = true;
        break;
      }
      value += char;
    }

    literals.push({ start, end: closed ? index + 1 : line.length, quote, value, closed });
    if (!closed) break;
  }
  return literals;
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

function redactEnvAssignment(name) {
  return `${name}=<redacted>`;
}

function redactSourceLine(line) {
  const literals = stringLiterals(line);
  if (literals.length === 0) {
    return line;
  }
  let redacted = '';
  let cursor = 0;
  for (const literal of literals) {
    redacted += line.slice(cursor, literal.start);
    redacted += literal.closed ? `${literal.quote}<redacted>${literal.quote}` : `${literal.quote}<redacted>`;
    cursor = literal.end;
  }
  redacted += line.slice(cursor);
  return redacted;
}

function hardcodedSensitiveEnvFinding(line) {
  const trimmed = line.trimStart();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }
  const match = trimmed.match(/^(?:export\s+)?([A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|ACCESS|PASSPHRASE)[A-Z0-9_]*)\s*=\s*(.*)$/);
  if (!match) {
    return null;
  }
  const [, name, value] = match;
  if (!sensitiveIdentifierPattern.test(name) || value.trim().length === 0) {
    return null;
  }
  return redactEnvAssignment(name);
}

function stripComments(line, state) {
  let output = '';
  let quote = null;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (state.inBlockComment) {
      if (char === '*' && next === '/') {
        state.inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      output += char;
      continue;
    }

    if (char === '/' && next === '/') {
      return output;
    }

    if (char === '/' && next === '*') {
      state.inBlockComment = true;
      index += 1;
      continue;
    }

    output += char;
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
  for (const literalInfo of stringLiterals(line)) {
    const literal = literalInfo.value.trim();
    if (!literal || isAllowedSourceLiteral(literal)) {
      continue;
    }
    return true;
  }
  return false;
}

function hasSensitiveEnvAccess(line) {
  const envAccessPattern = /(?:(?:\(?process\.env\)?|import\.meta\.env)\??(?:\.([A-Z0-9_]+)|\[['"`]([^'"`]+)['"`]\]))/gi;
  for (const match of line.matchAll(envAccessPattern)) {
    const name = match[1] ?? match[2] ?? '';
    if (sensitiveIdentifierPattern.test(name)) {
      return true;
    }
  }
  return false;
}

const sensitiveAssignmentNamePattern = /(?:[A-Z0-9_]*(?:API_KEY|SECRET|PASSWORD|PRIVATE_KEY|ACCESS_KEY|PASSPHRASE)|[A-Z0-9_]*(?:AUTH|OPERATOR|BEARER|ACCESS|REFRESH)_TOKEN|(?:accessToken|refreshToken|authToken|operatorToken|bearerToken)|[A-Za-z_$][\w$]*(?:ApiKey|Secret|Password|PrivateKey|AccessKey|AuthToken|OperatorToken|BearerToken|AccessToken|RefreshToken)|[a-z_$][\w$]*(?:_secret|_token|_password|_api_key|_access_key))\b/;

function hasSensitiveConstantAssignment(prefix) {
  return new RegExp(`(?:^|\\b)(?:export\\s+)?(?:const|let|var)\\s+${sensitiveAssignmentNamePattern.source}[^=]*=\\s*$`).test(prefix);
}

function hasSensitiveDestructuredDefault(prefix) {
  return new RegExp(`(?:^|[{,])\\s*(?:[A-Za-z_$][\\w$]*\\s*:\\s*)?${sensitiveAssignmentNamePattern.source}\\s*=\\s*$`).test(prefix);
}

function hasSensitiveObjectPropertyAssignment(prefix) {
  return new RegExp(`(?:^|[{,])\\s*${sensitiveAssignmentNamePattern.source}\\s*:\\s*$`).test(prefix);
}

function hasEnvObjectAccess(line) {
  return /(?:process\.env|import\.meta\.env)\b/.test(line);
}

function isFormattingOnlyLine(line) {
  return /^[([{,;]*$/.test(line.trim());
}

function hasInlineHardcodedSensitiveSourceValue(line) {
  for (const literalInfo of stringLiterals(line)) {
    const literal = literalInfo.value.trim();
    if (!literal || isAllowedSourceLiteral(literal)) {
      continue;
    }
    const prefix = line.slice(0, literalInfo.start);
    if (
      fallbackOperatorPattern.test(prefix)
      && (
        hasSensitiveEnvAccess(prefix)
        || hasSensitiveConstantAssignment(prefix)
        || hasSensitiveObjectPropertyAssignment(prefix)
        || hasSensitiveDestructuredDefault(prefix)
      )
    ) {
      return true;
    }
  }
  return false;
}

function leavesSensitiveFallbackOpen(line) {
  const trimmed = line.trimEnd();
  return fallbackOperatorPattern.test(trimmed) && (hasSensitiveEnvAccess(trimmed) || hasSensitiveConstantAssignment(trimmed) || hasSensitiveObjectPropertyAssignment(trimmed));
}

async function scanEnvironmentFile(file, findings) {
  const content = await readBoundedScanFile(file, 'secret-env-scanner', findings);
  if (content === null) return;
  const lines = boundedSplitLines(content, 'secret-env-scanner', file, findings);
  if (!lines) return;
  for (const [index, line] of lines.entries()) {
    const redacted = hardcodedSensitiveEnvFinding(line);
    if (redacted) {
      findings.push(`${toRepoPath(file)}:${index + 1}: ${redacted}`);
    }
  }
}

async function scanSourceFile(file, findings) {
  const content = await readBoundedScanFile(file, 'secret-source-scanner', findings);
  if (content === null) return;
  const lines = boundedSplitLines(content, 'secret-source-scanner', file, findings);
  if (!lines) return;
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
