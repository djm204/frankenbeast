#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const root = process.env.FRANKENBEAST_SECRETS_SCAN_ROOT ?? defaultRoot;
const scannedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.sh', '.bash']);
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

const sensitiveIdentifierPattern = /\b(?:[A-Z0-9_]*(?:^|_)PAT(?:_|\b)[A-Z0-9_]*|[A-Z0-9_]*(?:API_KEY|SECRET|PASSWORD|TOKEN|PRIVATE_KEY|PASSPHRASE)|[A-Z0-9_]*(?:SECRET_KEY|ACCESS_KEY)|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)\b/i;
const credentialTokenPattern = /\b(?:github_pat_[a-zA-Z0-9_]{40,}(?![a-zA-Z0-9_])|gh[opusr]_[a-zA-Z0-9_.-]{20,}(?![a-zA-Z0-9_.-])|sk-ant-[a-zA-Z0-9_-]{40,}(?![a-zA-Z0-9_-])|AIza[a-zA-Z0-9_-]{35}(?![a-zA-Z0-9_-]))/g;
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
  const extension = extensionOf(path);
  if (rel === 'scripts/bootstrap.sh') {
    return false;
  }
  return scannedExtensions.has(extension);
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

function redactCredentialTokens(text) {
  return text.replace(credentialTokenPattern, '[REDACTED]');
}

function hasCredentialToken(text) {
  credentialTokenPattern.lastIndex = 0;
  return credentialTokenPattern.test(text);
}

function redactSourceLine(line) {
  const redactPlainText = (value) => redactCredentialTokens(value)
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,})\b/gi, '<redacted>')
    .replace(new RegExp(`(${sensitiveIdentifierPattern.source})\\s*=\\s*[^\\s'\"` + '`' + `]+`, 'gi'), '$1=<redacted>');
  const literals = stringLiterals(line);
  if (literals.length === 0) {
    return redactPlainText(line);
  }
  let redacted = '';
  let cursor = 0;
  for (const literal of literals) {
    redacted += redactPlainText(line.slice(cursor, literal.start));
    redacted += literal.closed ? `${literal.quote}<redacted>${literal.quote}` : `${literal.quote}<redacted>`;
    cursor = literal.end;
  }
  redacted += redactPlainText(line.slice(cursor));
  return redacted;
}

function hardcodedSensitiveEnvFinding(line) {
  const trimmed = line.trimStart();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('#')) {
    return hasCredentialToken(trimmed) ? '<redacted>' : null;
  }
  const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!match) {
    return null;
  }
  const [, name, value] = match;
  const hasValue = value.trim().length > 0;
  if (!hasValue) {
    return null;
  }
  if (hasCredentialToken(value)) {
    return redactEnvAssignment(name);
  }
  if (!sensitiveIdentifierPattern.test(name)) {
    return null;
  }
  return redactEnvAssignment(name);
}

function stripComments(line, state, options = {}) {
  let output = '';
  let quote = null;
  let escaped = false;
  const python = options.language === 'python';
  const shell = options.language === 'shell';

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

    if (!python && !shell && char === '/' && next === '/') {
      return output;
    }

    if ((python || shell) && char === '#') {
      return output;
    }

    if (!python && !shell && char === '/' && next === '*') {
      state.inBlockComment = true;
      index += 1;
      continue;
    }

    output += char;
  }

  return output;
}

function lineLanguage(path) {
  const extension = extensionOf(path);
  if (extension === '.py') {
    return 'python';
  }
  if (extension === '.sh' || extension === '.bash') {
    return 'shell';
  }
  return 'javascript';
}

function codeOutsideStringLiterals(line) {
  const literals = stringLiterals(line);
  if (literals.length === 0) {
    return line;
  }
  let output = '';
  let cursor = 0;
  for (const literal of literals) {
    output += line.slice(cursor, literal.start);
    output += literal.quote.repeat(literal.closed ? 2 : 1);
    cursor = literal.end;
  }
  output += line.slice(cursor);
  return output;
}

function isSensitiveLiteralName(literal) {
  return /^[A-Z0-9_]+$/.test(literal) && (
    sensitiveEnvNames.some((name) => name === literal)
    || sensitiveIdentifierPattern.test(literal)
  );
}

function isSensitiveAliasLiteral(literal) {
  return !/^--/.test(literal) && isSensitiveLiteralName(literal);
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

function stripShellSingleQuotedSegments(line) {
  if (!line.includes("'")) return line;
  const pieces = [];
  let quote = '';
  let keptStart = 0;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '\\' && quote !== "'") {
      index += 1;
      continue;
    }
    if (!quote && character === '"') quote = '"';
    else if (quote === '"' && character === '"') quote = '';
    else if (!quote && character === "'") {
      pieces.push(line.slice(keptStart, index));
      quote = "'";
    } else if (quote === "'" && character === "'") {
      keptStart = index + 1;
      quote = '';
    }
  }
  pieces.push(line.slice(keptStart));
  return pieces.join('');
}

function hasSensitiveEnvAccess(line, envContainerAliases = new Set(), envNameAliases = new Set(), envGetterAliases = new Set(), options = {}) {
  line = line
    .replace(/\bprocess\.env!/g, 'process.env')
    .replace(/\(\s*process\.env\s+as\s+[^)]+\)/g, 'process.env')
    .replace(/\?\.\[/g, '[')
    .replace(/\?\./g, '.');
  const envAccessPattern = /(?:(?:\(?process(?:\?\.env|\.env|\?\.\[['"`]env['"`]\]|\[['"`]env['"`]\])\)?|import\.meta\.env)\??(?:\.([A-Z0-9_]+)|\?\.\[['"`]([^'"`]+)['"`]\]|\[['"`]([^'"`]+)['"`]\])|(?:os\.environ(?:\.(?:get|setdefault|pop))?|os\.getenv|\bgetenv|\benviron(?:\.(?:get|setdefault|pop))?)\s*\(\s*['"`]([^'"`]+)['"`]|(?:os\.)?environ\s*\[\s*['"`]([^'"`]+)['"`]\s*\])/gi;
  for (const match of line.matchAll(envAccessPattern)) {
    const name = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? '';
    if (sensitiveIdentifierPattern.test(name)) {
      return true;
    }
  }
  for (const alias of envContainerAliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const aliasAccessPattern = new RegExp(`\\b${escaped}\\??(?:\\.(?:get|setdefault|pop)\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]|\\.([A-Z0-9_]+)|\\?\\.\\[['"\`]([^'"\`]+)['"\`]\\]|\\[['"\`]([^'"\`]+)['"\`]\\]|\\[\\s*([A-Za-z_$][\\w$]*)\\s*\\])`, 'gi');
    for (const match of line.matchAll(aliasAccessPattern)) {
      const name = match[1] ?? match[2] ?? match[3] ?? match[4] ?? '';
      const nameAlias = match[5] ?? '';
      if ((name && sensitiveIdentifierPattern.test(name)) || (nameAlias && envNameAliases.has(nameAlias))) {
        return true;
      }
    }
  }
  for (const getter of envGetterAliases) {
    const escaped = getter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const getterPattern = new RegExp("\\b" + escaped + "\\s*\\(\\s*['\"`]([^'\"`]+)['\"`]", 'gi');
    for (const match of line.matchAll(getterPattern)) {
      if (sensitiveIdentifierPattern.test(match[1] ?? '')) {
        return true;
      }
    }
  }
  const variableEnvAccessPattern = /(?:(?:process\.env|import\.meta\.env|(?:os\.)?environ)\s*(?:\?\.)?\[\s*([A-Za-z_$][\w$]*)\s*\]|(?:os\.environ(?:\.(?:get|setdefault|pop))?|os\.getenv|\bgetenv|\benviron(?:\.(?:get|setdefault|pop))?)\s*\(\s*([A-Za-z_$][\w$]*))/g;
  for (const match of line.matchAll(variableEnvAccessPattern)) {
    const envNameAlias = match[1] ?? match[2] ?? '';
    if (envNameAlias && envNameAliases.has(envNameAlias)) {
      return true;
    }
  }
  const computedEnvAccessPattern = /(?:(?:process\.env|import\.meta\.env|(?:os\.)?environ)|[A-Za-z_$][\w$]*)\s*(?:\?\.)?\[([^\]]+)\]/g;
  for (const match of line.matchAll(computedEnvAccessPattern)) {
    const prefix = match[0].slice(0, match[0].indexOf('[')).trim().replace(/\?\.$/, '');
    const isEnvContainer = /^(?:process\.env|import\.meta\.env|(?:os\.)?environ)$/.test(prefix) || envContainerAliases.has(prefix);
    if (!isEnvContainer) continue;
    const computedName = stringLiterals(match[1]).map((literal) => literal.value).join('');
    if (computedName && sensitiveIdentifierPattern.test(computedName)) return true;
  }
  const computedGetterPattern = /(?:(?:os\.)?(?:getenv|environ\.(?:get|setdefault|pop))|[A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g;
  for (const match of line.matchAll(computedGetterPattern)) {
    const callee = match[0].slice(0, match[0].indexOf('(')).trim();
    const isEnvGetter = /^(?:(?:os\.)?(?:getenv|environ\.(?:get|setdefault|pop)))$/.test(callee) || envGetterAliases.has(callee);
    if (!isEnvGetter) continue;
    const computedName = stringLiterals(match[1]).map((literal) => literal.value).join('');
    if (computedName && sensitiveIdentifierPattern.test(computedName)) return true;
  }
  if (options.shell) {
    const installTimeShell = stripShellSingleQuotedSegments(line).replace(/\\\$/g, '');
    for (const match of installTimeShell.matchAll(/\$\{?([A-Z0-9_]*(?:API_KEY|SECRET|PASSWORD|TOKEN|PRIVATE_KEY|PASSPHRASE|PAT|ACCESS_KEY)[A-Z0-9_]*)\}?/gi)) {
      if (sensitiveIdentifierPattern.test(match[1])) {
        return true;
      }
    }
    for (const match of installTimeShell.matchAll(/(?:\$\(\s*(?:(?:\/[A-Za-z0-9._-]+)+\/)?printenv\s+(?:['"]?\$?([A-Za-z_$][\w$]*)['"]?|['"]?\$\{([A-Za-z_$][\w$]*)\}['"]?|([A-Z0-9_]+))(?=\s|\)|\|)|`\s*(?:(?:\/[A-Za-z0-9._-]+)+\/)?printenv\s+(?:['"]?\$?([A-Za-z_$][\w$]*)['"]?|['"]?\$\{([A-Za-z_$][\w$]*)\}['"]?|([A-Z0-9_]+))(?=\s|`|\|)|\$\{!([A-Za-z_$][\w$]*)\})/gi)) {
      const aliases = [match[1], match[2], match[4], match[5], match[7]].filter(Boolean);
      const names = [match[3], match[6]].filter(Boolean);
      if (aliases.some((alias) => sensitiveIdentifierPattern.test(alias) || envNameAliases.has(alias)) || names.some((name) => sensitiveIdentifierPattern.test(name))) {
        return true;
      }
    }
  }
  return false;
}

function expressionUsesSensitiveAlias(expression, aliases) {
  for (const alias of aliases) {
    if (hasAliasInterpolation(expression, alias)) {
      return true;
    }
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\s*(?:\\.|\\?\\.)`, 'u').test(codeOutsideStringLiterals(expression))) {
      return true;
    }
  }
  return false;
}

function collectSensitiveEnvAliases(line, aliases, envNameAliases, envContainerAliases = new Set(), envGetterAliases = new Set(), destructuredEnvState = null, options = {}) {
  const pythonImports = line.match(/^\s*import\s+(.+)$/);
  if (pythonImports) {
    for (const rawPart of pythonImports[1].split(',')) {
      const osImportAlias = rawPart.trim().match(/^os\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (osImportAlias) options.osModuleAliases?.add(osImportAlias[1]);
    }
  }

  const groupedOsImport = line.match(/^\s*from\s+os\s+import\s+(.+)$/);
  if (groupedOsImport) {
    for (const rawPart of groupedOsImport[1].split(',')) {
      const part = rawPart.trim();
      const envMatch = part.match(/^environ(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (envMatch) {
        envContainerAliases.add(envMatch[1] ?? 'environ');
      }
      const getenvMatch = part.match(/^getenv(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (getenvMatch) {
        envGetterAliases.add(getenvMatch[1] ?? 'getenv');
      }
    }
    return;
  }

  if (destructuredEnvState?.active) {
    const envEnd = line.match(/^(.*)\}\s*(?::\s*[^=]+)?=\s*(?:\(?process\.env\)?|import\.meta\.env|([A-Za-z_$][\w$]*))\s*;?$/);
    const anyEnd = envEnd ?? line.match(/^(.*)\}\s*=\s*.+;?$/);
    const parts = anyEnd ? [...destructuredEnvState.parts, anyEnd[1]] : [...destructuredEnvState.parts, line];
    if (anyEnd) {
      destructuredEnvState.active = false;
      destructuredEnvState.parts = [];
      if (envEnd && (!envEnd[2] || envContainerAliases.has(envEnd[2]))) {
        collectSensitiveEnvAliases(`const {${parts.join(',')}} = process.env;`, aliases, envNameAliases, envContainerAliases, envGetterAliases, null, options);
      }
    } else {
      destructuredEnvState.parts = parts;
    }
    return;
  }

  const destructured = line.match(/^\s*(?:export\s+)?(?:const|let|var)\s*\{(.+)\}\s*(?::\s*[^=]+)?=\s*(?:(?:\(?process(?:\.env|\[['"`]env['"`]\])\)?|import\.meta\.env)|([A-Za-z_$][\w$]*))\s*;?$/);
  if (destructured) {
    const rhsAlias = destructured[2] ?? '';
    const rhsIsEnvContainer = !rhsAlias || envContainerAliases.has(rhsAlias);
    const rhsIsSensitiveObject = rhsAlias && aliases.has(rhsAlias);
    const rhsHasSensitiveProperties = rhsAlias && [...aliases].some((alias) => alias.startsWith(`${rhsAlias}.`));
    if (!rhsIsEnvContainer && !rhsIsSensitiveObject && !rhsHasSensitiveProperties) {
      return;
    }
    for (const nestedMatch of destructured[1].matchAll(/\b([A-Z0-9_]+)\s*:\s*([A-Za-z_$][\w$]*)/gi)) {
      if (rhsIsEnvContainer && sensitiveIdentifierPattern.test(nestedMatch[1])) aliases.add(nestedMatch[2]);
    }
    for (const part of destructured[1].split(',')) {
      const [rawName, rawAlias] = part.split(':').map((value) => value?.trim()).filter(Boolean);
      const alias = (rawAlias ?? rawName ?? '').replace(/\s*=.*$/, '').trim();
      const envName = rawName?.trim() ?? '';
      if (alias && ((rhsIsEnvContainer && sensitiveIdentifierPattern.test(envName)) || rhsIsSensitiveObject || aliases.has(`${rhsAlias}.${envName}`))) {
        aliases.add(alias);
      }
    }
    return;
  }

  const processEnvImport = line.match(/^\s*import\s*\{([^}]+)\}\s*from\s*['"](?:node:)?process['"]\s*;?$/);
  if (processEnvImport) {
    for (const part of processEnvImport[1].split(',')) {
      const envImport = part.trim().match(/^env(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (envImport) envContainerAliases.add(envImport[1] ?? 'env');
    }
    return;
  }

  const defaultProcessImport = line.match(/^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s*['"](?:node:)?process['"]\s*;?$/);
  if (defaultProcessImport) {
    envContainerAliases.add(`${defaultProcessImport[1]}.env`);
    return;
  }

  const namespaceProcessImport = line.match(/^\s*import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from\s*['"](?:node:)?process['"]\s*;?$/);
  if (namespaceProcessImport) {
    envContainerAliases.add(`${namespaceProcessImport[1]}.env`);
    return;
  }

  const commonProcessEnv = line.match(/^\s*(?:const|let|var)\s*\{\s*env(?:\s*:\s*([A-Za-z_$][\w$]*))?\s*\}\s*=\s*require\(\s*['"](?:node:)?process['"]\s*\)\s*;?$/);
  if (commonProcessEnv) {
    envContainerAliases.add(commonProcessEnv[1] ?? 'env');
    return;
  }

  const commonProcessModule = line.match(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"](?:node:)?process['"]\s*\)\s*;?$/);
  if (commonProcessModule) {
    envContainerAliases.add(`${commonProcessModule[1]}.env`);
    return;
  }

  const processDestructured = line.match(/^\s*(?:const|let|var)\s*\{([^}]+)\}\s*=\s*process\s*;?$/);
  if (processDestructured) {
    for (const part of processDestructured[1].split(',')) {
      const [rawName, rawAlias] = part.split(':').map((value) => value?.trim()).filter(Boolean);
      if (rawName === 'env') {
        envContainerAliases.add((rawAlias ?? rawName).replace(/\s*=.*$/, '').trim());
      }
    }
    return;
  }

  const normalizedOsLine = [...(options.osModuleAliases ?? [])].reduce((value, moduleAlias) => value.replace(new RegExp(`\\b${moduleAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`, 'g'), 'os.'), line);

  const destructuredStart = normalizedOsLine.match(/^\s*(?:export\s+)?(?:const|let|var)\s*\{\s*(.*)$/);
  if (destructuredStart && destructuredEnvState && !destructuredStart[1].includes('}')) {
    destructuredEnvState.active = true;
    destructuredEnvState.parts = [destructuredStart[1]];
    return;
  }

  const commandDestructured = normalizedOsLine.match(/^\s*(?:const|let|var)\s*\{([^}]+)\}\s*=\s*(?:await\s+)?(.+)$/);
  if (commandDestructured && hasProgrammaticGhAuthTokenCall(commandDestructured[2], options.ghAuthArgAliases, options.ghCommandAliases, options.subprocessCallAliases)) {
    for (const part of commandDestructured[1].split(',')) {
      const [rawName, rawAlias] = part.split(':').map((value) => value?.trim()).filter(Boolean);
      const alias = (rawAlias ?? rawName ?? '').replace(/\s*=.*$/, '').trim();
      if (alias) {
        aliases.add(alias);
      }
    }
    return;
  }

  const sequenceAssignment = normalizedOsLine.match(/^\s*(?:(?:const|let|var)\s+)?(?:\[([^\]]+)\]|((?:[A-Za-z_$][\w$]*\s*,\s*)+[A-Za-z_$][\w$]*))\s*=\s*(.+)$/);
  if (sequenceAssignment && hasSensitiveEnvAccess(sequenceAssignment[3], envContainerAliases, envNameAliases, envGetterAliases, { shell: options.shell })) {
    for (const name of (sequenceAssignment[1] ?? sequenceAssignment[2]).split(',').map((part) => part.trim()).filter((part) => part && part !== '_')) {
      if (/^[A-Za-z_$][\w$]*$/.test(name)) aliases.add(name);
    }
    return;
  }

  const mutation = normalizedOsLine.match(/^\s*([A-Za-z_$][\w$]*)\.(?:push|append|unshift|extend)\s*\((.+)\)\s*;?$/);
  if (mutation && (hasInlineTokenMaterial(mutation[2]) || hasSensitiveEnvAccess(mutation[2], envContainerAliases, envNameAliases, envGetterAliases, { shell: options.shell }) || hasProgrammaticGhAuthTokenCall(mutation[2], options.ghAuthArgAliases, options.ghCommandAliases, options.subprocessCallAliases) || hasInstallTimeGhAuthTokenSubstitution(mutation[2], options.ghCommandAliases) || expressionUsesSensitiveAlias(mutation[2], aliases))) {
    aliases.add(mutation[1]);
    return;
  }

  const javascriptDeclarations = normalizedOsLine.match(/^\s*(?:export\s+)?(?:const|let|var)\s+(.+)$/);
  if (javascriptDeclarations && javascriptDeclarations[1].includes(',')) {
    let start = 0;
    let depth = 0;
    let quote = '';
    const declarations = [];
    for (let index = 0; index <= javascriptDeclarations[1].length; index += 1) {
      const character = javascriptDeclarations[1][index] ?? ',';
      if (quote) {
        if (character === quote && javascriptDeclarations[1][index - 1] !== '\\') quote = '';
      } else if (['"', "'", '`'].includes(character)) {
        quote = character;
      } else if ('([{'.includes(character)) {
        depth += 1;
      } else if (')]}'.includes(character)) {
        depth -= 1;
      } else if (character === ',' && depth === 0) {
        declarations.push(javascriptDeclarations[1].slice(start, index).trim());
        start = index + 1;
      }
    }
    if (declarations.length > 1) {
      for (const declaration of declarations) {
        collectSensitiveEnvAliases(`const ${declaration.replace(/;$/, '')}`, aliases, envNameAliases, envContainerAliases, envGetterAliases, destructuredEnvState, options);
      }
      return;
    }
  }

  const shellDeclarations = options.shell && normalizedOsLine.match(/^\s*(?:export|readonly(?:\s+-[A-Za-z]+)*|local(?:\s+-[A-Za-z]+)*|declare(?:\s+-[A-Za-z]+)*)\s+(.+)$/);
  if (shellDeclarations) {
    const assignments = [...shellDeclarations[1].matchAll(/(?:^|\s)([A-Za-z_$][\w$]*)=("(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s]+)/g)];
    if (assignments.length > 1) {
      for (const assignmentPart of assignments) {
        collectSensitiveEnvAliases(`${assignmentPart[1]}=${assignmentPart[2]}`, aliases, envNameAliases, envContainerAliases, envGetterAliases, destructuredEnvState, options);
      }
      return;
    }
  }

  const assignment = normalizedOsLine.match(/^\s*(?:(?:export\s+)?(?:const|let|var)\s+|(?:export|readonly(?:\s+-[A-Za-z]+)*|local(?:\s+-[A-Za-z]+)*|declare(?:\s+-[A-Za-z]+)*)\s+)?([A-Za-z_$][\w$]*(?:(?:\.[A-Za-z_$][\w$]*)|(?:\[['"`][A-Za-z_$][\w$]*['"`]\]))*)(?:\s*:\s*[^=]+)?\s*(?:\+=|(?:\|\||&&|\?\?)?=)\s*(.+)$/);
  if (!assignment) {
    return;
  }
  const rawAlias = assignment[1];
  const alias = rawAlias.replace(/\[['"`]([A-Za-z_$][\w$]*)['"`]\]/g, '.$1');
  const expression = assignment[2];
  const trimmedExpression = expression.trim();
  const aliasedOsEnviron = [...(options.osModuleAliases ?? [])].some((moduleAlias) => trimmedExpression.replace(/;$/, '') === `${moduleAlias}.environ`);
  const isSpreadEnvCopy = /^\{\s*\.\.\.(?:process\.env|import\.meta\.env|[A-Za-z_$][\w$]*)\s*\}\s*;?$/.test(trimmedExpression)
    && (/\b(?:process\.env|import\.meta\.env)\b/.test(trimmedExpression) || [...envContainerAliases].some((container) => trimmedExpression.includes(`...${container}`)));
  const assignedEnvContainer = /^Object\.assign\(\s*\{\s*\}\s*,\s*(process\.env|import\.meta\.env|[A-Za-z_$][\w$]*)\s*\)\s*;?$/.exec(trimmedExpression);
  const isAssignedEnvCopy = Boolean(assignedEnvContainer && (/^(?:process\.env|import\.meta\.env)$/.test(assignedEnvContainer[1]) || envContainerAliases.has(assignedEnvContainer[1])));
  const copiedEnvContainer = /^(?:(?:os\.)?environ|([A-Za-z_$][\w$]*))\.copy\(\)\s*;?$/.exec(trimmedExpression);
  if (/^(?:\(?process(?:\?\.env|\.env|\?\.\[['"`]env['"`]\]|\[['"`]env['"`]\])\)?|import\.meta\.env|(?:os\.)?environ)\s*;?$/.test(trimmedExpression) || aliasedOsEnviron || isSpreadEnvCopy || isAssignedEnvCopy || (copiedEnvContainer && (!copiedEnvContainer[1] || envContainerAliases.has(copiedEnvContainer[1])))) {
    envContainerAliases.add(alias);
  } else {
    envContainerAliases.delete(alias);
  }
  if (/^process\s*;?$/.test(trimmedExpression)) envContainerAliases.add(`${alias}.env`);
  else envContainerAliases.delete(`${alias}.env`);
  const aliasedOsGetter = [...(options.osModuleAliases ?? [])].some((moduleAlias) => new RegExp(`^${moduleAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(?:getenv|environ\\.get)\\s*;?$`).test(trimmedExpression));
  const aliasedEnvGetter = [...envContainerAliases].some((container) => trimmedExpression.replace(/;$/, '') === `${container}.get`);
  if (/^(?:(?:os\.)?getenv|os\.environ\.get)\s*;?$/.test(trimmedExpression) || aliasedOsGetter || aliasedEnvGetter) {
    envGetterAliases.add(alias);
  } else {
    envGetterAliases.delete(alias);
  }
  const commandLiteral = stringLiterals(expression).map((literal) => literal.value.trim()).find((literal) => /(?:^|\/)gh$/.test(literal));
  const commandParts = stringLiterals(expression).map((literal) => literal.value.trim());
  const fullGhArgv = /^(?:gh|(?:[^/]+\/)*gh)$/.test(commandParts[0] ?? '') && commandParts.includes('auth') && commandParts.includes('token');
  if ((commandLiteral && /^\s*['"`](?:[^'"`]*\/)?gh['"`]\s*;?\s*$/.test(expression)) || fullGhArgv || (options.shell && (/^(?:command\s+)?\/?(?:[^\s/]+\/)*gh\s*;?$/.test(trimmedExpression) || /^\$\(\s*command\s+-v\s+gh\s*\)\s*;?$/.test(trimmedExpression)))) options.ghCommandAliases?.add(alias);
  else options.ghCommandAliases?.delete(alias);
  const envNameLiteral = stringLiterals(expression)
    .map((literal) => literal.value.trim())
    .find((literal) => /^[A-Za-z_$][\w$]*$/.test(literal) && sensitiveIdentifierPattern.test(literal));
  const shellEnvNameLiteral = options.shell && sensitiveIdentifierPattern.test(expression.trim()) ? expression.trim() : '';
  if (envNameLiteral || shellEnvNameLiteral) {
    envNameAliases.add(alias);
  } else {
    envNameAliases.delete(alias);
  }
  const envNameAliasAccess = new RegExp(String.raw`(?:os\.environ(?:\.(?:get|setdefault|pop))?|os\.getenv|\bgetenv|\benviron(?:\.(?:get|setdefault|pop))?)\s*\(\s*([A-Za-z_$][\w$]*)|(?:os\.)?environ\s*\[\s*([A-Za-z_$][\w$]*)\s*\]|(?:process\.env|import\.meta\.env)\s*\[\s*([A-Za-z_$][\w$]*)\s*\]`, 'u').exec(expression);
  const envAlias = envNameAliasAccess?.[1] ?? envNameAliasAccess?.[2] ?? envNameAliasAccess?.[3] ?? '';
  if (hasInlineTokenMaterial(expression) || hasSensitiveEnvAccess(expression, envContainerAliases, envNameAliases, envGetterAliases, { shell: options.shell }) || (hasInstallTimeGhAuthTokenSubstitution(expression, options.ghCommandAliases) || hasProgrammaticGhAuthTokenCall(expression, options.ghAuthArgAliases, options.ghCommandAliases, options.subprocessCallAliases)) || (envAlias && envNameAliases.has(envAlias)) || expressionUsesSensitiveAlias(expression, aliases)) {
    aliases.add(alias);
  } else if (!aliases.has(alias) || !/^\s*(?:export\s+)?(?:const|let)\s+/.test(normalizedOsLine)) {
    aliases.delete(alias);
  }
}

function hasCronScheduleText(value) {
  const cronComponent = String.raw`(?:\*|\d+(?:-\d+)?|[A-Z]{3}(?:-[A-Z]{3})?)(?:\/\d+)?`;
  const cronField = String.raw`${cronComponent}(?:,${cronComponent})*`;
  const cronSchedule = new RegExp(String.raw`(?:^|\s)${cronField}\s+${cronField}\s+${cronField}\s+${cronField}\s+${cronField}(?:\s+\S|\s*$)`, 'i');
  return /^(?:@(?:reboot|yearly|annually|monthly|weekly|daily|midnight|hourly))\s+\S/i.test(value.trim()) || cronSchedule.test(value);
}

function hasCronScheduleLiteral(line) {
  return stringLiterals(line).some((literal) => hasCronScheduleText(literal.value));
}

function hasReadOnlyCrontabInvocation(arguments_) {
  const crontabIndex = arguments_.findIndex((argument) => /(?:^|\/)crontab$/.test(argument));
  if (crontabIndex >= 0 && arguments_.slice(crontabIndex + 1).some((argument) => argument === '-l' || argument === '--list')) {
    return true;
  }
  return arguments_.some((argument) => /(?:^|[\s|;&])(?:[^\s]+\/)*crontab\s+(?:-l|--list)(?:\s|$)/.test(argument));
}

function hasCronCommandMarker(line, cronScheduleAliases = new Set()) {
  const outsideStrings = codeOutsideStringLiterals(line);
  const crontabCallPattern = /\b(?:execFileSync|execFile|spawnSync|spawn|execSync|exec|check_output|check_call|Popen|run|call|subprocess\.(?:run|check_output|check_call|Popen|call)|(?:os\.)?system)\s*\([^\n]*['"`][^'"`]*\bcrontab\b[^'"`]*['"`]/;
  const crontabArguments = stringLiterals(line).map((literal) => literal.value.trim());
  const readOnlyCrontabCall = hasReadOnlyCrontabInvocation(crontabArguments);
  const programmaticCrontabCall = crontabCallPattern.test(line) && !readOnlyCrontabCall;
  if (/(?:\bCRON(?:_CMD|_COMMAND)?\b|\bcrontab\b)/i.test(outsideStrings) || programmaticCrontabCall || hasCronScheduleLiteral(line) || hasCronScheduleText(line)) {
    return true;
  }
  for (const alias of cronScheduleAliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (hasAliasInterpolation(line, alias) || new RegExp(`\\b${escaped}\\b`, 'u').test(codeOutsideStringLiterals(line))) {
      return true;
    }
  }
  return false;
}

function collectCronScheduleAliases(line, aliases, pendingState = null) {
  if (pendingState?.alias) {
    if (hasCronScheduleLiteral(line)) {
      aliases.add(pendingState.alias);
    }
    if (!isFormattingOnlyLine(line) || /;\s*$/.test(line)) {
      pendingState.alias = null;
    }
  }
  const assignment = line.match(/^\s*(?:(?:export\s+)?(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=\s*(.+)$/);
  if (assignment && hasCronScheduleLiteral(assignment[2])) {
    aliases.add(assignment[1]);
  } else if (pendingState) {
    const multilineAssignment = line.match(/^\s*(?:(?:export\s+)?(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=\s*$/);
    if (multilineAssignment) pendingState.alias = multilineAssignment[1];
  }
}

function normalizePropertyAccess(line) {
  return line.replace(/\[['"`]([A-Za-z_$][\w$]*)['"`]\]/g, '.$1');
}

function hasAliasInterpolation(line, alias) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const templateInterpolationPattern = new RegExp(`(?:(?:\\$?\\{)[^}]*${escaped}(?=$|[^A-Za-z0-9_$])[^}]*\\}|\\$${escaped}\\b|\\.\\.\\.${escaped}\\b)`, 'u');
  const normalizedLine = normalizePropertyAccess(line.replace(/\?\./g, '.'));
  if (stringLiterals(normalizedLine).some((literal) => templateInterpolationPattern.test(literal.value))) {
    return true;
  }
  if (templateInterpolationPattern.test(normalizedLine)) {
    return true;
  }
  const outsideStrings = codeOutsideStringLiterals(line);
  const bareAliasPattern = new RegExp(`(?:^|[+,(=:|?]|\\s|\\[)${escaped}(?:\\s*(?:[+),;}]|\\]|\\|\\||\\?\\?|$))`, 'u');
  return bareAliasPattern.test(outsideStrings);
}

function hasInlineTokenMaterial(value) {
  return /\b(?:gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,})\b/i.test(value);
}

function hasPersistedCredentialAssignment(value) {
  const normalizedValue = value.replace(/\\(["'`])/g, '$1');
  const assignmentPattern = new RegExp(`${sensitiveIdentifierPattern.source}\\s*=\\s*(?:(["'` + '`' + `])([^"'` + '`' + `]*?)\\1|((?:\\\\?\\$\\([^)]*\\))|[^\\s]+))`, 'i');
  const match = assignmentPattern.exec(normalizedValue);
  if (!match) {
    return false;
  }
  const assignedValue = match[2] ?? match[3] ?? '';
  return !/^\\?\$\(\s*(?:(?:env|(?:\/[A-Za-z0-9._-]+)*\/env)\s+)?(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+)*(?:command\s+)?(?:(?:\/[A-Za-z0-9._-]+)+\/)?gh\s+auth\s+token(?:[^)]*)\)$/i.test(assignedValue);
}

function hasCronCredentialLiteral(line) {
  return stringLiterals(line).some((literal) => {
    const value = literal.value;
    const cronLike = hasCronScheduleLiteral(`${literal.quote}${value}${literal.quote}`) || /\bCRON(?:_CMD|_COMMAND)?\b|\bcrontab\b/i.test(line);
    const hasCredentialAssignment = hasPersistedCredentialAssignment(value);
    const hasInlineTokenMaterialValue = hasInlineTokenMaterial(value);
    return (cronLike || hasCredentialAssignment) && (hasCredentialAssignment || hasInlineTokenMaterialValue);
  });
}

function hasCronCredentialText(line) {
  return hasPersistedCredentialAssignment(line) || hasInlineTokenMaterial(line);
}

function hasProgrammaticGhAuthTokenCall(line, ghAuthArgAliases = new Set(), ghCommandAliases = new Set(), subprocessCallAliases = new Set()) {
  const usesGhCommandAlias = [...ghCommandAliases].some((alias) => new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'u').test(codeOutsideStringLiterals(line)));
  const helperPattern = [...subprocessCallAliases].map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const hasSubprocessCall = /\b(?:execFileSync|execSync|spawnSync|execFile|exec|spawn|check_output|check_call|Popen|run|subprocess\.(?:run|check_output|check_call|Popen))\b/.test(line)
    || Boolean(helperPattern && new RegExp(`\\b(?:${helperPattern})\\s*\\(`, 'u').test(line));
  if (!hasSubprocessCall || (!/['"`]gh['"`]|\bgh\b/.test(line) && !usesGhCommandAlias)) {
    return false;
  }
  if (/\bauth\b[^\n]*\btoken\b/.test(line)) {
    return true;
  }
  return [...ghAuthArgAliases].some((alias) => new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'u').test(line));
}

function collectGhAuthArgAliases(line, aliases, partsByAlias = new Map()) {
  const assignment = line.match(/^\s*(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=\s*(.+)$/);
  if (assignment) {
    const literals = new Set(stringLiterals(assignment[2]).map((literal) => literal.value.trim()));
    if (literals.has('auth') || literals.has('token')) partsByAlias.set(assignment[1], literals);
    else partsByAlias.delete(assignment[1]);
  }
  const mutation = line.match(/^\s*([A-Za-z_$][\w$]*)\.(?:push|append|extend)\s*\((.+)\)\s*;?$/);
  if (mutation) {
    const parts = partsByAlias.get(mutation[1]) ?? new Set();
    for (const literal of stringLiterals(mutation[2])) parts.add(literal.value.trim());
    partsByAlias.set(mutation[1], parts);
  }
  for (const [alias, parts] of partsByAlias) {
    if (parts.has('auth') && parts.has('token')) aliases.add(alias);
  }
}

function collectMultilineGhAuthArgAliases(lines) {
  const aliases = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const assignment = lines[index].match(/^\s*(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=\s*\[/);
    if (!assignment) continue;
    let combined = lines[index];
    let depth = groupingDepthDelta(lines[index]);
    for (let cursor = index + 1; depth > 0 && cursor < Math.min(lines.length, index + 40); cursor += 1) {
      combined += ` ${lines[cursor]}`;
      depth += groupingDepthDelta(lines[cursor]);
    }
    const literals = new Set(stringLiterals(combined).map((literal) => literal.value.trim()));
    if (literals.has('auth') && literals.has('token')) aliases.add(assignment[1]);
  }
  return aliases;
}

function collectNamedAsyncGhAuthCallbackAliases(lines) {
  const callbackNames = new Set();
  const aliases = new Set();
  for (const line of lines) {
    const callbackCall = /\b(?:execFile|exec)\s*\([^\n]*\bgh\b[^\n]*\bauth\b[^\n]*\btoken\b[^\n]*,\s*([A-Za-z_$][\w$]*)\s*\)\s*;?$/.exec(line);
    if (callbackCall) callbackNames.add(callbackCall[1]);
  }
  for (const line of lines) {
    const declaration = /^\s*function\s+([A-Za-z_$][\w$]*)\s*\(\s*[A-Za-z_$][\w$]*\s*,\s*([A-Za-z_$][\w$]*)/.exec(line);
    if (declaration && callbackNames.has(declaration[1])) aliases.add(declaration[2]);
  }
  return aliases;
}

function collectAsyncGhAuthTokenCallbackAliases(line, aliases) {
  if (!/\b(?:execFile|exec)\s*\(/.test(line) || !/\bgh\b[^\n]*\bauth\b[^\n]*\btoken\b/.test(line)) {
    return false;
  }
  const arrowCallback = /,\s*\(\s*[A-Za-z_$][\w$]*\s*,\s*([A-Za-z_$][\w$]*)/.exec(line);
  const functionCallback = /function\s*\(\s*[A-Za-z_$][\w$]*\s*,\s*([A-Za-z_$][\w$]*)/.exec(line);
  const stdoutAlias = arrowCallback?.[1] ?? functionCallback?.[1];
  if (stdoutAlias) {
    aliases.add(stdoutAlias);
    return true;
  }
  return false;
}

function hasInstallTimeGhAuthTokenSubstitution(line, ghCommandAliases = new Set()) {
  const ghCommand = String.raw`(?:(?:env|(?:\/[A-Za-z0-9._-]+)*\/env)\s+)?(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+)*(?:command\s+)?(?:gh|(?:\/[A-Za-z0-9._-]+)*\/gh)`;
  const unescapedSubstitution = new RegExp(String.raw`(^|[^\\])(?:\$\(\s*${ghCommand}\s+auth\s+token\b|` + '`' + String.raw`\s*${ghCommand}\s+auth\s+token\b)`);
  const literals = stringLiterals(line);
  let cursor = 0;
  for (const literal of literals) {
    if (unescapedSubstitution.test(line.slice(cursor, literal.start))) {
      return true;
    }
    if (literal.quote !== "'" && unescapedSubstitution.test(literal.value)) {
      return true;
    }
    if (literal.quote === '`' && /^\s*gh\s+auth\s+token(?:\s|$)/i.test(literal.value)) {
      return true;
    }
    cursor = literal.end;
  }
  if (unescapedSubstitution.test(line.slice(cursor))) return true;
  return [...ghCommandAliases].some((alias) => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:\\$\\(\\s*|` + '`' + `\\s*)\\$?\\{?${escaped}\\}?\\s+auth\\s+token\\b`, 'u').test(line);
  });
}

function hasCronSecretInterpolation(line, aliases, envContainerAliases = new Set(), envNameAliases = new Set(), envGetterAliases = new Set(), inCronContext = false, options = {}, cronScheduleAliases = new Set()) {
  if (!inCronContext && !hasCronCommandMarker(line, cronScheduleAliases)) {
    return false;
  }
  const sensitiveEnvAccess = !(options.shell && options.quotedHeredoc)
    && hasSensitiveEnvAccess(line, envContainerAliases, envNameAliases, envGetterAliases, { shell: options.shell });
  if (sensitiveEnvAccess || hasCronCredentialLiteral(line) || (inCronContext && (hasCronCredentialText(line) || ((options.shell && !options.quotedHeredoc && hasInstallTimeGhAuthTokenSubstitution(line, options.ghCommandAliases)) || hasProgrammaticGhAuthTokenCall(line, options.ghAuthArgAliases, options.ghCommandAliases, options.subprocessCallAliases))))) {
    return true;
  }
  for (const alias of aliases) {
    if (hasAliasInterpolation(line, alias) || expressionUsesSensitiveAlias(line, aliases)) {
      return true;
    }
  }
  return false;
}

function isCronContinuationLine(line, inCronContext, pendingCronCommand) {
  if (!inCronContext) {
    return false;
  }
  if (/\(\s*$|[=+\\,]\s*$|(?:=|\+)\s*[furbFURB]*[`'"]{1,3}\s*$|<<-?\s*['"]?[A-Za-z_][\w.-]*['"]?(?:\s|$)|(?:[furbFURB]*)?(?:'''|\"\"\")\s*$/.test(line)) {
    return true;
  }
  if (/^[furbFURB]*['"`]/.test(line)) {
    return !/;\s*$/.test(line);
  }
  for (const quote of ['`', "'", '"']) {
    let count = 0;
    for (let index = 0; index < line.length; index += 1) {
      if (line[index] === quote && (index === 0 || line[index - 1] !== '\\')) count += 1;
    }
    if (count % 2 === 1) return true;
  }
  return pendingCronCommand && !/[)\]}];?,?\s*$/.test(line);
}

function cronStagingStartLines(lines, commandNames = new Set()) {
  const starts = new Set();
  const pathAliases = new Map();
  const fileHandleTargets = new Map();
  for (const line of lines) {
    const assignment = line.match(/^\s*(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=\s*['"`]([^'"`]+)['"`]\s*;?$/);
    if (assignment) pathAliases.set(assignment[1], assignment[2]);
    const pathAssignment = line.match(/^\s*(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=\s*Path\s*\(\s*['"`]([^'"`]+)['"`]\s*\)\s*;?$/);
    if (pathAssignment) pathAliases.set(pathAssignment[1], pathAssignment[2]);
    const contextHandle = line.match(/^\s*with\s+open\s*\(\s*(?:['"`]([^'"`]+)['"`]|([A-Za-z_$][\w$]*))[^)]*\)\s+as\s+([A-Za-z_$][\w$]*)\s*:/);
    if (contextHandle) fileHandleTargets.set(contextHandle[3], pathAliases.get(contextHandle[2]) ?? contextHandle[1] ?? contextHandle[2]);
    const assignedHandle = line.match(/^\s*([A-Za-z_$][\w$]*)\s*=\s*open\s*\(\s*(?:['"`]([^'"`]+)['"`]|([A-Za-z_$][\w$]*))/);
    if (assignedHandle) fileHandleTargets.set(assignedHandle[1], pathAliases.get(assignedHandle[3]) ?? assignedHandle[2] ?? assignedHandle[3]);
  }
  for (const [index, line] of lines.entries()) {
    const rawTarget = (
      />{1,2}\s*([^\s;]+)/.exec(line)?.[1]
      ?? /\|\s*tee(?:\s+-a)?\s+([^\s;]+)/.exec(line)?.[1]
      ?? /\b(?:writeFileSync|writeFile)\s*\(\s*(?:['"`]([^'"`]+)['"`]|([A-Za-z_$][\w$]*))/.exec(line)?.slice(1).find(Boolean)
      ?? /\bPath\s*\(\s*['"`]([^'"`]+)['"`]\s*\)\.write_text\s*\(/.exec(line)?.[1]
      ?? /\b([A-Za-z_$][\w$]*)\.write_text\s*\(/.exec(line)?.[1]
      ?? /\bopen\s*\(\s*['"`]([^'"`]+)['"`]/.exec(line)?.[1]
    )?.replace(/^['"]|['"]$/g, '');
    const target = pathAliases.get(rawTarget) ?? rawTarget;
    if (!target) continue;
    const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const targetAliases = [...pathAliases].filter(([, value]) => value === target).map(([name]) => name);
    const targetPattern = [escapedTarget, ...targetAliases.map((name) => `\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)].join('|');
    const installOffset = lines.slice(index + 1).findIndex((laterLine) => {
      const installsWithCrontab = /\bcrontab\b/.test(laterLine) || [...commandNames].some((name) => hasAliasInterpolation(laterLine, name));
      return installsWithCrontab && new RegExp(targetPattern).test(laterLine);
    });
    if (installOffset >= 0) {
      const installIndex = index + 1 + installOffset;
      let groupStart = index;
      const groupClose = /([})])\s*>{1,2}/.exec(line)?.[1];
      if (groupClose) {
        const groupOpen = groupClose === '}' ? '{' : '(';
        let depth = 0;
        for (let cursor = index; cursor >= 0; cursor -= 1) {
          const outsideStrings = codeOutsideStringLiterals(lines[cursor]);
          depth += [...outsideStrings].filter((character) => character === groupClose).length;
          depth -= [...outsideStrings].filter((character) => character === groupOpen).length;
          if (depth <= 0) {
            groupStart = cursor;
            break;
          }
        }
      }
      for (let cursor = groupStart; cursor <= index; cursor += 1) starts.add(cursor);
      for (const [handle, handleTarget] of fileHandleTargets) {
        if (handleTarget !== target) continue;
        const handleWrite = new RegExp(`\\b${handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\.\\s*(?:write|writelines)\\s*\\(`, 'u');
        for (let cursor = index; cursor <= installIndex; cursor += 1) {
          if (handleWrite.test(lines[cursor])) starts.add(cursor);
        }
      }
    }
  }
  return starts;
}

function collectProgrammaticCrontabAliases(lines) {
  const callNames = new Set(['execFileSync', 'execFile', 'spawnSync', 'spawn', 'execSync', 'exec', 'check_output', 'check_call', 'Popen', 'run', 'call']);
  const commandNames = new Set();
  const processNames = new Set();
  const childProcessModuleAliases = new Set();
  for (const line of lines) {
    const esmImport = line.match(/^\s*import\s+(.+?)\s+from\s*['"](?:node:)?child_process['"]\s*;?\s*(?:(?:\/\/|\/\*).*?)?$/);
    if (esmImport) {
      const namespaceAlias = esmImport[1].match(/(?:^|,\s*)\*\s+as\s+([A-Za-z_$][\w$]*)$/);
      const defaultAlias = esmImport[1].match(/^([A-Za-z_$][\w$]*)(?:\s*,|$)/);
      const namedDefaultAlias = esmImport[1].match(/(?:^|[{,]\s*)default\s+as\s+([A-Za-z_$][\w$]*)(?:\s*[,}]|$)/);
      for (const alias of [namespaceAlias?.[1], defaultAlias?.[1], namedDefaultAlias?.[1]]) {
        if (alias) childProcessModuleAliases.add(alias);
      }
    }
    const commonJsAliasPattern = /(?:^\s*(?:const|let|var)\s+|,\s*)([A-Za-z_$][\w$]*)(?:\s*:\s*[^=,]+)?\s*=\s*require\s*\(\s*['"](?:node:)?child_process['"]\s*\)(?:\s+as\s+[^,;]+)?(?=\s*(?:,|;|\/\/|\/\*|$))/gu;
    for (const commonJsAlias of line.matchAll(commonJsAliasPattern)) childProcessModuleAliases.add(commonJsAlias[1]);
    const importEqualsAlias = line.match(/^\s*import\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*['"](?:node:)?child_process['"]\s*\)\s*;?\s*(?:(?:\/\/|\/\*).*?)?$/);
    if (importEqualsAlias) childProcessModuleAliases.add(importEqualsAlias[1]);
    const dynamicImportAlias = line.match(/(?:^|[,;]\s*)(?:const|let|var)?\s*([A-Za-z_$][\w$]*)(?:\s*:\s*[^=,]+)?\s*=\s*(?:await\s+)?import\s*\(\s*['"](?:node:)?child_process['"]\s*\)/);
    if (dynamicImportAlias) childProcessModuleAliases.add(dynamicImportAlias[1]);
  }
  for (const [index, line] of lines.entries()) {
    const importLine = line.match(/^\s*from\s+subprocess\s+import\s+(.+)$/);
    if (importLine) {
      for (const part of importLine[1].split(',')) {
        const imported = part.trim().match(/^(?:run|check_output|check_call|Popen|call)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
        if (imported) callNames.add(imported[1] ?? part.trim());
      }
    }
    const childProcessAliases = line.match(/^\s*(?:import|const|let|var)\s*\{([^}]+)\}\s*(?:from\s*['"]node:child_process['"]|=\s*require\(\s*['"]node:child_process['"]\s*\))\s*;?$/);
    if (childProcessAliases) {
      for (const part of childProcessAliases[1].split(',')) {
        const imported = part.trim().match(/^(?:execFileSync|execFile|spawnSync|spawn|execSync|exec)(?:\s*(?:as|:)\s*([A-Za-z_$][\w$]*))?$/);
        if (imported) callNames.add(imported[1] ?? part.trim());
      }
    }
    const promisifiedCall = line.match(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:util\.)?promisify\s*\(\s*([A-Za-z_$][\w$]*)\s*\)\s*;?$/);
    if (promisifiedCall && callNames.has(promisifiedCall[2])) callNames.add(promisifiedCall[1]);
    const assignment = line.match(/^\s*(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=\s*(?:['"`](?:[^'"`]*\/)?crontab['"`]|\/?(?:[^\s/]+\/)*crontab)\s*;?$/);
    if (assignment) commandNames.add(assignment[1]);
    const resolvedAssignment = line.match(/^\s*(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=\s*\$\(\s*command\s+-v\s+(?:\/?(?:[^\s/]+\/)*crontab)\s*\)\s*;?$/);
    if (resolvedAssignment) commandNames.add(resolvedAssignment[1]);
    const arrayAssignment = line.match(/^\s*(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=\s*\[(.+)\]\s*;?$/);
    if (arrayAssignment) {
      const commandParts = stringLiterals(arrayAssignment[2]).map((literal) => literal.value.trim());
      const crontabPosition = commandParts.findIndex((part) => /(?:^|\/)crontab$/.test(part));
      if (crontabPosition === 0 || (crontabPosition === 1 && /(?:^|\/)env$/.test(commandParts[0] ?? ''))) commandNames.add(arrayAssignment[1]);
    }
    const childProcessQualifierPattern = ['subprocess', ...childProcessModuleAliases]
      .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    let spawnStartIndex = index;
    let spawnStartLine = line;
    const childProcessMethodPattern = String.raw`(?:\.\s*(?:spawn|Popen)|\[\s*['"]spawn['"]\s*\])`;
    const qualifiedChildProcessCallPattern = String.raw`(?:(?:${childProcessQualifierPattern})\s*${childProcessMethodPattern}|require\s*\(\s*['"](?:node:)?child_process['"]\s*\)\s*${childProcessMethodPattern})`;
    let spawnedProcess = line.match(new RegExp(`^\\s*(?:(?:const|let|var)\\s+)?([A-Za-z_$][\\w$]*)(?:\\s*:\\s*[^=]+)?\\s*=\\s*(?:${qualifiedChildProcessCallPattern}|spawn|Popen)\\s*\\((.*)$`, 'u'));
    const splitQualifier = line.match(new RegExp(`^\\s*(?:(?:const|let|var)\\s+)?([A-Za-z_$][\\w$]*)(?:\\s*:\\s*[^=]+)?\\s*=\\s*(?:(?:${childProcessQualifierPattern})|require\\s*\\(\\s*['"](?:node:)?child_process['"]\\s*\\))\\s*$`, 'u'));
    const splitSpawn = splitQualifier ? lines[index + 1]?.match(new RegExp(`^\\s*${childProcessMethodPattern}\\s*\\((.*)$`, 'u')) : null;
    if (!spawnedProcess && splitQualifier && splitSpawn) {
      spawnedProcess = ['', splitQualifier[1], splitSpawn[1]];
      spawnStartIndex = index + 1;
      spawnStartLine = lines[spawnStartIndex];
    }
    if (spawnedProcess) {
      let callExpression = spawnedProcess[2];
      let depth = groupingDepthDelta(spawnStartLine);
      for (let cursor = spawnStartIndex + 1; depth > 0 && cursor < Math.min(lines.length, spawnStartIndex + 40); cursor += 1) {
        callExpression += ` ${lines[cursor]}`;
        depth += groupingDepthDelta(lines[cursor]);
      }
      const usesCommandAlias = [...commandNames].some((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'u').test(callExpression));
      if (/['"`](?:[^'"`]*\/)?crontab['"`]/.test(callExpression) || usesCommandAlias) processNames.add(spawnedProcess[1]);
    }
  }
  return { callNames, commandNames, processNames };
}

function collectMultilineProcessEnvAliases(lines) {
  const aliases = new Set();
  const content = lines.join('\n');
  for (const match of content.matchAll(/\bimport\s*\{([\s\S]*?)\}\s*from\s*['"](?:node:)?process['"]/g)) {
    for (const part of match[1].split(',')) {
      const envImport = part.trim().match(/^env(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (envImport) aliases.add(envImport[1] ?? 'env');
    }
  }
  for (const match of content.matchAll(/\bimport\s+([A-Za-z_$][\w$]*)\s+from\s*['"](?:node:)?process['"]/g)) {
    aliases.add(`${match[1]}.env`);
  }
  for (const match of content.matchAll(/\bimport\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from\s*['"](?:node:)?process['"]/g)) {
    aliases.add(`${match[1]}.env`);
  }
  return aliases;
}

function multilineProgrammaticCrontabLines(lines, aliases = collectProgrammaticCrontabAliases(lines)) {
  const indexes = new Set();
  const callPattern = [...aliases.callNames]
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const callStart = new RegExp(`\\b(?:${callPattern}|subprocess\\.(?:run|check_output|check_call|Popen|call))\\s*\\(`);
  for (let start = 0; start < lines.length; start += 1) {
    if (!callStart.test(codeOutsideStringLiterals(lines[start]))) continue;
    let combined = '';
    let depth = 0;
    let end = start;
    for (; end < Math.min(lines.length, start + 40); end += 1) {
      combined += ` ${lines[end]}`;
      const outsideStrings = codeOutsideStringLiterals(lines[end]);
      depth += [...outsideStrings].filter((character) => character === '(').length;
      depth -= [...outsideStrings].filter((character) => character === ')').length;
      if (depth <= 0) break;
    }
    const outsideCombined = codeOutsideStringLiterals(combined);
    const commandAliasUsed = [...aliases.commandNames].some((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'u').test(outsideCombined));
    const callArguments = stringLiterals(combined).map((literal) => literal.value.trim());
    const readOnlyCrontabCall = hasReadOnlyCrontabInvocation(callArguments);
    const literalCrontabCommand = !readOnlyCrontabCall && callArguments.some((argument) => /(?:^|[\s|/])crontab(?:\s|$)/.test(argument));
    if (!readOnlyCrontabCall && (hasCronCommandMarker(combined) || commandAliasUsed || literalCrontabCommand)) {
      for (let index = start; index <= end; index += 1) indexes.add(index);
    }
    start = end;
  }
  return indexes;
}

function cronHeredocInfo(line) {
  const match = line.match(/<<-?\s*(\\?)(['"]?)([A-Za-z_][\w.-]*)\2(?:\s|$)/);
  return match ? { delimiter: match[3], quoted: Boolean(match[1] || match[2]) } : null;
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

function groupingDepthDelta(line) {
  const outsideStrings = codeOutsideStringLiterals(line);
  return [...outsideStrings].reduce((depth, character) => {
    if ('([{'.includes(character)) return depth + 1;
    if (')]}'.includes(character)) return depth - 1;
    return depth;
  }, 0);
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
  const sensitiveEnvAliases = collectNamedAsyncGhAuthCallbackAliases(lines);
  const sensitiveEnvNameAliases = new Set();
  const envContainerAliases = collectMultilineProcessEnvAliases(lines);
  const envGetterAliases = new Set();
  const osModuleAliases = new Set(['os']);
  const ghAuthArgAliases = collectMultilineGhAuthArgAliases(lines);
  const ghAuthArgParts = new Map();
  const ghCommandAliases = new Set();
  const cronScheduleAliases = new Set();
  const pendingCronScheduleState = { alias: null };
  const destructuredEnvState = { active: false, parts: [] };
  let pendingCronCommand = false;
  let pendingCronHeredocDelimiter = null;
  let pendingCronQuotedHeredoc = false;
  let pendingAliasName = null;
  let pendingAliasDepth = 0;
  let pendingAliasExpression = '';
  let pendingAsyncGhAuthCall = '';
  const language = lineLanguage(file);
  const subprocessAliases = collectProgrammaticCrontabAliases(lines);
  const cronStagingStarts = cronStagingStartLines(lines, subprocessAliases.commandNames);
  const programmaticCrontabLines = multilineProgrammaticCrontabLines(lines, subprocessAliases);

  for (const [index, line] of lines.entries()) {
    const code = stripComments(line, commentState, { language }).trim();

    if (hasCredentialToken(line)) {
      findings.push(`${toRepoPath(file)}:${index + 1}: <redacted>`);
      pendingSensitiveFallbackLine = null;
      continue;
    }
    if (!code) {
      continue;
    }

    if (pendingCronHeredocDelimiter && code === pendingCronHeredocDelimiter) {
      pendingCronHeredocDelimiter = null;
      pendingCronQuotedHeredoc = false;
      pendingCronCommand = false;
      continue;
    }

    if (pendingAliasName) {
      pendingAliasExpression = `${pendingAliasExpression} ${code}`;
      if (hasInlineTokenMaterial(code) || hasSensitiveEnvAccess(code, envContainerAliases, sensitiveEnvNameAliases, envGetterAliases, { shell: language === 'shell' }) || hasProgrammaticGhAuthTokenCall(pendingAliasExpression, ghAuthArgAliases, ghCommandAliases, subprocessAliases.callNames) || (language === 'shell' && hasInstallTimeGhAuthTokenSubstitution(code, ghCommandAliases)) || expressionUsesSensitiveAlias(code, sensitiveEnvAliases) || stringLiterals(code).some((literal) => isSensitiveAliasLiteral(literal.value.trim())) || /^\.([A-Z0-9_]+)\s*[),;]?$/.test(code)) {
        sensitiveEnvAliases.add(pendingAliasName);
      } else if (!sensitiveEnvAliases.has(pendingAliasName) && !isFormattingOnlyLine(code) && !/^[\])},;]+$/.test(code)) {
        sensitiveEnvAliases.delete(pendingAliasName);
      }
      if (pendingAliasDepth > 0) {
        pendingAliasDepth += groupingDepthDelta(code);
        if (pendingAliasDepth <= 0) pendingAliasName = null;
      } else if (!/[([{,]\s*$/.test(code) && !/^(?:process(?:\.env)?|import\.meta(?:\.env)?)$/.test(code) && !/^\.(?:env|[A-Z0-9_]+)?\s*[,;]?$/.test(code) && !/^[\])},;]+$/.test(code)) {
        pendingAliasName = null;
      }
      if (!pendingAliasName) pendingAliasExpression = '';
    }

    if (pendingAsyncGhAuthCall || /\b(?:execFile|exec)\s*\(/.test(code)) {
      const candidate = pendingAsyncGhAuthCall ? `${pendingAsyncGhAuthCall} ${code}` : code;
      if (collectAsyncGhAuthTokenCallbackAliases(candidate, sensitiveEnvAliases) || candidate.length > 8192 || /;\s*$/.test(code)) {
        pendingAsyncGhAuthCall = '';
      } else {
        pendingAsyncGhAuthCall = candidate;
      }
    }

    const usesCrontabCommandAlias = [...subprocessAliases.commandNames].some((alias) => hasAliasInterpolation(code, alias));
    const writesSpawnedCrontab = [...subprocessAliases.processNames].some((alias) => new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\.(?:stdin\\s*\\.\\s*(?:write|end)|communicate)\\s*\\(`, 'u').test(code));
    const inCronContext = pendingCronCommand || cronStagingStarts.has(index) || programmaticCrontabLines.has(index) || usesCrontabCommandAlias || writesSpawnedCrontab || hasCronCommandMarker(code, cronScheduleAliases);
    if (hasCronSecretInterpolation(code, sensitiveEnvAliases, envContainerAliases, sensitiveEnvNameAliases, envGetterAliases, inCronContext, { shell: language === 'shell', quotedHeredoc: pendingCronQuotedHeredoc, ghAuthArgAliases, ghCommandAliases, subprocessCallAliases: subprocessAliases.callNames }, cronScheduleAliases)) {
      findings.push(`${toRepoPath(file)}:${index + 1}: ${redactSourceLine(code)}`);
      pendingSensitiveFallbackLine = null;
      collectGhAuthArgAliases(code, ghAuthArgAliases, ghAuthArgParts);
      collectSensitiveEnvAliases(code, sensitiveEnvAliases, sensitiveEnvNameAliases, envContainerAliases, envGetterAliases, destructuredEnvState, { shell: language === 'shell', osModuleAliases, ghAuthArgAliases, ghCommandAliases, subprocessCallAliases: subprocessAliases.callNames });
      collectCronScheduleAliases(code, cronScheduleAliases, pendingCronScheduleState);
      const heredoc = pendingCronHeredocDelimiter ? null : cronHeredocInfo(code);
      if (heredoc) {
        pendingCronHeredocDelimiter = heredoc.delimiter;
        pendingCronQuotedHeredoc = heredoc.quoted && !/\benvsubst\b/.test(code);
      }
      pendingCronCommand = Boolean(pendingCronHeredocDelimiter);
      continue;
    }

    collectGhAuthArgAliases(code, ghAuthArgAliases, ghAuthArgParts);
    collectSensitiveEnvAliases(code, sensitiveEnvAliases, sensitiveEnvNameAliases, envContainerAliases, envGetterAliases, destructuredEnvState, { shell: language === 'shell', osModuleAliases, ghAuthArgAliases, ghCommandAliases, subprocessCallAliases: subprocessAliases.callNames });
    collectCronScheduleAliases(code, cronScheduleAliases, pendingCronScheduleState);
    const multilineAlias = code.match(/^\s*(?:(?:export\s+)?(?:const|let|var)\s+|(?:export|readonly(?:\s+-[A-Za-z]+)*|local(?:\s+-[A-Za-z]+)*|declare(?:\s+-[A-Za-z]+)*)\s+)?([A-Za-z_$][\w$]*)(?:\s*:\s*[^=]+)?\s*(?:\|\||&&|\?\?)?=\s*(?:.*[([{]\s*|(?:process|import|os)\s*)?$/);
    if (multilineAlias) {
      pendingAliasName = multilineAlias[1];
      pendingAliasDepth = Math.max(0, groupingDepthDelta(code));
      pendingAliasExpression = code;
    }
    const heredoc = pendingCronHeredocDelimiter ? null : cronHeredocInfo(code);
    if (heredoc) {
      pendingCronHeredocDelimiter = heredoc.delimiter;
      pendingCronQuotedHeredoc = heredoc.quoted && !/\benvsubst\b/.test(code);
    }
    pendingCronCommand = isCronContinuationLine(code, inCronContext, pendingCronCommand);

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
