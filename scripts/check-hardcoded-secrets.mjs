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
  if ((extension === '.sh' || extension === '.bash') && !rel.startsWith('scripts/') && !/(?:^|\/)[^/]*(?:cron|crontab|install|setup|github|schedule|scheduler|nightly)[^/]*\.(?:sh|bash)$/i.test(rel)) {
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

function redactSourceLine(line) {
  const redactPlainText = (value) => value
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
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }
  const match = trimmed.match(/^(?:export\s+)?([A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|ACCESS|PASSPHRASE|PAT)[A-Z0-9_]*)\s*=\s*(.*)$/);
  if (!match) {
    return null;
  }
  const [, name, value] = match;
  if (!sensitiveIdentifierPattern.test(name) || value.trim().length === 0) {
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

    if (char === '/' && next === '/') {
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

function hasSensitiveEnvAccess(line, envContainerAliases = new Set(), envNameAliases = new Set(), envGetterAliases = new Set()) {
  const envAccessPattern = /(?:(?:\(?process\.env\)?|import\.meta\.env)\??(?:\.([A-Z0-9_]+)|\?\.\[['"`]([^'"`]+)['"`]\]|\[['"`]([^'"`]+)['"`]\])|(?:os\.environ(?:\.(?:get|setdefault))?|os\.getenv|\bgetenv|\benviron(?:\.(?:get|setdefault))?)\s*\(\s*['"`]([^'"`]+)['"`]|(?:os\.)?environ\s*\[\s*['"`]([^'"`]+)['"`]\s*\])/gi;
  for (const match of line.matchAll(envAccessPattern)) {
    const name = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? '';
    if (sensitiveIdentifierPattern.test(name)) {
      return true;
    }
  }
  for (const alias of envContainerAliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const aliasAccessPattern = new RegExp(`\\b${escaped}\\??(?:\\.(?:get|setdefault)\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]|\\.([A-Z0-9_]+)|\\?\\.\\[['"\`]([^'"\`]+)['"\`]\\]|\\[['"\`]([^'"\`]+)['"\`]\\]|\\[\\s*([A-Za-z_$][\\w$]*)\\s*\\])`, 'gi');
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
  const variableEnvAccessPattern = /(?:(?:process\.env|import\.meta\.env|(?:os\.)?environ)\s*(?:\?\.)?\[\s*([A-Za-z_$][\w$]*)\s*\]|(?:os\.environ(?:\.(?:get|setdefault))?|os\.getenv|\bgetenv|\benviron(?:\.(?:get|setdefault))?)\s*\(\s*([A-Za-z_$][\w$]*))/g;
  for (const match of line.matchAll(variableEnvAccessPattern)) {
    const envNameAlias = match[1] ?? match[2] ?? '';
    if (envNameAlias && envNameAliases.has(envNameAlias)) {
      return true;
    }
  }
  for (const match of line.matchAll(/\$\{?([A-Z0-9_]*(?:API_KEY|SECRET|PASSWORD|TOKEN|PRIVATE_KEY|PASSPHRASE|PAT|ACCESS_KEY)[A-Z0-9_]*)\}?/gi)) {
    if (sensitiveIdentifierPattern.test(match[1])) {
      return true;
    }
  }
  for (const match of line.matchAll(/(?:\$\(\s*printenv\s+(?:['"]?\$?([A-Za-z_$][\w$]*)['"]?|['"]?\$\{([A-Za-z_$][\w$]*)\}['"]?|([A-Z0-9_]+))\s*\)|\$\{!([A-Za-z_$][\w$]*)\})/gi)) {
    const possibleAlias = match[1] ?? '';
    const bracedAlias = match[2] ?? '';
    const name = match[3] ?? '';
    const nameAlias = match[4] ?? bracedAlias ?? possibleAlias;
    if ((possibleAlias && sensitiveIdentifierPattern.test(possibleAlias)) || (name && sensitiveIdentifierPattern.test(name)) || (nameAlias && envNameAliases.has(nameAlias))) {
      return true;
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
  const envEnd = line.match(/^(.*)\}\s*=\s*(?:\(?process\.env\)?|import\.meta\.env|([A-Za-z_$][\w$]*))\s*;?$/);
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

  const destructured = line.match(/^\s*(?:export\s+)?(?:const|let|var)\s*\{([^}]+)\}\s*(?::\s*[^=]+)?=\s*(?:(?:\(?process\.env\)?|import\.meta\.env)|([A-Za-z_$][\w$]*))\s*;?$/);
  if (destructured) {
    const rhsAlias = destructured[2] ?? '';
    const rhsIsEnvContainer = !rhsAlias || envContainerAliases.has(rhsAlias);
    const rhsIsSensitiveObject = rhsAlias && aliases.has(rhsAlias);
    if (!rhsIsEnvContainer && !rhsIsSensitiveObject) {
      return;
    }
    for (const part of destructured[1].split(',')) {
      const [rawName, rawAlias] = part.split(':').map((value) => value?.trim()).filter(Boolean);
      const alias = (rawAlias ?? rawName ?? '').replace(/\s*=.*$/, '').trim();
      const envName = rawName?.trim() ?? '';
      if (alias && ((rhsIsEnvContainer && sensitiveIdentifierPattern.test(envName)) || rhsIsSensitiveObject)) {
        aliases.add(alias);
      }
    }
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

  const destructuredStart = line.match(/^\s*(?:export\s+)?(?:const|let|var)\s*\{\s*(.*)$/);
  if (destructuredStart && destructuredEnvState && !destructuredStart[1].includes('}')) {
    destructuredEnvState.active = true;
    destructuredEnvState.parts = [destructuredStart[1]];
    return;
  }

  const assignment = line.match(/^\s*(?:(?:export\s+)?(?:const|let|var)\s+|(?:export|readonly|local(?:\s+-[A-Za-z]+)*|declare(?:\s+-[A-Za-z]+)*)\s+)?([A-Za-z_$][\w$]*)(?:\s*:\s*[^=]+)?\s*(?:\|\||&&|\?\?)?=\s*(.+)$/);
  if (!assignment) {
    return;
  }
  const [, alias, expression] = assignment;
  const trimmedExpression = expression.trim();
  if (/^(?:\(?process\.env\)?|import\.meta\.env|(?:os\.)?environ)\s*;?$/.test(trimmedExpression)) {
    envContainerAliases.add(alias);
  } else {
    envContainerAliases.delete(alias);
  }
  if (/^(?:os\.)?getenv\s*;?$/.test(trimmedExpression)) {
    envGetterAliases.add(alias);
  } else {
    envGetterAliases.delete(alias);
  }
  const envNameLiteral = stringLiterals(expression).map((literal) => literal.value.trim()).find((literal) => sensitiveIdentifierPattern.test(literal));
  const shellEnvNameLiteral = options.shell && sensitiveIdentifierPattern.test(expression.trim()) ? expression.trim() : '';
  if (envNameLiteral || shellEnvNameLiteral) {
    envNameAliases.add(alias);
  } else {
    envNameAliases.delete(alias);
  }
  const envNameAliasAccess = new RegExp(String.raw`(?:os\.environ(?:\.(?:get|setdefault))?|os\.getenv|\bgetenv|\benviron(?:\.(?:get|setdefault))?)\s*\(\s*([A-Za-z_$][\w$]*)|(?:os\.)?environ\s*\[\s*([A-Za-z_$][\w$]*)\s*\]|(?:process\.env|import\.meta\.env)\s*\[\s*([A-Za-z_$][\w$]*)\s*\]`, 'u').exec(expression);
  const envAlias = envNameAliasAccess?.[1] ?? envNameAliasAccess?.[2] ?? envNameAliasAccess?.[3] ?? '';
  if (hasInlineTokenMaterial(expression) || hasSensitiveEnvAccess(expression, envContainerAliases, envNameAliases, envGetterAliases) || ((options.shell && hasInstallTimeGhAuthTokenSubstitution(expression)) || hasProgrammaticGhAuthTokenCall(expression)) || (envAlias && envNameAliases.has(envAlias)) || expressionUsesSensitiveAlias(expression, aliases)) {
    aliases.add(alias);
  } else {
    aliases.delete(alias);
  }
}

function hasCronScheduleText(value) {
  const cronComponent = String.raw`(?:\*|\d+(?:-\d+)?|[A-Z]{3}(?:-[A-Z]{3})?)(?:\/\d+)?`;
  const cronField = String.raw`${cronComponent}(?:,${cronComponent})*`;
  const cronSchedule = new RegExp(String.raw`(?:^|\s)${cronField}\s+${cronField}\s+${cronField}\s+${cronField}\s+${cronField}(?:\s+\S|\s*$)`, 'i');
  return /^(?:@(?:reboot|yearly|annually|monthly|weekly|daily|hourly))\s+\S/i.test(value.trim()) || cronSchedule.test(value);
}

function hasCronScheduleLiteral(line) {
  return stringLiterals(line).some((literal) => hasCronScheduleText(literal.value));
}

function hasCronCommandMarker(line, cronScheduleAliases = new Set()) {
  const outsideStrings = codeOutsideStringLiterals(line);
  if (/(?:\bCRON(?:_CMD|_COMMAND)?\b|\bcrontab\b)/i.test(outsideStrings) || hasCronScheduleLiteral(line) || hasCronScheduleText(line)) {
    return true;
  }
  for (const alias of cronScheduleAliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'u').test(codeOutsideStringLiterals(line))) {
      return true;
    }
  }
  return false;
}

function collectCronScheduleAliases(line, aliases) {
  const assignment = line.match(/^\s*(?:(?:export\s+)?(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=\s*(.+)$/);
  if (assignment && hasCronScheduleLiteral(assignment[2])) {
    aliases.add(assignment[1]);
  }
}

function hasAliasInterpolation(line, alias) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const templateInterpolationPattern = new RegExp(`(?:\\$?\\{\\s*${escaped}(?:\\b[^}]*)?\\}|\\$${escaped}\\b|\\.\\.\\.${escaped}\\b)`, 'u');
  if (stringLiterals(line).some((literal) => templateInterpolationPattern.test(literal.value))) {
    return true;
  }
  if (templateInterpolationPattern.test(line)) {
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
  const assignmentPattern = new RegExp(`${sensitiveIdentifierPattern.source}\\s*=\\s*(?:(["'` + '`' + `])([^"'` + '`' + `]*?)\\1|((?:\\\\?\\$\\(\\s*gh\\s+auth\\s+token(?:[^)]*)\\))|[^\\s]+))`, 'i');
  const match = assignmentPattern.exec(normalizedValue);
  if (!match) {
    return false;
  }
  const assignedValue = match[2] ?? match[3] ?? '';
  return !/^\\?\$\(\s*gh\s+auth\s+token(?:[^)]*)\)$/i.test(assignedValue);
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

function hasProgrammaticGhAuthTokenCall(line) {
  return /\b(?:execFileSync|execSync|spawnSync|execFile|exec|spawn|check_output|check_call|Popen|run|subprocess\.(?:run|check_output|check_call|Popen))\b/.test(line) && /\bgh\b[^\n]*\bauth\b[^\n]*\btoken\b/.test(line);
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

function hasInstallTimeGhAuthTokenSubstitution(line) {
  const unescapedSubstitution = /(^|[^\\])(?:\$\(\s*(?:command\s+)?gh\s+auth\s+token\b|`\s*(?:command\s+)?gh\s+auth\s+token\b)/;
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
  return unescapedSubstitution.test(line.slice(cursor));
}

function hasCronSecretInterpolation(line, aliases, envContainerAliases = new Set(), envNameAliases = new Set(), envGetterAliases = new Set(), inCronContext = false, options = {}, cronScheduleAliases = new Set()) {
  if (!inCronContext && !hasCronCommandMarker(line, cronScheduleAliases)) {
    return false;
  }
  if (hasSensitiveEnvAccess(line, envContainerAliases, envNameAliases, envGetterAliases) || hasCronCredentialLiteral(line) || (inCronContext && (hasCronCredentialText(line) || ((options.shell && !options.quotedHeredoc && hasInstallTimeGhAuthTokenSubstitution(line)) || hasProgrammaticGhAuthTokenCall(line))))) {
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
  return pendingCronCommand && !/[)\]}];?,?\s*$/.test(line);
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
  const sensitiveEnvAliases = new Set();
  const sensitiveEnvNameAliases = new Set();
  const envContainerAliases = new Set();
  const envGetterAliases = new Set();
  const cronScheduleAliases = new Set();
  const destructuredEnvState = { active: false, parts: [] };
  let pendingCronCommand = false;
  let pendingCronHeredocDelimiter = null;
  let pendingCronQuotedHeredoc = false;
  let pendingAliasName = null;
  let pendingAsyncGhAuthCall = '';
  const language = lineLanguage(file);

  for (const [index, line] of lines.entries()) {
    const code = stripComments(line, commentState, { language }).trim();
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
      if (hasInlineTokenMaterial(code) || hasSensitiveEnvAccess(code, envContainerAliases, sensitiveEnvNameAliases, envGetterAliases) || hasProgrammaticGhAuthTokenCall(code) || (language === 'shell' && hasInstallTimeGhAuthTokenSubstitution(code)) || expressionUsesSensitiveAlias(code, sensitiveEnvAliases) || stringLiterals(code).some((literal) => sensitiveIdentifierPattern.test(literal.value.trim()) || /^token$/i.test(literal.value.trim())) || /^\.([A-Z0-9_]+)\s*[),;]?$/.test(code)) {
        sensitiveEnvAliases.add(pendingAliasName);
      } else if (!sensitiveEnvAliases.has(pendingAliasName) && !isFormattingOnlyLine(code) && !/^[\])},;]+$/.test(code)) {
        sensitiveEnvAliases.delete(pendingAliasName);
      }
      if (!/[([{,]\s*$/.test(code) && !/^\.(?:env|[A-Z0-9_]+)?\s*[,;]?$/.test(code) && !/^[\])},;]+$/.test(code)) {
        pendingAliasName = null;
      }
    }

    if (pendingAsyncGhAuthCall || /\b(?:execFile|exec)\s*\(/.test(code)) {
      const candidate = pendingAsyncGhAuthCall ? `${pendingAsyncGhAuthCall} ${code}` : code;
      if (collectAsyncGhAuthTokenCallbackAliases(candidate, sensitiveEnvAliases) || candidate.length > 8192 || /;\s*$/.test(code)) {
        pendingAsyncGhAuthCall = '';
      } else {
        pendingAsyncGhAuthCall = candidate;
      }
    }

    const inCronContext = pendingCronCommand || hasCronCommandMarker(code, cronScheduleAliases);
    if (hasCronSecretInterpolation(code, sensitiveEnvAliases, envContainerAliases, sensitiveEnvNameAliases, envGetterAliases, inCronContext, { shell: language === 'shell', quotedHeredoc: pendingCronQuotedHeredoc }, cronScheduleAliases)) {
      findings.push(`${toRepoPath(file)}:${index + 1}: ${redactSourceLine(code)}`);
      pendingSensitiveFallbackLine = null;
      collectSensitiveEnvAliases(code, sensitiveEnvAliases, sensitiveEnvNameAliases, envContainerAliases, envGetterAliases, destructuredEnvState, { shell: language === 'shell' });
      collectCronScheduleAliases(code, cronScheduleAliases);
      const heredoc = pendingCronHeredocDelimiter ? null : cronHeredocInfo(code);
      if (heredoc) {
        pendingCronHeredocDelimiter = heredoc.delimiter;
        pendingCronQuotedHeredoc = heredoc.quoted;
      }
      pendingCronCommand = Boolean(pendingCronHeredocDelimiter);
      continue;
    }

    collectSensitiveEnvAliases(code, sensitiveEnvAliases, sensitiveEnvNameAliases, envContainerAliases, envGetterAliases, destructuredEnvState, { shell: language === 'shell' });
    collectCronScheduleAliases(code, cronScheduleAliases);
    const multilineAlias = code.match(/^\s*(?:(?:export\s+)?(?:const|let|var)\s+|(?:export|readonly|local(?:\s+-[A-Za-z]+)*|declare(?:\s+-[A-Za-z]+)*)\s+)?([A-Za-z_$][\w$]*)(?:\s*:\s*[^=]+)?\s*(?:\|\||&&|\?\?)?=\s*(?:.*[([{]\s*|(?:process|import|os)\s*)?$/);
    if (multilineAlias) {
      pendingAliasName = multilineAlias[1];
    }
    const heredoc = pendingCronHeredocDelimiter ? null : cronHeredocInfo(code);
    if (heredoc) {
      pendingCronHeredocDelimiter = heredoc.delimiter;
      pendingCronQuotedHeredoc = heredoc.quoted;
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
