import { Buffer } from 'node:buffer';
import type { ApprovalRequest } from '../core/types.js';

const MARKER_LABEL = 'FRANKENBEAST_APPROVAL_PROMPT';
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/gu;

export function approvalRequestIdMarker(requestId: string): string {
  return Buffer.from(requestId, 'utf8').toString('base64url') || 'empty';
}

export function approvalPromptBoundary(requestId: string, boundary: 'BEGIN' | 'END'): string {
  return `<<${MARKER_LABEL}:${boundary}:request-b64=${approvalRequestIdMarker(requestId)}>>`;
}

function escapeControlCharacter(value: string): string {
  return value.replace(CONTROL_CHARACTER_PATTERN, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return `\\u{${codePoint.toString(16).padStart(4, '0')}}`;
  });
}

export function formatUntrustedApprovalText(value: string, prefix = '| '): string {
  const lines = value.split(/\r\n|\n|\r/u);
  return lines.map((line) => `${prefix}${escapeControlCharacter(line)}`).join('\n');
}

const TRUNCATION_MARKER = '[TRUNCATED]';

const SENSITIVE_VOCABULARY = [
  'password',
  'passwords',
  'passwd',
  'pwd',
  'secret',
  'secrets',
  'token',
  'tokens',
  'api-key',
  'api_key',
  'apikey',
  'auth-token',
  'auth_token',
  'access-token',
  'access_token',
  'access-key',
  'access_key',
  'private-key',
  'private_key',
  'client-secret',
  'client_secret',
  'db-password',
  'db_password',
  'pgpassword',
  'passphrase',
  'passphrases',
  'credential',
  'credentials',
  'auth',
  'cookie',
  'authorization',
  'personal_access_token',
  'ssh_key',
  'signing_key',
  'gpg_key',
  'pat',
  'webhook_url',
];

function isSensitiveSingleToken(token: string): boolean {
  const clean = token
    .replace(/^\\u001b\[[0-9;]*m/g, '')
    .replace(/^\x1b\[[0-9;]*m/g, '')
    .replace(/\\u001b\[[0-9;]*m/g, '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/^--/, '')
    .replace(/^\$/, '')
    .replace(/^["']/, '')
    .replace(/["']$/, '');

  // Normalize camelCase and acronym-prefix PascalCase boundaries before lowercasing.
  const withSeparators = clean
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  const lower = withSeparators.toLowerCase();

  for (const keyword of SENSITIVE_VOCABULARY) {
    if (lower === keyword) return true;
    const kwPattern = keyword.replace('-', '[-_]');
    const kwRegex = new RegExp(`(?:^|[-_])${kwPattern}(?:$|[-_\\d])`, 'i');
    if (kwRegex.test(lower)) {
      return true;
    }
  }

  return false;
}

export function isSensitiveKeyToken(token: string): boolean {
  const parts = token.split('.');
  for (const part of parts) {
    if (isSensitiveSingleToken(part)) {
      return true;
    }
  }
  return false;
}

function decodeJsonKeyEscapes(token: string): string {
  const simpleEscapes: Record<string, string> = {
    '"': '"',
    '\\': '\\',
    '/': '/',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
  };
  return token.replace(/\\(?:u([0-9A-Fa-f]{4})|(["\\/bfnrt]))/gu, (match, hex, simple) => {
    if (typeof hex === 'string') return String.fromCharCode(Number.parseInt(hex, 16));
    return typeof simple === 'string' ? simpleEscapes[simple] ?? match : match;
  });
}

export function isShellExpression(val: string): boolean {
  const len = val.length;
  for (let i = 0; i < len; i++) {
    const ch = val[i];
    let isMarker = false;

    if (ch === '`') {
      isMarker = true;
    } else if (ch === '$' || ch === '<' || ch === '>') {
      const next = val[i + 1];
      if (ch === '$' && (next === '(' || next === '{')) {
        isMarker = true;
      } else if ((ch === '<' || ch === '>') && next === '(') {
        isMarker = true;
      }
    }

    if (isMarker) {
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && val[j] === '\\') {
        backslashCount++;
        j--;
      }
      if (backslashCount % 2 === 0) {
        return true;
      }
    }
  }

  return false;
}

export function isPlausibleArmoredKeyBody(body: string): boolean {
  const normalizedBody = body.replace(/\\r\\n|\\n|\\r/gu, '\n');
  const physicalLines = normalizedBody.split(/\r\n|\n|\r/u);
  const prefixedLines = physicalLines.filter((line) => line.length > 0);
  const hasDiffPrefixes = prefixedLines.length > 0
    && prefixedLines.every((line) => /^[ +\-]/u.test(line));
  const lines = physicalLines
    .map((line) => hasDiffPrefixes && /^[ +\-]/u.test(line) ? line.slice(1) : line)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return true;

  let plausibleLineCount = 0;

  for (const [index, line] of lines.entries()) {
    if (/^(?:Version|Comment|Proc-Type|DEK-Info|Hash):\s+/i.test(line)) {
      plausibleLineCount++;
      continue;
    }
    if (/^=[A-Za-z0-9+/]{4}$/.test(line)) {
      plausibleLineCount++;
      continue;
    }
    if (line === '...' || line === '…') {
      plausibleLineCount++;
      continue;
    }

    // PEM bodies may end with one short, padded Base64 quantum.
    if (
      index === lines.length - 1
      && plausibleLineCount > 0
      && line.length >= 4
      && line.length < 12
      && line.length % 4 === 0
      && /^[A-Za-z0-9+/]*={0,2}$/.test(line)
    ) {
      plausibleLineCount++;
      continue;
    }

    // Reject short command words like shutdown, reboot, rm, cat.
    if (/^[a-z_]{1,15}$/i.test(line)) {
      return false;
    }

    if (/^[A-Za-z0-9+/=]{12,}(?:\.{3}|…)?$/.test(line)) {
      plausibleLineCount++;
      continue;
    }

    return false;
  }

  return plausibleLineCount > 0;
}

function redactPrivateKeyBlocks(text: string): string {
  const blockRegex = /-----BEGIN ([^\r\n]*PRIVATE KEY[^\r\n]*)-----([\s\S]*?)-----END \1-----/giu;
  const exactRedacted = text.replace(blockRegex, (match, _label, body) => {
    if (typeof body === 'string' && isPlausibleArmoredKeyBody(body)) {
      return '[REDACTED]';
    }
    return match;
  });
  const mismatchedBlockRegex = /-----BEGIN [^\r\n]*PRIVATE KEY[^\r\n]*-----([\s\S]*?)-----END [^\r\n]*PRIVATE KEY[^\r\n]*-----/giu;
  return exactRedacted.replace(mismatchedBlockRegex, (match, body) =>
    typeof body === 'string' && isPlausibleArmoredKeyBody(body) ? '[REDACTED]' : match);
}

function redactUrlPasswords(
  text: string,
  isTruncatedTail = false,
  scanMetrics?: RedactionScanMetrics,
): string {
  const isWordCharacter = (character: string): boolean => /[a-z0-9_]/iu.test(character);
  const isSchemeCharacter = (character: string): boolean => /[a-z0-9+.-]/iu.test(character);
  const isUsernameCharacter = (character: string): boolean => /[a-z0-9_.!$&'()*+,;=+\-~]/iu.test(character);
  let result = '';
  let cursor = 0;
  let candidateStart = -1;

  for (let index = 0; index < text.length; index++) {
    const character = text[index] ?? '';
    if (scanMetrics !== undefined) {
      scanMetrics.urlUserinfoSchemeCharacters =
        (scanMetrics.urlUserinfoSchemeCharacters ?? 0) + 1;
    }
    if (isSchemeCharacter(character)) {
      const previous = text[index - 1] ?? '';
      if (
        candidateStart < 0
        && isWordCharacter(character) !== isWordCharacter(previous)
      ) {
        candidateStart = index;
      }
      continue;
    }
    if (
      character !== ':'
      || text[index + 1] !== '/'
      || text[index + 2] !== '/'
      || candidateStart < cursor
    ) {
      candidateStart = -1;
      continue;
    }

    let passwordStart = index + 3;
    while (passwordStart < text.length) {
      const usernameCharacter = text[passwordStart] ?? '';
      const percentEncoded = usernameCharacter === '%'
        && /^[0-9A-Fa-f]{2}$/u.test(text.slice(passwordStart + 1, passwordStart + 3));
      if (!isUsernameCharacter(usernameCharacter) && !percentEncoded) break;
      if (scanMetrics !== undefined) {
        scanMetrics.urlUserinfoSchemeCharacters =
          (scanMetrics.urlUserinfoSchemeCharacters ?? 0) + (percentEncoded ? 3 : 1);
      }
      passwordStart += percentEncoded ? 3 : 1;
    }
    if (text[passwordStart] !== ':') {
      candidateStart = -1;
      continue;
    }
    passwordStart++;
    const passwordEnd = shellValueBoundary(text, passwordStart, /[@/\s\r\n]/u);
    const hasAuthority = text[passwordEnd] === '@'
      && /^@(?:\[[0-9A-Fa-f:.]+\]|(?:[A-Za-z0-9._~!$&'()*+,;=-]|%[0-9A-Fa-f]{2})+)(?::[0-9]+)?(?=[/"'\s?#]|$)/u
        .test(text.slice(passwordEnd));
    if (!hasAuthority && !(isTruncatedTail && passwordEnd === text.length)) {
      candidateStart = -1;
      continue;
    }
    const password = text.slice(passwordStart, passwordEnd);
    if (password.length === 0) {
      candidateStart = -1;
      continue;
    }
    result += text.slice(cursor, candidateStart);
    result += `${text.slice(candidateStart, passwordStart)}${
      isShellExpression(password) ? redactPasswordLiteralFragments(password) : '[REDACTED]'
    }`;
    cursor = passwordEnd;
    index = passwordStart - 1;
    candidateStart = -1;
  }
  return result + text.slice(cursor);
}

function enclosingShellQuoteAt(text: string, position: number): '"' | "'" | undefined {
  const scanStart = Math.max(
    text.lastIndexOf('\n', position - 1) + 1,
    text.lastIndexOf('\r', position - 1) + 1,
    position - MAX_SENSITIVE_ARRAY_BODY_LENGTH,
  );
  const prefix = text.slice(scanStart, position);
  const expressionSpans = shellExpressionSpans(prefix);
  let spanIndex = 0;
  let quote: '"' | "'" | undefined;

  for (let index = 0; index < prefix.length; index++) {
    while ((expressionSpans[spanIndex]?.[1] ?? prefix.length + 1) <= index) spanIndex++;
    const activeSpan = expressionSpans[spanIndex];
    if (
      quote !== "'"
      && activeSpan !== undefined
      && index === activeSpan[0]
    ) {
      index = activeSpan[1] - 1;
      continue;
    }
    const character = prefix[index];
    if (quote === "'") {
      if (character === "'") quote = undefined;
    } else if (character === '\\') {
      index++;
    } else if (quote === '"') {
      if (character === '"') quote = undefined;
    } else if (
      character === "'"
      && /[A-Za-z0-9]/u.test(prefix[index - 1] ?? '')
      && /[A-Za-z0-9]/u.test(prefix[index + 1] ?? '')
      && prefix.indexOf("'", index + 1) < 0
    ) {
      continue;
    } else if (character === '"' || character === "'") {
      quote = character;
    }
  }
  return quote;
}

function shellWordEnd(
  text: string,
  start: number,
  structuralBoundary: RegExp,
  initialQuote?: '"' | "'",
): number {
  const candidateEnd = shellValueBoundary(
    text,
    start,
    initialQuote === '"' ? /["\r\n]/u : /[\r\n]/u,
  );
  const candidate = text.slice(start, candidateEnd);
  const expressionSpans = shellExpressionSpans(candidate);
  let expressionIndex = 0;
  let quote: '"' | "'" | undefined;
  let ansiCQuote = false;

  for (let index = 0; index < candidate.length; index++) {
    while ((expressionSpans[expressionIndex]?.[1] ?? candidate.length + 1) <= index) {
      expressionIndex++;
    }
    const expression = expressionSpans[expressionIndex];
    if (quote !== "'" && expression !== undefined && expression[0] === index) {
      index = expression[1] - 1;
      continue;
    }
    const character = candidate[index];
    if (quote === "'") {
      if (ansiCQuote && character === '\\') {
        index++;
      } else if (character === "'") {
        quote = undefined;
        ansiCQuote = false;
      }
    } else if (character === '\\') {
      index++;
    } else if (quote === '"') {
      if (character === '"') quote = undefined;
    } else if (character === '$' && candidate[index + 1] === "'") {
      quote = "'";
      ansiCQuote = true;
      index++;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (
      structuralBoundary.test(character ?? '')
      || (initialQuote === undefined && /[\s;|<>]/u.test(character ?? ''))
    ) {
      return start + index;
    }
  }
  return candidateEnd;
}

function redactShellWordLiteralFragments(word: string): string {
  const expressionSpans = shellExpressionSpans(word);
  let expressionIndex = 0;
  let result = '';
  let literal = '';
  let quote: '"' | "'" | undefined;
  let ansiCQuote = false;
  const flushLiteral = (): void => {
    if (literal.length > 0) result += '[REDACTED]';
    literal = '';
  };

  for (let index = 0; index < word.length; index++) {
    while ((expressionSpans[expressionIndex]?.[1] ?? word.length + 1) <= index) {
      expressionIndex++;
    }
    const expression = expressionSpans[expressionIndex];
    if (quote !== "'" && expression !== undefined && expression[0] === index) {
      flushLiteral();
      result += word.slice(expression[0], expression[1]);
      index = expression[1] - 1;
      continue;
    }
    const character = word[index] ?? '';
    if (quote === "'") {
      if (ansiCQuote && character === '\\') {
        literal += character + (word[index + 1] ?? '');
        index++;
      } else if (character === "'") {
        flushLiteral();
        result += character;
        quote = undefined;
        ansiCQuote = false;
      } else {
        literal += character;
      }
    } else if (quote === '"') {
      if (character === '"') {
        flushLiteral();
        result += character;
        quote = undefined;
      } else {
        literal += character;
      }
    } else if (character === '$' && word[index + 1] === "'") {
      flushLiteral();
      result += "$'";
      quote = "'";
      ansiCQuote = true;
      index++;
    } else if (character === '"' || character === "'") {
      flushLiteral();
      result += character;
      quote = character;
    } else {
      literal += character;
    }
  }
  flushLiteral();
  return result;
}

function boundedClosingShellQuoteIndex(
  value: string,
  start: number,
  quote: '"' | "'",
  escapeAware: boolean,
): number {
  const scanEnd = Math.min(value.length, start + MAX_SENSITIVE_ARRAY_BODY_LENGTH);
  for (let index = start; index < scanEnd; index++) {
    if (escapeAware && value[index] === '\\') {
      index++;
    } else if (value[index] === quote) {
      return index;
    }
  }
  return -1;
}

function hasUnquotedFirstShellWordConcatenation(value: string): boolean {
  const expressionSpans = shellExpressionSpans(value);
  let expressionIndex = 0;
  for (let index = 0; index < value.length; index++) {
    while ((expressionSpans[expressionIndex]?.[1] ?? value.length + 1) <= index) {
      expressionIndex++;
    }
    const expression = expressionSpans[expressionIndex];
    if (expression !== undefined && expression[0] === index) {
      if (index > 0 || expression[1] < value.length) return true;
      index = expression[1] - 1;
    } else if (value[index] === '\\') {
      index++;
    } else if (index > 0 && (value[index] === '"' || value[index] === "'")) {
      return true;
    }
  }
  return false;
}

const MAX_URL_PREFIX_LENGTH = 65_536;

function hasBoundedUrlPrefix(text: string, end: number): boolean {
  const start = Math.max(0, end - MAX_URL_PREFIX_LENGTH);
  const prefix = /(^|[\s"'=(])[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s"'#]*$/u
    .exec(text.slice(start, end));
  return prefix !== null && (prefix[1] !== '' || start === 0);
}

function redactUrlQueryParams(text: string): string {
  const parameterStart = /([?&#])((?:[A-Za-z0-9_.-]|%[0-9A-Fa-f]{2})+)(=)/giu;
  let result = '';
  let cursor = 0;
  for (const match of text.matchAll(parameterStart)) {
    const key = match[2];
    if (key === undefined || match.index < cursor) continue;
    if (
      match[1] === '#'
      && !hasBoundedUrlPrefix(text, match.index)
    ) continue;
    let classifiedKey = key;
    try {
      classifiedKey = decodeURIComponent(key);
    } catch {
      // The regex accepts only complete bytes, but malformed UTF-8 remains non-sensitive.
    }
    if (!isSensitiveKeyToken(classifiedKey)) continue;
    const valueStart = match.index + match[0].length;
    const enclosingQuote = enclosingShellQuoteAt(text, valueStart);
    const quote = enclosingQuote === undefined
      && (text[valueStart] === '"' || text[valueStart] === "'")
      ? text[valueStart]
      : undefined;
    const wordEnd = shellWordEnd(text, valueStart, /[&\r\n#]/u, enclosingQuote);
    let valueEnd = wordEnd;
    let concatenatedWord = false;
    let unmatchedQuote = false;
    if (quote !== undefined) {
      const scanEnd = Math.min(text.length, valueStart + 1 + MAX_SENSITIVE_ARRAY_BODY_LENGTH);
      let hasClosingQuote = false;
      for (let index = valueStart + 1; index < scanEnd; index++) {
        if (quote === '"' && text[index] === '\\') {
          index++;
        } else if (text[index] === quote) {
          valueEnd = index + 1;
          hasClosingQuote = true;
          if (valueEnd < wordEnd) {
            valueEnd = wordEnd;
            concatenatedWord = true;
          }
          break;
        }
      }
      if (!hasClosingQuote) {
        unmatchedQuote = true;
        const carriageReturn = text.indexOf('\r', valueStart);
        const lineFeed = text.indexOf('\n', valueStart);
        valueEnd = Math.min(
          carriageReturn < 0 ? text.length : carriageReturn,
          lineFeed < 0 ? text.length : lineFeed,
        );
      }
    } else if (enclosingQuote === '"') {
      valueEnd = wordEnd;
    } else if (enclosingQuote !== undefined) {
      valueEnd = shellValueBoundary(
        text,
        valueStart,
        /[&'#]/u,
      );
    }
    const value = text.slice(valueStart, valueEnd);
    const content = quote !== undefined && value.endsWith(quote)
      ? value.slice(1, -1)
      : value;
    result += text.slice(cursor, match.index);
    result += `${match[1] as string}${key}${match[3] as string}${
      unmatchedQuote
        ? '[REDACTED]'
        : quote !== undefined && value.endsWith(quote) && !concatenatedWord
        ? `${quote}${
          quote === '"' && isShellExpression(content)
            ? redactPasswordLiteralFragments(content)
            : '[REDACTED]'
        }${quote}`
        : enclosingQuote === "'"
          ? '[REDACTED]'
          : enclosingQuote === '"' && !isShellExpression(value)
            ? '[REDACTED]'
          : redactShellWordLiteralFragments(value)
    }`;
    cursor = valueEnd;
  }
  return result + text.slice(cursor);
}

function redactCurlUserCredentials(text: string): string {
  const curlUserRegex = /(--user|--proxy-user|-u|-U)(\s+|=)(?:\$'([^:'\r\n]*:)((?:\\.|[^'\\\r\n])*)'|"([^:"\r\n]*:)((?:\\.|[^"\\\r\n])*)"|'([^:'\r\n]*:)([^'\r\n]*)'|([^:\s"'\r\n]*:)([^\s"'\r\n&|><;]+))/giu;
  const concatenatedStart = /(--user|--proxy-user|-u|-U)(\s+|=)([^:\s"'\r\n]+:)(?=["'$])/giu;
  let concatenatedResult = '';
  let concatenatedCursor = 0;
  for (const match of text.matchAll(concatenatedStart)) {
    if (match.index < concatenatedCursor) continue;
    const passwordStart = match.index + match[0].length;
    const passwordEnd = shellWordEnd(text, passwordStart, /[\r\n]/u);
    const password = text.slice(passwordStart, passwordEnd);
    if (!/["']|\$\(/u.test(password)) continue;
    concatenatedResult += text.slice(concatenatedCursor, match.index);
    concatenatedResult += match[0] + redactShellWordLiteralFragments(password);
    concatenatedCursor = passwordEnd;
  }
  let result = concatenatedResult + text.slice(concatenatedCursor);
  const attachedStart = /(?<![-A-Za-z0-9])(-[uU])([^:\s"'\r\n]+:)/gu;
  let attachedResult = '';
  let attachedCursor = 0;
  for (const match of result.matchAll(attachedStart)) {
    if (match.index < attachedCursor) continue;
    const valueStart = match.index + match[0].length;
    const valueEnd = shellValueBoundary(result, valueStart, /[\s"'\r\n&|><;]/u);
    const password = result.slice(valueStart, valueEnd);
    if (password.length === 0) continue;
    attachedResult += result.slice(attachedCursor, match.index);
    attachedResult += `${match[1] as string}${match[2] as string}${
      isShellExpression(password) ? redactPasswordLiteralFragments(password) : '[REDACTED]'
    }`;
    attachedCursor = valueEnd;
  }
  result = attachedResult + result.slice(attachedCursor);
  const bareStart = /(--user|--proxy-user|-u|-U)(\s+|=)([^:\s"'\r\n]*:)/giu;
  let output = '';
  let cursor = 0;
  for (const match of result.matchAll(bareStart)) {
    if (match.index < cursor) continue;
    const valueStart = match.index + match[0].length;
    const valueEnd = shellValueBoundary(result, valueStart, /[\s"'\r\n&|><;]/u);
    const password = result.slice(valueStart, valueEnd);
    if (!isShellExpression(password)) continue;
    output += result.slice(cursor, match.index);
    output += `${match[1] as string}${match[2] as string}${match[3] as string}${redactPasswordLiteralFragments(password)}`;
    cursor = valueEnd;
  }
  result = output + result.slice(cursor);
  result = result.replace(curlUserRegex, (_match, flag, separator, ansiUser, _ansiPassword, doubleUser, doublePassword, singleUser, _singlePassword, bareUser, barePassword, offset, whole) => {
    if (typeof ansiUser === 'string') return `${flag}${separator}$'${ansiUser}[REDACTED]'`;
    if (typeof doubleUser === 'string') {
      const redactedPassword = isShellExpression(doublePassword)
        ? redactPasswordLiteralFragments(doublePassword)
        : '[REDACTED]';
      return `${flag}${separator}"${doubleUser}${redactedPassword}"`;
    }
    if (typeof singleUser === 'string') return `${flag}${separator}'${singleUser}[REDACTED]'`;
    if (
      typeof barePassword === 'string'
      && typeof bareUser === 'string'
      && (
        barePassword.includes('[REDACTED]$(')
        || (
          typeof offset === 'number'
          && typeof whole === 'string'
          && shellExpressionSpans(whole.slice(offset + flag.length + separator.length + bareUser.length))[0]?.[0] === 0
        )
      )
    ) {
      return `${flag}${separator}${bareUser as string}${barePassword}`;
    }
    const redactedPassword = isShellExpression(barePassword)
      ? redactPasswordLiteralFragments(barePassword)
      : '[REDACTED]';
    return `${flag}${separator}${bareUser as string}${redactedPassword}`;
  });
  return result;
}

function boundedShellCommandEnd(text: string, start: number): number {
  const scanEnd = Math.min(text.length, start + MAX_SENSITIVE_ARRAY_BODY_LENGTH);
  const expressionSpans = shellExpressionSpans(text.slice(start, scanEnd));
  let expressionIndex = 0;
  let quote: '"' | "'" | "$'" | undefined;
  let firstQuotedNewline = -1;
  for (let index = start; index < scanEnd; index++) {
    const relativeIndex = index - start;
    while ((expressionSpans[expressionIndex]?.[1] ?? scanEnd - start + 1) <= relativeIndex) {
      expressionIndex++;
    }
    const expression = expressionSpans[expressionIndex];
    if (
      quote !== "'"
      && quote !== "$'"
      && expression !== undefined
      && expression[0] === relativeIndex
    ) {
      index = start + expression[1] - 1;
      continue;
    }
    const character = text[index];
    if (quote === "$'") {
      if (character === '\\') {
        index += text[index + 1] === '\r' && text[index + 2] === '\n' ? 2 : 1;
      } else if (character === "'") quote = undefined;
      else if (firstQuotedNewline < 0 && (character === '\r' || character === '\n')) {
        firstQuotedNewline = index;
      }
    } else if (quote === "'") {
      if (character === "'") quote = undefined;
      else if (firstQuotedNewline < 0 && (character === '\r' || character === '\n')) {
        firstQuotedNewline = index;
      }
    } else if (character === '\\') {
      index += text[index + 1] === '\r' && text[index + 2] === '\n' ? 2 : 1;
    } else if (quote === '"') {
      if (character === '"') quote = undefined;
      else if (firstQuotedNewline < 0 && (character === '\r' || character === '\n')) {
        firstQuotedNewline = index;
      }
    } else if (character === '$' && text[index + 1] === "'") {
      quote = "$'";
      index++;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (
      character === ';'
      || character === '&'
      || character === '|'
      || character === '\r'
      || character === '\n'
    ) {
      return index;
    }
  }
  return quote !== undefined && firstQuotedNewline >= 0 ? firstQuotedNewline : scanEnd;
}

function redactCurlOauth2Bearer(text: string): string {
  const commandStart = /\bcurl\b/giu;
  const option = /(\s)(--oauth2-bearer)(=|(?:[ \t]|\\(?:\r\n|\n|\r))+)(?!\\(?:\r\n|\n|\r))(\$'(?:\\.|[^'\\\r\n])*(?:'|(?=\r|\n|$))|"(?:\\.|[^"\\\r\n])*(?:"|(?=\r|\n|$))|'[^'\r\n]*(?:'|(?=\r|\n|$))|[^\s"'\r\n&|><;]+)/giu;
  const optionStart = /(\s)(--oauth2-bearer)(=|(?:[ \t]|\\(?:\r\n|\n|\r))+)(?!\\(?:\r\n|\n|\r))/giu;
  let result = '';
  let cursor = 0;

  for (const match of text.matchAll(commandStart)) {
    if (match.index < cursor) continue;
    const commandEnd = boundedShellCommandEnd(text, match.index);
    const rawCommand = text.slice(match.index, commandEnd);
    const replaceSimpleOptions = (commandSegment: string): string => commandSegment.replace(
      option,
      (_optionMatch, leadingSpace, flag, separator, argument) => {
        const value = argument as string;
        const renderedSeparator = /\\(?:\r\n|\n|\r)/u.test(separator as string)
          ? ' '
          : separator as string;
        if (value.startsWith("$'")) {
          if (value === "$'[REDACTED]'") {
            return `${leadingSpace as string}${flag as string}${renderedSeparator}${value}`;
          }
          return `${leadingSpace as string}${flag as string}${renderedSeparator}[REDACTED]`;
        }
        if (value.startsWith('"')) {
          if (!value.endsWith('"')) {
            return `${leadingSpace as string}${flag as string}${renderedSeparator}[REDACTED]`;
          }
          const content = value.slice(1, -1);
          return `${leadingSpace as string}${flag as string}${renderedSeparator}"${
            isShellExpression(content) ? redactPasswordLiteralFragments(content) : '[REDACTED]'
          }"`;
        }
        if (value.startsWith("'")) {
          return `${leadingSpace as string}${flag as string}${renderedSeparator}${
            value.endsWith("'") ? "'[REDACTED]'" : '[REDACTED]'
          }`;
        }
        return `${leadingSpace as string}${flag as string}${renderedSeparator}${
          isShellExpression(value) ? redactPasswordLiteralFragments(value) : '[REDACTED]'
        }`;
      },
    );
    let concatenatedCommand = '';
    let concatenatedCursor = 0;
    for (const optionMatch of rawCommand.matchAll(optionStart)) {
      if (optionMatch.index < concatenatedCursor) continue;
      const valueStart = optionMatch.index + optionMatch[0].length;
      const valueEnd = shellWordEnd(rawCommand, valueStart, /[\r\n&|;]/u);
      const value = rawCommand.slice(valueStart, valueEnd);
      const firstQuote = value[0];
      const ansiCQuote = value.startsWith("$'");
      const quoteStart = ansiCQuote ? 1 : 0;
      const closingQuote: '"' | "'" | undefined = ansiCQuote
        ? "'"
        : firstQuote === '"' || firstQuote === "'" ? firstQuote : undefined;
      const closingQuoteIndex = closingQuote === undefined
        ? -1
        : boundedClosingShellQuoteIndex(
          value,
          quoteStart + 1,
          closingQuote,
          ansiCQuote || closingQuote === '"',
        );
      const unquotedFirstConcatenation = !ansiCQuote
        && firstQuote !== '"'
        && firstQuote !== "'"
        && hasUnquotedFirstShellWordConcatenation(value);
      const escapedWhitespace = /\\[ \t]/u.test(value);
      const expressionSpans = shellExpressionSpans(value);
      const pureShellExpression = expressionSpans.length === 1
        && expressionSpans[0]?.[0] === 0
        && expressionSpans[0]?.[1] === value.length;
      if (
        (
          !unquotedFirstConcatenation
          && !escapedWhitespace
          && !pureShellExpression
          && closingQuote === undefined
        )
        || (
          closingQuote !== undefined
          && (closingQuoteIndex < 0 || closingQuoteIndex === value.length - 1)
        )
      ) {
        continue;
      }
      concatenatedCommand += replaceSimpleOptions(
        rawCommand.slice(concatenatedCursor, valueStart),
      );
      concatenatedCommand += redactShellWordLiteralFragments(value);
      concatenatedCursor = valueEnd;
    }
    const command = concatenatedCommand + replaceSimpleOptions(
      rawCommand.slice(concatenatedCursor),
    );
    result += text.slice(cursor, match.index) + command;
    cursor = commandEnd;
  }
  return result + text.slice(cursor);
}

function redactNestedOptionAssignments(text: string): string {
  const commandStart = /\bterraform\b/giu;
  let result = '';
  let cursor = 0;
  for (const match of text.matchAll(commandStart)) {
    if (match.index < cursor) continue;
    const commandEnd = boundedShellCommandEnd(text, match.index);
    const command = text.slice(match.index, commandEnd);
    const assignmentStart = /(-var(?:=|(?:\\(?:\r\n|\n|\r)|\s)+))(?!\\(?:\r\n|\n|\r))(?:(["'])([A-Za-z_][A-Za-z0-9_.-]*)=|([A-Za-z_][A-Za-z0-9_.-]*)=)/giu;
    let redactedCommand = '';
    let assignmentCursor = 0;
    for (const assignment of command.matchAll(assignmentStart)) {
      if (assignment.index < assignmentCursor) continue;
      const assignmentQuote = assignment[2];
      const key = assignment[3] ?? assignment[4];
      if (
        key === undefined
        || (
          assignmentQuote !== '"'
          && assignmentQuote !== "'"
          && assignment[1]?.toLowerCase() !== '-var='
        )
      ) continue;
      const valueStart = assignment.index + assignment[0].length;
      let valueEnd = valueStart;
      if (assignmentQuote === '"' || assignmentQuote === "'") {
        for (; valueEnd < command.length; valueEnd++) {
          if (assignmentQuote === '"' && command[valueEnd] === '\\') {
            valueEnd++;
          } else if (command[valueEnd] === assignmentQuote) {
            break;
          }
        }
        if (valueEnd >= command.length) {
          if (!isSensitiveKeyToken(key)) continue;
          redactedCommand += command.slice(assignmentCursor, assignment.index);
          redactedCommand += `${assignment[1] as string}${assignmentQuote}${key}=[REDACTED]`;
          assignmentCursor = command.length;
          break;
        }
      } else {
        valueEnd = shellValueBoundary(command, valueStart, /[\s"'\r\n&|><;]/u);
      }
      const value = command.slice(valueStart, valueEnd);
      redactedCommand += command.slice(assignmentCursor, assignment.index);
      redactedCommand += isSensitiveKeyToken(key)
        ? `${assignment[1] as string}${assignmentQuote ?? ''}${key}=${
          assignmentQuote !== "'" && isShellExpression(value)
            ? redactPasswordLiteralFragments(value)
            : '[REDACTED]'
        }${assignmentQuote ?? ''}`
        : command.slice(assignment.index, valueEnd + (assignmentQuote === undefined ? 0 : 1));
      assignmentCursor = valueEnd + (assignmentQuote === undefined ? 0 : 1);
    }
    redactedCommand += command.slice(assignmentCursor);
    result += text.slice(cursor, match.index) + redactedCommand;
    cursor = commandEnd;
  }
  result += text.slice(cursor);
  let dockerResult = '';
  let dockerCursor = 0;
  for (const dockerMatch of result.matchAll(/\bdocker\b/giu)) {
    if (dockerMatch.index < dockerCursor) continue;
    const commandEnd = boundedShellCommandEnd(result, dockerMatch.index);
    const command = result.slice(dockerMatch.index, commandEnd)
      .replace(
        /((?:^|\s)(?:--env(?:=|\s+)|-e(?:=|\s+)?))(["'])([A-Za-z_][A-Za-z0-9_.-]*)=((?:\\.|(?!\2)[^\\\r\n])*)\2/giu,
        (match, option, quote, key, value) => {
          if (!isSensitiveKeyToken(key as string)) return match;
          return `${option as string}${quote as string}${key as string}=${
            quote === '"' && isShellExpression(value as string)
              ? redactPasswordLiteralFragments(value as string)
              : '[REDACTED]'
          }${quote as string}`;
        },
      )
      .replace(
        /((?:^|\s)(?:-e|--env=))([A-Za-z_][A-Za-z0-9_.-]*)=([^\s"'\r\n&|><;]+)/giu,
      (match, option, key, value) => {
        if (!isSensitiveKeyToken(key as string)) return match;
        return `${option as string}${key as string}=${
          isShellExpression(value as string)
            ? redactPasswordLiteralFragments(value as string)
            : '[REDACTED]'
        }`;
      },
      );
    dockerResult += result.slice(dockerCursor, dockerMatch.index) + command;
    dockerCursor = commandEnd;
  }
  return dockerResult + result.slice(dockerCursor);
}

function redactMysqlAttachedPasswords(text: string): string {
  const commandStart = /\b(?:mysql|mysqldump|mysqladmin|mysqlcheck)\b/giu;
  let result = '';
  let cursor = 0;
  for (const match of text.matchAll(commandStart)) {
    if (match.index < cursor) continue;
    const commandEnd = boundedShellCommandEnd(text, match.index);
    const command = text.slice(match.index, commandEnd);
    const optionStart = /(^|\s)-p(?=[^\s"'\r\n&|><;])/gu;
    let redactedCommand = '';
    let optionCursor = 0;
    for (const option of command.matchAll(optionStart)) {
      if (option.index < optionCursor) continue;
      const valueStart = option.index + option[0].length;
      const valueEnd = shellValueBoundary(command, valueStart, /[\s"'\r\n&|><;]/u);
      const value = command.slice(valueStart, valueEnd);
      redactedCommand += command.slice(optionCursor, option.index);
      redactedCommand += `${option[1] as string}-p${
        isShellExpression(value) ? redactPasswordLiteralFragments(value) : '[REDACTED]'
      }`;
      optionCursor = valueEnd;
    }
    result += text.slice(cursor, match.index) + redactedCommand + command.slice(optionCursor);
    cursor = commandEnd;
  }
  return result + text.slice(cursor);
}

function redactAwsConfigureSetValues(text: string): string {
  const commandStart = /\baws\s+configure\s+set\s+([A-Za-z0-9_.-]+)(\s+)/giu;
  let result = '';
  let cursor = 0;
  for (const match of text.matchAll(commandStart)) {
    const key = match[1];
    if (match.index < cursor || key === undefined || !isSensitiveKeyToken(key)) continue;
    const valueStart = match.index + match[0].length;
    const commandEnd = boundedShellCommandEnd(text, match.index);
    const valueEnd = shellWordEnd(text, valueStart, /[\r\n&|;]/u);
    const value = text.slice(valueStart, Math.min(valueEnd, commandEnd));
    result += text.slice(cursor, match.index);
    result += `${match[0]}${
      isShellExpression(value) ? redactShellWordLiteralFragments(value) : '[REDACTED]'
    }`;
    cursor = Math.min(valueEnd, commandEnd);
  }
  return result + text.slice(cursor);
}

function redactNetrcPasswords(text: string): string {
  const segments = text.split(/(\r\n|\n|\r)/u);
  let inRecord = false;
  for (let index = 0; index < segments.length; index += 2) {
    const line = segments[index] ?? '';
    if (/^\s*(?:machine\s+\S+|default)(?:\s|$)/iu.test(line)) {
      inRecord = true;
    } else if (
      inRecord
      && !/^\s*(?:#.*)?$/u.test(line)
      && !/^\s*(?:login|password|account|macdef)(?:\s|$)/iu.test(line)
    ) {
      inRecord = false;
    }
    if (!inRecord) continue;
    segments[index] = line.replace(
      /(\bpassword[ \t]+)("(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[^\s"'\r\n]+)/giu,
      '$1[REDACTED]',
    );
  }
  return segments.join('');
}

type CasePhase = 'selector' | 'await-in' | 'pattern' | 'body';

function createCasePatternTracker(): (value: string, index: number) => boolean {
  const cases: Array<{ phase: CasePhase; hasPattern: boolean; mayEnd: boolean }> = [];
  let quote: '"' | "'" | undefined;
  let escaped = false;
  let word = '';
  let wordStartedAtCommandBoundary = false;
  let commandBoundary = true;
  let skippedTerminatorCharacters = 0;

  const finishWord = (): void => {
    if (word.length === 0) return;
    const activeCase = cases.at(-1);
    if (activeCase?.phase === 'selector') {
      activeCase.phase = 'await-in';
    } else if (activeCase?.phase === 'await-in' && word === 'in') {
      activeCase.phase = 'pattern';
      activeCase.hasPattern = false;
      activeCase.mayEnd = false;
    } else if (activeCase?.phase === 'pattern' && activeCase.mayEnd && word === 'esac') {
      cases.pop();
    } else if (
      activeCase?.phase === 'body'
      && wordStartedAtCommandBoundary
      && word === 'esac'
    ) {
      cases.pop();
    } else if (wordStartedAtCommandBoundary && word === 'case') {
      cases.push({ phase: 'selector', hasPattern: false, mayEnd: false });
    }
    word = '';
  };

  return (value: string, index: number): boolean => {
    const character = value[index] ?? '';
    const activeCase = cases.at(-1);

    if (skippedTerminatorCharacters > 0) {
      skippedTerminatorCharacters--;
      return false;
    }
    if (escaped) {
      word += character;
      if (activeCase?.phase === 'pattern') activeCase.hasPattern = true;
      escaped = false;
      return false;
    }
    if (character === '\\' && quote !== "'") {
      if (word.length === 0) wordStartedAtCommandBoundary = commandBoundary;
      word += character;
      escaped = true;
      commandBoundary = false;
      return false;
    }
    if (quote !== undefined) {
      word += character;
      if (activeCase?.phase === 'pattern') activeCase.hasPattern = true;
      if (character === quote) quote = undefined;
      return false;
    }
    if (character === '"' || character === "'") {
      if (word.length === 0) wordStartedAtCommandBoundary = commandBoundary;
      word += character;
      quote = character;
      commandBoundary = false;
      return false;
    }
    if (/\s/u.test(character)) {
      finishWord();
      if (character === '\r' || character === '\n') commandBoundary = true;
      return false;
    }

    const currentCase = cases.at(-1);
    if (currentCase?.phase === 'pattern') {
      if (character === '(' && !currentCase.hasPattern) {
        return true;
      } else if (character === ')' && currentCase.hasPattern) {
        finishWord();
        if (cases.at(-1) === currentCase) {
          currentCase.phase = 'body';
          currentCase.mayEnd = false;
          commandBoundary = true;
          return true;
        }
      } else if (character !== '|') {
        if (word.length === 0) wordStartedAtCommandBoundary = commandBoundary;
        word += character;
        currentCase.hasPattern = true;
        commandBoundary = false;
      }
      return false;
    }

    if (currentCase?.phase === 'body' && character === ';') {
      finishWord();
      const terminatorLength = value[index + 1] === ';' && value[index + 2] === '&'
        ? 3
        : value[index + 1] === ';' || value[index + 1] === '&' ? 2 : 0;
      if (terminatorLength > 0) {
        currentCase.phase = 'pattern';
        currentCase.hasPattern = false;
        currentCase.mayEnd = true;
        commandBoundary = true;
        skippedTerminatorCharacters = terminatorLength - 1;
        return false;
      }
    }

    if (/[;&|()]/u.test(character)) {
      finishWord();
      commandBoundary = true;
      return false;
    }
    if (word.length === 0) wordStartedAtCommandBoundary = commandBoundary;
    word += character;
    commandBoundary = false;
    return false;
  };
}

function shellExpressionSpans(val: string): Array<readonly [number, number]> {
  const spans: Array<readonly [number, number]> = [];
  for (let start = 0; start < val.length; start++) {
    let precedingBackslashes = 0;
    for (let index = start - 1; index >= 0 && val[index] === '\\'; index--) {
      precedingBackslashes++;
    }
    if (precedingBackslashes % 2 === 1) continue;
    const opener = val.slice(start, start + 2);
    if (opener === '$(' || opener === '<(' || opener === '>(') {
      const isCasePatternTerminator = createCasePatternTracker();
      let depth = 1;
      let quote: '"' | "'" | undefined;
      for (let index = start + 2; index < val.length; index++) {
        const casePatternTerminator = isCasePatternTerminator(val, index);
        if (val[index] === '\\') {
          if (index + 1 < val.length) isCasePatternTerminator(val, index + 1);
          index++;
        } else if (quote !== undefined) {
          if (val[index] === quote) quote = undefined;
        } else if (val[index] === '"' || val[index] === "'") {
          quote = val[index] as '"' | "'";
        } else if (val[index] === '(' && casePatternTerminator) {
          continue;
        } else if (val[index] === '(') {
          depth++;
        } else if (val[index] === ')' && casePatternTerminator) {
          continue;
        } else if (val[index] === ')' && --depth === 0) {
          spans.push([start, index + 1]);
          start = index;
          break;
        }
      }
    } else if (opener === '${') {
      const end = val.indexOf('}', start + 2);
      if (end >= 0) {
        spans.push([start, end + 1]);
        start = end;
      }
    } else if (val[start] === '`') {
      let end = -1;
      for (let index = start + 1; index < val.length; index++) {
        if (val[index] !== '`') continue;
        let backslashes = 0;
        for (let previous = index - 1; previous > start && val[previous] === '\\'; previous--) {
          backslashes++;
        }
        if (backslashes % 2 === 0) {
          end = index;
          break;
        }
      }
      if (end >= 0) {
        spans.push([start, end + 1]);
        start = end;
      }
    }
  }
  return spans;
}

function shellValueBoundary(text: string, start: number, boundary: RegExp): number {
  const chunkSize = 65_536;
  let isCasePatternTerminator = createCasePatternTracker();
  let expression: 'paren' | 'brace' | 'backtick' | undefined;
  let parenDepth = 0;
  let quote: '"' | "'" | undefined;
  let escaped = false;
  let openingDelimiter = false;
  let literalBackslashes = 0;
  let firstExpressionBoundary: number | undefined;

  for (let chunkStart = start; chunkStart < text.length; chunkStart += chunkSize) {
    const chunkEnd = Math.min(text.length, chunkStart + chunkSize);
    for (let index = chunkStart; index < chunkEnd; index++) {
      const character = text[index] ?? '';

      if (expression === undefined) {
        const escapedOpener = literalBackslashes % 2 === 1;
        const opener = text.slice(index, index + 2);
        if (!escapedOpener && (opener === '$(' || opener === '<(' || opener === '>(')) {
          expression = 'paren';
          isCasePatternTerminator = createCasePatternTracker();
          parenDepth = 1;
          quote = undefined;
          escaped = false;
          openingDelimiter = true;
          literalBackslashes = 0;
          firstExpressionBoundary = undefined;
          continue;
        }
        if (!escapedOpener && opener === '${') {
          expression = 'brace';
          openingDelimiter = true;
          literalBackslashes = 0;
          firstExpressionBoundary = undefined;
          continue;
        }
        if (!escapedOpener && character === '`') {
          expression = 'backtick';
          escaped = false;
          literalBackslashes = 0;
          firstExpressionBoundary = undefined;
          continue;
        }
        if (
          character === '\\'
          && literalBackslashes % 2 === 0
          && (text[index + 1] === '\n' || text[index + 1] === '\r')
        ) {
          if (text[index + 1] === '\r' && text[index + 2] === '\n') index += 2;
          else index++;
          literalBackslashes = 0;
          continue;
        }
        if (boundary.test(character)) {
          if (literalBackslashes % 2 === 0) return index;
          literalBackslashes = 0;
          continue;
        }
        literalBackslashes = character === '\\' ? literalBackslashes + 1 : 0;
        continue;
      }

      if (openingDelimiter) {
        openingDelimiter = false;
        continue;
      }
      const casePatternTerminator = expression === 'paren'
        && isCasePatternTerminator(text, index);
      if (firstExpressionBoundary === undefined && boundary.test(character)) {
        firstExpressionBoundary = index;
      }
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        continue;
      }
      if (expression === 'backtick') {
        if (character === '`') expression = undefined;
        continue;
      }
      if (expression === 'brace') {
        if (character === '}') expression = undefined;
        continue;
      }
      if (quote !== undefined) {
        if (character === quote) quote = undefined;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '(' && casePatternTerminator) {
        continue;
      } else if (character === '(') {
        parenDepth++;
      } else if (character === ')' && casePatternTerminator) {
        continue;
      } else if (character === ')' && --parenDepth === 0) {
        expression = undefined;
      }
    }
  }
  return expression !== undefined && firstExpressionBoundary !== undefined
    ? firstExpressionBoundary
    : text.length;
}

function redactHeaderLiteralFragments(val: string): string {
  const schemeNames = /^(?:Bearer|Basic|Digest|OAuth|HOBA|Mutual|Negotiate|VAPID|SCRAM-SHA-256|AWS4-HMAC-SHA256)$/i;
  const redactLiteral = (literal: string): string => literal.replace(/\S+/gu, (token) => {
    if (schemeNames.test(token)) return token;
    return '[REDACTED]';
  });

  let result = '';
  let lastIndex = 0;
  for (const [start, end] of shellExpressionSpans(val)) {
    result += redactLiteral(val.slice(lastIndex, start));
    result += val.slice(start, end);
    lastIndex = end;
  }
  return result + redactLiteral(val.slice(lastIndex));
}

function redactPasswordLiteralFragments(val: string): string {
  const redactLiteral = (literal: string): string => literal.length > 0 ? '[REDACTED]' : '';

  let result = '';
  let lastIndex = 0;
  for (const [start, end] of shellExpressionSpans(val)) {
    result += redactLiteral(val.slice(lastIndex, start));
    result += val.slice(start, end);
    lastIndex = end;
  }
  return result + redactLiteral(val.slice(lastIndex));
}

function redactArrayLiteralFragments(body: string): string {
  const redactUnquoted = (value: string): string => {
    let redacted = '';
    let lastIndex = 0;
    for (const [start, end] of shellExpressionSpans(value)) {
      redacted += value.slice(lastIndex, start).replace(/\S+/gu, '[REDACTED]');
      redacted += value.slice(start, end);
      lastIndex = end;
    }
    return redacted + value.slice(lastIndex).replace(/\S+/gu, '[REDACTED]');
  };
  let result = '';
  let cursor = 0;
  let segmentStart = 0;
  let quote: '"' | "'" | undefined;
  let escaped = false;
  const expressionSpans = shellExpressionSpans(body);
  let expressionIndex = 0;

  for (let index = 0; index < body.length; index++) {
    while ((expressionSpans[expressionIndex]?.[1] ?? body.length + 1) <= index) {
      expressionIndex++;
    }
    const expressionSpan = expressionSpans[expressionIndex];
    if (
      quote !== "'"
      && expressionSpan !== undefined
      && expressionSpan[0] === index
    ) {
      index = expressionSpan[1] - 1;
      continue;
    }
    const character = body[index];
    if (quote !== undefined) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\' && quote === '"') {
        escaped = true;
      } else if (character === quote) {
        const content = body.slice(segmentStart + 1, index);
        result += redactUnquoted(body.slice(cursor, segmentStart));
        result += quote === "'"
          ? `'${content.length > 0 ? '[REDACTED]' : ''}'`
          : `"${redactPasswordLiteralFragments(content)}"`;
        cursor = index + 1;
        quote = undefined;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
      segmentStart = index;
    }
  }

  result += redactUnquoted(body.slice(cursor));
  return result;
}

const MAX_SENSITIVE_ARRAY_BODY_LENGTH = 65_536;

function isAlreadyRedactedStructuredValue(text: string, start: number): boolean {
  if (text[start] !== '[' && text[start] !== '{') return false;
  const boundedText = text.slice(0, Math.min(text.length, start + MAX_SENSITIVE_ARRAY_BODY_LENGTH + 1));
  const end = balancedStructuredValueEnd(boundedText, start);
  return end !== undefined && text.slice(start, end).includes('[REDACTED]');
}

function redactSensitiveArrayAssignments(text: string): string {
  const assignmentStart = /(?:^|[\s{,;(])([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)\s*(?:\+=|[:=])\s*\(/gmu;
  let result = '';
  let cursor = 0;

  for (const match of text.matchAll(assignmentStart)) {
    const key = match[1];
    if (key === undefined || !isSensitiveKeyToken(key) || match.index < cursor) continue;
    const openingIndex = match.index + match[0].length - 1;
    let depth = 1;
    let quote: '"' | "'" | undefined;
    let escaped = false;
    let closingIndex = -1;
    const bodyStart = openingIndex + 1;
    const scanEnd = Math.min(
      text.length,
      bodyStart + MAX_SENSITIVE_ARRAY_BODY_LENGTH + 1,
    );
    for (let index = bodyStart; index < scanEnd; index++) {
      const character = text[index];
      if (quote !== undefined) {
        if (escaped) escaped = false;
        else if (character === '\\' && quote === '"') escaped = true;
        else if (character === quote) quote = undefined;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '\\') {
        index++;
      } else if (character === '(') {
        depth++;
      } else if (character === ')' && --depth === 0) {
        closingIndex = index;
        break;
      }
    }
    if (closingIndex < 0) continue;
    result += text.slice(cursor, openingIndex + 1);
    const body = text.slice(openingIndex + 1, closingIndex);
    result += /[\r\n]/u.test(body) || isShellExpression(body)
      ? redactArrayLiteralFragments(body)
      : '[REDACTED]';
    result += ')';
    cursor = closingIndex + 1;
  }
  return result + text.slice(cursor);
}

export interface RedactionScanMetrics {
  mixedShellWordExpressionScans: number;
  urlUserinfoSchemeCharacters?: number;
}

function redactMixedShellWordAssignments(
  text: string,
  scanMetrics?: RedactionScanMetrics,
): string {
  const assignmentStart = /(?:^|[\s{,;(])([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)\s*(?:\+=|[:=])\s*(?=\S)/gmu;
  let result = '';
  let cursor = 0;

  for (const match of text.matchAll(assignmentStart)) {
    const key = match[1];
    if (key === undefined || !isSensitiveKeyToken(key) || match.index < cursor) continue;
    const valueStart = match.index + match[0].length;
    if (text.startsWith('"""', valueStart) || text.startsWith("'''", valueStart)) continue;
    if (isAlreadyRedactedStructuredValue(text, valueStart)) continue;
    if (text[valueStart] === '(') continue;
    const scanEnd = Math.min(text.length, valueStart + MAX_SENSITIVE_ARRAY_BODY_LENGTH);
    if (scanMetrics !== undefined) scanMetrics.mixedShellWordExpressionScans++;
    const spans = shellExpressionSpans(text.slice(valueStart, scanEnd));
    let spanIndex = 0;
    let quote: '"' | "'" | undefined;
    let escaped = false;
    let valueEnd = scanEnd;

    for (let index = valueStart; index < scanEnd; index++) {
      const span = spans[spanIndex];
      if (span?.[0] === index - valueStart && quote !== "'") {
        index = valueStart + span[1] - 1;
        spanIndex++;
        continue;
      }
      const character = text[index] ?? '';
      if (character === '\r' || character === '\n') {
        valueEnd = index;
        break;
      } else if (escaped) {
        escaped = false;
      } else if (character === '\\' && quote !== "'") {
        escaped = true;
      } else if (quote !== undefined) {
        if (character === quote) quote = undefined;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (/[\s;&|<>{}]/u.test(character)) {
        valueEnd = index;
        break;
      }
    }

    if (valueEnd === scanEnd && scanEnd < text.length) {
      const carriageReturn = text.indexOf('\r', scanEnd);
      const lineFeed = text.indexOf('\n', scanEnd);
      const physicalLineEnd = Math.min(
        carriageReturn < 0 ? text.length : carriageReturn,
        lineFeed < 0 ? text.length : lineFeed,
      );
      result += text.slice(cursor, match.index);
      result += match[0] + '[REDACTED]';
      cursor = physicalLineEnd;
      continue;
    }

    const value = text.slice(valueStart, valueEnd);
    let hasQuotedSegment = false;
    let hasUnquotedLiteral = false;
    let segmentQuote: '"' | "'" | undefined;
    let segmentEscaped = false;
    for (let index = 0; index < value.length; index++) {
      const character = value[index] ?? '';
      if (segmentEscaped) {
        if (segmentQuote === undefined) hasUnquotedLiteral = true;
        segmentEscaped = false;
      } else if (character === '\\' && segmentQuote !== "'") {
        segmentEscaped = true;
      } else if (segmentQuote !== undefined) {
        if (character === segmentQuote) segmentQuote = undefined;
      } else if (character === '$' && value[index + 1] === "'") {
        hasQuotedSegment = true;
        segmentQuote = "'";
        index++;
      } else if (character === '"' || character === "'") {
        hasQuotedSegment = true;
        segmentQuote = character;
      } else {
        hasUnquotedLiteral = true;
      }
    }
    if (!hasQuotedSegment || !hasUnquotedLiteral) continue;
    result += text.slice(cursor, match.index);
    result += match[0] + redactArrayLiteralFragments(value);
    cursor = valueEnd;
  }
  return result + text.slice(cursor);
}

function redactBashArrayElementAssignments(text: string): string {
  const assignmentStart = /(?:^|[\s{,;(])([A-Za-z_][A-Za-z0-9_]*)\[("[A-Za-z0-9_.-]{1,256}"|'[A-Za-z0-9_.-]{1,256}'|[A-Za-z0-9_.-]{1,256})\](\s*(?:\+=|=)\s*)/gmu;
  let result = '';
  let cursor = 0;

  for (const match of text.matchAll(assignmentStart)) {
    const base = match[1];
    const subscript = match[2];
    if (base === undefined || subscript === undefined || match.index < cursor) continue;
    const classifiedSubscript = subscript.replace(/^["']|["']$/gu, '');
    if (!isSensitiveKeyToken(base) && !isSensitiveKeyToken(classifiedSubscript)) continue;
    const valueStart = match.index + match[0].length;
    const quote = text[valueStart] === '"' || text[valueStart] === "'"
      ? text[valueStart]
      : undefined;
    const contentStart = quote === undefined ? valueStart : valueStart + 1;
    const valueEnd = shellValueBoundary(
      text,
      contentStart,
      quote === undefined ? /[\s"';}\r\n&|><]/u : new RegExp(`[${quote}\\r\\n]`, 'u'),
    );
    const hasClosingQuote = quote !== undefined && text[valueEnd] === quote;
    const value = text.slice(contentStart, valueEnd);
    result += text.slice(cursor, match.index) + match[0];
    result += quote === "'"
      ? `'[REDACTED]${hasClosingQuote ? "'" : ''}`
      : quote === '"'
        ? `"${isShellExpression(value) ? redactPasswordLiteralFragments(value) : '[REDACTED]'}${hasClosingQuote ? '"' : ''}`
        : isShellExpression(value) ? redactPasswordLiteralFragments(value) : '[REDACTED]';
    cursor = valueEnd + (hasClosingQuote ? 1 : 0);
  }
  return result + text.slice(cursor);
}

function redactEscapedDoubleQuotedAssignments(text: string): string {
  const assignmentStart = /((\\+)"(.*?)\2"\s*:\s*\2")/gu;
  const maxValueLength = 65_536;
  let result = '';
  let cursor = 0;

  for (const match of text.matchAll(assignmentStart)) {
    const key = match[3];
    if (key === undefined || !isSensitiveKeyToken(key) || match.index < cursor) continue;
    const valueStart = match.index + match[0].length;
    const scanEnd = Math.min(
      text.length,
      valueStart + maxValueLength,
      ...['\r', '\n']
        .map((newline) => text.indexOf(newline, valueStart))
        .filter((index) => index >= 0),
    );
    let closingStart = -1;
    const openingSlashCount = match[2]?.length ?? 0;

    for (let index = valueStart; index < scanEnd; index++) {
      if (text[index] !== '"') continue;
      let slashCount = 0;
      for (let slashIndex = index - 1; slashIndex >= valueStart && text[slashIndex] === '\\'; slashIndex--) {
        slashCount++;
      }
      if (slashCount === openingSlashCount) {
        closingStart = index - slashCount;
        break;
      }
    }

    if (closingStart < 0) continue;
    const value = text.slice(valueStart, closingStart);
    result += text.slice(cursor, match.index);
    result += `${match[1]}${
      isShellExpression(value) ? redactPasswordLiteralFragments(value) : '[REDACTED]'
    }${text.slice(closingStart, closingStart + openingSlashCount + 1)}`;
    cursor = closingStart + openingSlashCount + 1;
  }

  return result + text.slice(cursor);
}

const SENSITIVE_HEADER_NAMES = '(?:Authorization|Cookie|Set-Cookie|Proxy-Authorization|X-API-Key|API-Key|X-Auth-Token)';
const MAX_STRUCTURED_HEADER_OBJECT_LENGTH = 65_536;
const MAX_STRUCTURED_HEADER_OBJECT_DEPTH = 64;

function containsSensitiveHeaderLabel(object: string): boolean {
  return new RegExp(
    `["'](?:name|key)["']\\s*:\\s*["']${SENSITIVE_HEADER_NAMES}["']`,
    'iu',
  ).test(object);
}

function balancedStructuredValueEnd(value: string, start: number): number | undefined {
  const opening = value[start];
  if (opening !== '[' && opening !== '{') return undefined;
  const stack = [opening];
  let quote: '"' | "'" | undefined;
  let escaped = false;
  const scanEnd = Math.min(value.length, start + MAX_STRUCTURED_HEADER_OBJECT_LENGTH);

  for (let index = start + 1; index < scanEnd; index++) {
    const character = value[index];
    if (quote !== undefined) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '[' || character === '{') {
      if (stack.length >= MAX_STRUCTURED_HEADER_OBJECT_DEPTH) return undefined;
      stack.push(character);
      continue;
    }
    if (character !== ']' && character !== '}') continue;
    const expectedOpening = character === ']' ? '[' : '{';
    if (stack.pop() !== expectedOpening) return undefined;
    if (stack.length === 0) return index + 1;
  }
  return undefined;
}

function balancedTomlCollectionEnd(value: string, start: number): number | undefined {
  const opening = value[start];
  if (opening !== '[' && opening !== '{') return undefined;
  const stack = [opening];
  let quote: '"' | "'" | undefined;
  let escaped = false;
  let lineComment = false;
  const scanEnd = Math.min(value.length, start + MAX_STRUCTURED_HEADER_OBJECT_LENGTH);

  for (let index = start + 1; index < scanEnd; index++) {
    const character = value[index];
    if (lineComment) {
      if (character === '\r' || character === '\n') lineComment = false;
      continue;
    }
    if (quote !== undefined) {
      if (quote === '"' && escaped) {
        escaped = false;
      } else if (quote === '"' && character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === '#') {
      lineComment = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '[' || character === '{') {
      if (stack.length >= MAX_STRUCTURED_HEADER_OBJECT_DEPTH) return undefined;
      stack.push(character);
      continue;
    }
    if (character !== ']' && character !== '}') continue;
    const expectedOpening = character === ']' ? '[' : '{';
    if (stack.pop() !== expectedOpening) return undefined;
    if (stack.length === 0) return index + 1;
  }
  return undefined;
}

function redactCompleteStructuredHeaderObject(object: string): string {
  const depthAt = new Uint8Array(object.length);
  let depth = 0;
  let quote: '"' | "'" | undefined;
  let escaped = false;

  for (let index = 0; index < object.length; index++) {
    depthAt[index] = depth;
    const character = object[index];
    if (quote !== undefined) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '{') {
      depth++;
    } else if (character === '}') {
      depth--;
    }
  }

  const headerProperty = new RegExp(`["'](?:name|key)["']\\s*:\\s*["']${SENSITIVE_HEADER_NAMES}["']`, 'giu');
  const hasDirectSensitiveHeader = [...object.matchAll(headerProperty)]
    .some((match) => depthAt[match.index] === 1);
  if (!hasDirectSensitiveHeader) return object;

  const valueProperty = /(["']value["']\s*:\s*)("(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null)/giu;
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  for (const match of object.matchAll(valueProperty)) {
    if (depthAt[match.index] !== 1) continue;
    const prefix = match[1] as string;
    const value = match[2] as string;
    const quote = value[0] === '"' || value[0] === "'" ? value[0] : '';
    const content = quote === '' ? value : value.slice(1, -1);
    replacements.push({
      start: match.index,
      end: match.index + match[0].length,
      value: `${prefix}${quote}${
        quote !== "'" && isShellExpression(content)
          ? redactPasswordLiteralFragments(content)
          : '[REDACTED]'
      }${quote}`,
    });
  }
  const collectionProperty = /(["']value["']\s*:\s*)(?=[\[{])/giu;
  for (const match of object.matchAll(collectionProperty)) {
    if (depthAt[match.index] !== 1) continue;
    const prefix = match[1] as string;
    const valueStart = match.index + match[0].length;
    const valueEnd = balancedStructuredValueEnd(object, valueStart);
    if (valueEnd === undefined) continue;
    const value = object.slice(valueStart, valueEnd);
    replacements.push({
      start: match.index,
      end: valueEnd,
      value: `${prefix}${
        isShellExpression(value) ? redactJsonCollectionLiteralFragments(value) : '"[REDACTED]"'
      }`,
    });
  }

  let result = '';
  let cursor = 0;
  for (const replacement of replacements.sort((left, right) => left.start - right.start)) {
    result += object.slice(cursor, replacement.start) + replacement.value;
    cursor = replacement.end;
  }
  return result + object.slice(cursor);
}

function redactBalancedStructuredHeaderObjects(text: string): string {
  let result = '';
  let objectStart = -1;
  let depth = 0;
  let quote: '"' | "'" | undefined;
  let escaped = false;
  let withinBounds = true;
  let cursor = 0;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];

    if (quote !== undefined) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (depth > 0 && (character === '"' || character === "'")) {
      quote = character;
      continue;
    }

    if (character === '{') {
      if (depth === 0) {
        objectStart = index;
        withinBounds = true;
      }
      depth++;
      if (
        depth > MAX_STRUCTURED_HEADER_OBJECT_DEPTH
        || (objectStart >= 0 && index - objectStart >= MAX_STRUCTURED_HEADER_OBJECT_LENGTH)
      ) {
        withinBounds = false;
      }
      continue;
    }

    if (character !== '}' || depth === 0) {
      if (
        depth > 0
        && objectStart >= 0
        && index - objectStart >= MAX_STRUCTURED_HEADER_OBJECT_LENGTH
      ) {
        withinBounds = false;
      }
      continue;
    }

    depth--;
    if (depth !== 0 || objectStart < 0) continue;

    const objectEnd = index + 1;
    const object = text.slice(objectStart, objectEnd);
    result += text.slice(cursor, objectStart);
    result += withinBounds
      ? redactCompleteStructuredHeaderObject(object)
      : containsSensitiveHeaderLabel(object) ? '[REDACTED]' : object;
    cursor = objectEnd;
    objectStart = -1;
  }

  if (objectStart >= 0) {
    const remainder = text.slice(objectStart);
    const redactedRemainder = withinBounds
      ? redactCompleteStructuredHeaderObject(remainder)
      : containsSensitiveHeaderLabel(remainder) ? '[REDACTED]' : remainder;
    return result + text.slice(cursor, objectStart) + redactedRemainder;
  }
  return result + text.slice(cursor);
}

function redactStructuredHeaders(text: string): string {
  let result = redactBalancedStructuredHeaderObjects(text);

  const tupleHeader = new RegExp(
    `(\\[\\s*)(["'])(${SENSITIVE_HEADER_NAMES})\\2(\\s*,\\s*)(["'])((?:\\\\.|(?!\\5)[^\\\\\\r\\n])*)\\5`,
    'giu',
  );
  result = result.replace(
    tupleHeader,
    (_match, open, headerQuote, headerName, separator, valueQuote, value) =>
      `${open}${headerQuote}${headerName}${headerQuote}${separator}${valueQuote}${
        valueQuote !== "'" && isShellExpression(value)
          ? redactPasswordLiteralFragments(value)
          : '[REDACTED]'
      }${valueQuote}`,
  );

  return result;
}

function redactAuthorizationHeaders(text: string): string {
  let result = text;

  const headers = SENSITIVE_HEADER_NAMES;

  // Cookie separators are header syntax, not shell boundaries, on standalone lines.
  result = result.replace(
    /(^|\r\n|\n|\r)(\s*(?:[+-]\s*)?Cookie\s*:\s*)[^;\s=&|<>]+\s*=\s*(?:"(?:\\.|[^"\\\r\n])*"|[^;\s&|<>]*)(?:;\s*[^;\s=&|<>]+\s*=\s*(?:"(?:\\.|[^"\\\r\n])*"|[^;\s&|<>]*))*/giu,
    (match, lineStart, prefix, offset, whole) => {
      const lineEndMatch = (whole as string).slice(offset as number).search(/[\r\n]/u);
      const lineEnd = lineEndMatch < 0 ? (whole as string).length : (offset as number) + lineEndMatch;
      if (isShellExpression((whole as string).slice((offset as number) + (lineStart as string).length + (prefix as string).length, lineEnd))) {
        return match;
      }
      return `${lineStart as string}${prefix as string}[REDACTED]`;
    },
  );

  // 1. Standalone header lines at start of line: Authorization: Basic foo.
  // Shell operators only end the value when they are outside a balanced substitution.
  const standaloneHeader = new RegExp(`^(\\s*(?:[+-]\\s*)?${headers}\\s*:\\s*)`, 'iu');
  result = result.replace(/(^|\r\n|\n|\r)([^\r\n]*)/gu, (_match, lineStart, line) => {
    const headerMatch = (line as string).match(standaloneHeader);
    const prefix = headerMatch?.[1];
    if (prefix === undefined) {
      return `${lineStart as string}${line as string}`;
    }
    const valueAndContext = (line as string).slice(prefix.length);
    const spans = shellExpressionSpans(valueAndContext);
    let valueEnd = valueAndContext.length;
    let spanIndex = 0;
    for (let index = 0; index < valueAndContext.length; index++) {
      while ((spans[spanIndex]?.[1] ?? valueAndContext.length + 1) <= index) spanIndex++;
      const activeSpan = spans[spanIndex];
      if (activeSpan !== undefined && index >= activeSpan[0] && index < activeSpan[1]) continue;
      if (
        valueAndContext.startsWith('&&', index)
        || valueAndContext.startsWith('||', index)
        || /[&|><;]/u.test(valueAndContext[index] ?? '')
      ) {
        valueEnd = index;
        while (valueEnd > 0 && /[ \t]/u.test(valueAndContext[valueEnd - 1] ?? '')) valueEnd--;
        break;
      }
    }
    const val = valueAndContext.slice(0, valueEnd);
    const redactedVal = isShellExpression(val) ? redactHeaderLiteralFragments(val) : '[REDACTED]';
    return `${lineStart as string}${prefix}${redactedVal}${valueAndContext.slice(valueEnd)}`;
  });

  // 2. Single quoted POSIX shell header argument: stops at first single quote
  result = result.replace(
    new RegExp(`(')(${headers}\\s*:\\s*)(?:(?!\\\[REDACTED\\\])[^']*')`, 'giu'),
    '$1$2[REDACTED]\'',
  );

  // 3. Double quoted shell header argument with escaped quotes support
  result = result.replace(
    new RegExp(`(")(${headers}\\s*:\\s*)((?:(?!\\\[REDACTED\\\])(?:\\\\(?:\\r\\n|[\\r\\n]|.)|[^"\\\\])+))\\1`, 'giu'),
    (match, quote, prefix, val) => {
      if (typeof val === 'string' && isShellExpression(val)) {
        const redactedVal = redactHeaderLiteralFragments(val);
        return `${quote}${prefix}${redactedVal}${quote}`;
      }
      return `${quote}${prefix}[REDACTED]${quote}`;
    },
  );

  // 4. Unterminated double quoted header in command: "Authorization: ...
  result = result.replace(
    new RegExp(`(")(${headers}\\s*:\\s*)(?!\\s*\\\[REDACTED\\\])([^"\\r\\n]+)$`, 'gimu'),
    (match, quote, prefix, val) => {
      if (typeof val === 'string' && isShellExpression(val)) {
        const redactedVal = redactHeaderLiteralFragments(val);
        return `${quote}${prefix}${redactedVal}"`;
      }
      return `${quote}${prefix}[REDACTED]"`;
    },
  );

  // 5. Unterminated single quoted header in command: 'Authorization: ...
  result = result.replace(
    new RegExp(`(')(${headers}\\s*:\\s*)(?!\\s*\\\[REDACTED\\\])([^'\\r\\n]+)$`, 'gimu'),
    '$1$2[REDACTED]\'',
  );

  // 6. Inline unquoted header argument: Authorization:val, Cookie:val, etc.
  const inlineHeaderStart = new RegExp(`(?<!["'])(\\b${headers}\\s*:\\s*)`, 'giu');
  let inlineResult = '';
  let inlineCursor = 0;
  for (const match of result.matchAll(inlineHeaderStart)) {
    if (match.index < inlineCursor) continue;
    const valueStart = match.index + match[0].length;
    const valueEnd = shellValueBoundary(result, valueStart, /[\s"'\r\n&|><;]/u);
    const value = result.slice(valueStart, valueEnd);
    if (!isShellExpression(value)) continue;
    inlineResult += result.slice(inlineCursor, match.index);
    inlineResult += `${match[1] as string}${redactHeaderLiteralFragments(value)}`;
    inlineCursor = valueEnd;
  }
  result = inlineResult + result.slice(inlineCursor);
  result = result.replace(
    new RegExp(`(?<!["'])(\\b${headers}\\s*:\\s*)(?!\\s*\\\[REDACTED\\\])([^\\s"'\r\n&|><;]+)`, 'giu'),
    (_match, prefix, val) => `${prefix as string}${
      isShellExpression(val as string)
        ? redactHeaderLiteralFragments(val as string)
        : '[REDACTED]'
    }`,
  );

  return result;
}

function redactShellScalarLine(content: string, withinShellContext = false): string | undefined {
  const tokens = content.trim().split(/\s+/u);
  const commandIndex = tokens[0] === 'sudo' ? 1 : 0;
  const command = tokens[commandIndex];
  if (command === undefined) return undefined;
  const isEstablishedNoArgumentCommand = withinShellContext
    && tokens.length === commandIndex + 1;

  if (
    tokens.length <= commandIndex + 1
    && !/^(?:shutdown|reboot|mkfs(?:\.[A-Za-z0-9_.-]+)?)$/u.test(command)
    && !isEstablishedNoArgumentCommand
  ) return undefined;
  const isEstablishedVisibleFollowup = withinShellContext
    && /^(?:echo|printf)\s/u.test(content);
  const isEstablishedGeneralCommand = withinShellContext
    && isGeneralCommandShapedLine(content);
  if (
    !isRecognizedUnmatchedKeyCommand(content)
    && !isEstablishedVisibleFollowup
    && !isEstablishedGeneralCommand
    && !withinShellContext
  ) return undefined;

  const prefix = commandIndex === 1 ? ['sudo', command] : [command];
  let tokenIndex = commandIndex + 1;
  while (tokenIndex < tokens.length && /^-[A-Za-z0-9-]+$/u.test(tokens[tokenIndex] ?? '')) {
    prefix.push(tokens[tokenIndex] as string);
    tokenIndex++;
  }

  return tokenIndex < tokens.length ? `${prefix.join(' ')} [REDACTED]` : prefix.join(' ');
}

function redactYamlMultilineBlocks(text: string): string {
  if (!/^[ +\-]?\s*["']?[A-Za-z0-9_-]+["']?\s*:\s*[|>]/mu.test(text)) {
    return text;
  }
  const lines = text.split(/\r\n|\n|\r/u);
  const out: string[] = [];
  let inRedactedBlock = false;
  let blockIndent = 0;
  let blockDiffPrefix = '';
  let preserveShellContext = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    if (inRedactedBlock) {
      const lineDiffPrefix = /^[+\-]/u.test(line) || (blockDiffPrefix === ' ' && line.startsWith(' '))
        ? line[0] ?? ''
        : '';
      const contentLine = lineDiffPrefix !== '' ? line.slice(1) : line;
      if (contentLine.trim().length === 0) {
        out.push(line);
        continue;
      }
      const matchIndent = contentLine.match(/^(\s*)/);
      const currentIndent = (matchIndent && matchIndent[1]) ? matchIndent[1].length : 0;
      if (currentIndent > blockIndent) {
        const content = contentLine.trimStart();
        if (redactShellScalarLine(content) !== undefined) {
          preserveShellContext = true;
        }
        if (preserveShellContext) {
          const shellStructure = redactShellScalarLine(content, true);
          if (shellStructure !== undefined) {
            out.push(`${lineDiffPrefix}${contentLine.slice(0, currentIndent)}${shellStructure}`);
          }
        } else {
          out.push(`${lineDiffPrefix}${contentLine.slice(0, currentIndent)}[REDACTED]`);
        }
        continue;
      } else {
        inRedactedBlock = false;
        preserveShellContext = false;
      }
    }

    const yamlBlockMatch = line.match(/^([ +\-]?)(\s*)(["']?)([A-Za-z0-9_-]+)\3\s*:\s*[|>](?:[-+]?\d?|\d?[-+]?)(?:\s*#.*)?$/);
    if (yamlBlockMatch && yamlBlockMatch[2] !== undefined && yamlBlockMatch[4] !== undefined) {
      const diffPrefix = yamlBlockMatch[1] ?? '';
      const indentStr = yamlBlockMatch[2];
      const quote = yamlBlockMatch[3] ?? '';
      const key = yamlBlockMatch[4];
      if (isSensitiveKeyToken(key)) {
        out.push(`${diffPrefix}${indentStr}${quote}${key}${quote}: [REDACTED]`);
        inRedactedBlock = true;
        blockIndent = indentStr.length;
        blockDiffPrefix = diffPrefix;
        preserveShellContext = false;
        continue;
      }
    }

    out.push(line);
  }

  return out.join('\n');
}

function redactYamlPlainScalarContinuations(text: string): string {
  const segments = text.split(/(\r\n|\n|\r)/u);
  const lines = segments.filter((_segment, index) => index % 2 === 0);
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index]?.match(/^([ +\-]?)(\s*)(["']?)([A-Za-z0-9_-]+)\3\s*:\s*(?![|>"'{\[])(\S.*)$/u);
    if (match?.[4] === undefined || !isSensitiveKeyToken(match[4])) continue;
    const propertyIndent = (match[2] ?? '').length;
    for (let continuation = index + 1; continuation < lines.length; continuation++) {
      const line = lines[continuation] ?? '';
      if (line.trim().length === 0) continue;
      const content = /^[+\-]/u.test(line) ? line.slice(1) : line;
      const indent = content.match(/^\s*/u)?.[0].length ?? 0;
      if (indent <= propertyIndent) break;
      const scalarContent = content.slice(indent);
      if (/^(?:-\s+)?(?:[A-Za-z0-9_.-]+|"[^"\r\n]+"|'[^'\r\n]+')\s*:(?:\s|$)/u.test(scalarContent)) {
        break;
      }
      const diffPrefix = /^[+\-]/u.test(line) ? line[0] ?? '' : '';
      lines[continuation] = `${diffPrefix}${content.slice(0, indent)}[REDACTED]`;
    }
  }
  for (let index = 0; index < lines.length; index++) {
    segments[index * 2] = lines[index] ?? '';
  }
  return segments.join('');
}

function redactYamlNodePropertyScalars(text: string): string {
  const scalarStart = /^([ +\-]?\s*(["']?)([A-Za-z0-9_.-]+)\2\s*:\s*)((?:(?:&[A-Za-z0-9_.-]+|![^\s"']+)\s+)+)(["'])/gmu;
  let output = '';
  let cursor = 0;

  for (const match of text.matchAll(scalarStart)) {
    const key = match[3];
    const quote = match[5];
    if (typeof key !== 'string' || typeof quote !== 'string' || !isSensitiveKeyToken(key)) continue;
    const valueStart = match.index + match[0].length;
    const scanEnd = Math.min(text.length, valueStart + 65_536);
    let close = -1;

    for (let index = valueStart; index < scanEnd; index++) {
      if (text[index] !== quote) continue;
      if (quote === "'") {
        if (text[index + 1] === "'") {
          index++;
          continue;
        }
        close = index;
        break;
      }
      let backslashes = 0;
      for (let previous = index - 1; previous >= valueStart && text[previous] === '\\'; previous--) {
        backslashes++;
      }
      if (backslashes % 2 === 0) {
        close = index;
        break;
      }
    }
    if (match.index < cursor) continue;
    output += text.slice(cursor, match.index);
    output += `${match[1] as string}${match[4] as string}${quote}[REDACTED]`;
    if (close === -1) {
      cursor = physicalLineBoundaryAtOrAfter(text, scanEnd);
    } else {
      output += quote;
      cursor = close + 1;
    }
  }

  return output + text.slice(cursor);
}

function redactJsonCollectionLiteralFragments(value: string): string {
  const spans = shellExpressionSpans(value);
  let spanIndex = 0;
  let result = '';

  for (let index = 0; index < value.length;) {
    const span = spans[spanIndex];
    if (span?.[0] === index) {
      result += value.slice(span[0], span[1]);
      index = span[1];
      spanIndex++;
      continue;
    }

    const character = value[index] ?? '';
    if (character === '"') {
      let closingIndex = index + 1;
      for (; closingIndex < value.length; closingIndex++) {
        const nestedSpan = spans[spanIndex];
        if (nestedSpan?.[0] === closingIndex) {
          closingIndex = nestedSpan[1] - 1;
          spanIndex++;
          continue;
        }
        if (value[closingIndex] === '\\') {
          closingIndex++;
        } else if (value[closingIndex] === '"') {
          break;
        }
      }
      const content = value.slice(index + 1, closingIndex);
      let nextIndex = closingIndex + 1;
      while (/\s/u.test(value[nextIndex] ?? '')) nextIndex++;
      result += value.slice(index, index + 1);
      result += value[nextIndex] === ':'
        ? content
        : redactPasswordLiteralFragments(content);
      result += value.slice(closingIndex, closingIndex + 1);
      index = closingIndex + 1;
      continue;
    }

    if (/[\s[\]{},:]/u.test(character)) {
      result += character;
      index++;
      continue;
    }
    let literalEnd = index + 1;
    while (
      literalEnd < value.length
      && !/[\s[\]{},:"]/u.test(value[literalEnd] ?? '')
      && spans[spanIndex]?.[0] !== literalEnd
    ) {
      literalEnd++;
    }
    result += '[REDACTED]';
    index = literalEnd;
  }
  return result;
}

function redactSensitiveJsonCollections(text: string): string {
  const propertyStart = /"((?:[^"\\\r\n]|\\(?:["\\/bfnrt]|u[0-9A-Fa-f]{4}))+)"\s*:\s*(?=[\[{])/gu;
  let result = '';
  let cursor = 0;
  for (const match of text.matchAll(propertyStart)) {
    const key = match[1];
    if (
      key === undefined
      || !isSensitiveKeyToken(decodeJsonKeyEscapes(key))
      || match.index < cursor
    ) continue;
    const valueStart = match.index + match[0].length;
    const valueEnd = balancedStructuredValueEnd(text, valueStart);
    if (valueEnd === undefined) continue;
    const value = text.slice(valueStart, valueEnd);
    result += text.slice(cursor, valueStart)
      + (isShellExpression(value) ? redactJsonCollectionLiteralFragments(value) : '[REDACTED]');
    cursor = valueEnd;
  }
  return result + text.slice(cursor);
}

function redactPowerShellDoubleQuotedFragments(value: string): string {
  const spans: Array<readonly [number, number]> = [];
  for (let start = 0; start < value.length - 1; start++) {
    if (value[start] === '`') {
      start++;
      continue;
    }
    if (value[start] !== '$' || value[start + 1] !== '(') continue;
    let depth = 1;
    let quote: '"' | "'" | undefined;
    for (let index = start + 2; index < value.length; index++) {
      const character = value[index];
      if (character === '`') {
        index++;
      } else if (quote !== undefined) {
        if (character === quote) quote = undefined;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '(') {
        depth++;
      } else if (character === ')' && --depth === 0) {
        spans.push([start, index + 1]);
        start = index;
        break;
      }
    }
  }

  let result = '';
  let cursor = 0;
  for (const [start, end] of spans) {
    if (start > cursor) result += '[REDACTED]';
    result += value.slice(start, end);
    cursor = end;
  }
  if (cursor < value.length) result += '[REDACTED]';
  return result;
}

function redactPowerShellCollectionFragments(value: string): string {
  const spans = shellExpressionSpans(value);
  let result = '';
  let index = 0;
  let spanIndex = 0;
  while (index < value.length) {
    const span = spans[spanIndex];
    if (span?.[0] === index) {
      result += value.slice(span[0], span[1]);
      index = span[1];
      spanIndex++;
      continue;
    }
    const character = value[index] ?? '';
    if (character === '"' || character === "'") {
      const quote = character;
      let end = index + 1;
      for (; end < value.length; end++) {
        if (quote === '"' && value[end] === '`') end++;
        else if (value[end] === quote) break;
      }
      const content = value.slice(index + 1, end);
      result += `${quote}${quote === '"' && isShellExpression(content)
        ? redactPasswordLiteralFragments(content)
        : '[REDACTED]'}${end < value.length ? quote : ''}`;
      index = Math.min(value.length, end + 1);
      continue;
    }
    if (/[A-Za-z0-9_-]/u.test(character)) {
      let end = index + 1;
      while (/[A-Za-z0-9_-]/u.test(value[end] ?? '')) end++;
      let next = end;
      while (/[ \t]/u.test(value[next] ?? '')) next++;
      result += value[next] === '=' ? value.slice(index, end) : '[REDACTED]';
      index = end;
      continue;
    }
    result += character;
    index++;
  }
  return result;
}

function isQuotedStructuredCollectionKey(value: string, tokenEnd: number): boolean {
  const scanEnd = Math.min(value.length, tokenEnd + 65_536);
  let index = tokenEnd;
  while (index < scanEnd && /[ \t]/u.test(value[index] ?? '')) index++;
  if (value[index] === '=' || value[index] === ':') return true;

  while (value[index] === '.') {
    index++;
    while (index < scanEnd && /[ \t]/u.test(value[index] ?? '')) index++;
    const quote = value[index];
    if (quote === '"' || quote === "'") {
      index++;
      while (index < scanEnd) {
        if (quote === '"' && value[index] === '\\') index += 2;
        else if (value[index] === quote) {
          index++;
          break;
        } else index++;
      }
    } else {
      const segmentStart = index;
      while (index < scanEnd && /[A-Za-z0-9_-]/u.test(value[index] ?? '')) index++;
      if (index === segmentStart) return false;
    }
    while (index < scanEnd && /[ \t]/u.test(value[index] ?? '')) index++;
    if (value[index] === '=' || value[index] === ':') return true;
  }
  return false;
}

function redactTomlCollectionFragments(value: string): string {
  const spans = shellExpressionSpans(value);
  let result = '';
  let index = 0;
  let spanIndex = 0;
  while (index < value.length) {
    while ((spans[spanIndex]?.[1] ?? value.length + 1) <= index) spanIndex++;
    const span = spans[spanIndex];
    if (span?.[0] === index) {
      result += value.slice(span[0], span[1]);
      index = span[1];
      spanIndex++;
      continue;
    }
    if (value[index] === '#') {
      const commentEnd = physicalLineBoundaryAtOrAfter(value, index + 1);
      result += value.slice(index, commentEnd);
      index = commentEnd;
      continue;
    }
    const quote = value[index];
    if (quote !== '"' && quote !== "'") {
      result += quote ?? '';
      index++;
      continue;
    }
    const delimiter = quote.repeat(3);
    if (value.startsWith(delimiter, index)) {
      const bodyStart = index + delimiter.length;
      let closingIndex = -1;
      if (quote === "'") {
        closingIndex = value.indexOf(delimiter, bodyStart);
      } else {
        for (let candidate = bodyStart; candidate + delimiter.length <= value.length; candidate++) {
          if (!value.startsWith(delimiter, candidate)) continue;
          let backslashes = 0;
          for (let cursor = candidate - 1; cursor >= bodyStart && value[cursor] === '\\'; cursor--) {
            backslashes++;
          }
          if (backslashes % 2 === 0) {
            closingIndex = candidate;
            break;
          }
        }
      }
      if (closingIndex >= bodyStart) {
        const content = value.slice(bodyStart, closingIndex);
        const redacted = quote === '"' && isShellExpression(content)
          ? redactPasswordLiteralFragments(content)
          : '[REDACTED]';
        result += delimiter + redacted + delimiter;
        index = closingIndex + delimiter.length;
        continue;
      }
    }
    let end = index + 1;
    while (end < value.length) {
      if (quote === '"' && value[end] === '\\') {
        end = Math.min(value.length, end + 2);
        continue;
      }
      if (value[end] !== quote) {
        end++;
        continue;
      }
      if (quote === "'" && value[end + 1] === "'") {
        end += 2;
        continue;
      }
      break;
    }
    const hasClosingQuote = end < value.length;
    let next = hasClosingQuote ? end + 1 : end;
    while (/[ \t]/u.test(value[next] ?? '')) next++;
    const token = value.slice(index, hasClosingQuote ? end + 1 : end);
    if (isQuotedStructuredCollectionKey(value, hasClosingQuote ? end + 1 : end)) {
      result += token;
    } else {
      const content = value.slice(index + 1, end);
      const redacted = quote === '"' && isShellExpression(content)
        ? redactPasswordLiteralFragments(content)
        : '[REDACTED]';
      result += quote + redacted + (hasClosingQuote ? quote : '');
    }
    index = hasClosingQuote ? end + 1 : end;
  }
  return result;
}

function powerShellUnquotedValueBoundary(text: string, start: number): number {
  const chunkSize = 65_536;
  let parenDepth = 0;
  let quote: '"' | "'" | undefined;
  let firstExpressionBoundary: number | undefined;

  for (let chunkStart = start; chunkStart < text.length; chunkStart += chunkSize) {
    const chunkEnd = Math.min(text.length, chunkStart + chunkSize);
    for (let index = chunkStart; index < chunkEnd; index++) {
      const character = text[index] ?? '';
      if (character === '`') {
        if (text[index + 1] === '\r' && text[index + 2] === '\n') index += 2;
        else if (index + 1 < text.length) index++;
        continue;
      }
      if (parenDepth === 0) {
        if (character === '$' && text[index + 1] === '(') {
          parenDepth = 1;
          quote = undefined;
          firstExpressionBoundary = undefined;
          index++;
          continue;
        }
        if (/[\s;&|<>]/u.test(character)) return index;
        continue;
      }
      if (firstExpressionBoundary === undefined && /[\s;&|<>]/u.test(character)) {
        firstExpressionBoundary = index;
      }
      if (quote !== undefined) {
        if (character === quote) quote = undefined;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '(') {
        parenDepth++;
      } else if (character === ')' && --parenDepth === 0) {
        firstExpressionBoundary = undefined;
      }
    }
  }
  return parenDepth > 0 && firstExpressionBoundary !== undefined
    ? firstExpressionBoundary
    : text.length;
}

function physicalLineBoundaryAtOrAfter(text: string, start: number): number {
  const lf = text.indexOf('\n', start);
  const cr = text.indexOf('\r', start);
  if (lf < 0) return cr < 0 ? text.length : cr;
  if (cr < 0) return lf;
  return Math.min(lf, cr);
}

function redactTomlTripleQuotedAssignments(text: string): string {
  const segment = `(?:"(?:\\\\.|[^"\\r\\n])+"|'(?:''|[^'\\r\\n])+'|[A-Za-z_][A-Za-z0-9_-]*)`;
  const assignmentStart = new RegExp(
    `^(\\s*(${segment}(?:\\s*\\.\\s*${segment})*)\\s*=\\s*)("""|''')`,
    'gmu',
  );
  let result = '';
  let cursor = 0;
  for (const match of text.matchAll(assignmentStart)) {
    const key = match[2];
    const delimiter = match[3];
    if (
      match.index < cursor
      || key === undefined
      || delimiter === undefined
      || !isSensitiveTomlKeyPath(key)
    ) continue;
    const bodyStart = match.index + match[0].length;
    const scanEnd = Math.min(text.length, bodyStart + MAX_SENSITIVE_ARRAY_BODY_LENGTH);
    let closingIndex = -1;
    if (delimiter === "'''") {
      const boundedClosingIndex = text.slice(bodyStart, scanEnd).indexOf(delimiter);
      if (boundedClosingIndex >= 0) closingIndex = bodyStart + boundedClosingIndex;
    } else {
      for (let index = bodyStart; index + delimiter.length <= scanEnd; index++) {
        if (!text.startsWith(delimiter, index)) continue;
        let backslashes = 0;
        for (let cursor = index - 1; cursor >= bodyStart && text[cursor] === '\\'; cursor--) {
          backslashes++;
        }
        if (backslashes % 2 === 0) {
          closingIndex = index;
          break;
        }
      }
    }
    if (closingIndex < bodyStart || closingIndex + delimiter.length > scanEnd) continue;
    const body = text.slice(bodyStart, closingIndex);
    const redactedBody = delimiter === '"""' && isShellExpression(body)
      ? redactPasswordLiteralFragments(body)
      : '[REDACTED]';
    result += text.slice(cursor, match.index) + match[1] + delimiter + redactedBody + delimiter;
    cursor = closingIndex + delimiter.length;
  }
  return result + text.slice(cursor);
}

function decodeTomlBasicString(value: string): string | undefined {
  let result = '';
  for (let index = 0; index < value.length; index++) {
    const character = value[index] ?? '';
    if (character !== '\\') {
      result += character;
      continue;
    }
    const escape = value[++index];
    const shortEscapes: Readonly<Record<string, string>> = {
      '"': '"',
      '\\': '\\',
      b: '\b',
      t: '\t',
      n: '\n',
      f: '\f',
      r: '\r',
    };
    if (escape !== undefined && shortEscapes[escape] !== undefined) {
      result += shortEscapes[escape];
      continue;
    }
    const digits = escape === 'u' ? 4 : escape === 'U' ? 8 : 0;
    const encoded = digits === 0 ? '' : value.slice(index + 1, index + 1 + digits);
    if (encoded.length !== digits || !/^[0-9A-Fa-f]+$/u.test(encoded)) return undefined;
    const codePoint = Number.parseInt(encoded, 16);
    if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return undefined;
    result += String.fromCodePoint(codePoint);
    index += digits;
  }
  return result;
}

function isSensitiveTomlKeyPath(keyPath: string): boolean {
  const terminal = keyPath.match(/("(?:\\.|[^"\r\n])+"|'(?:''|[^'\r\n])+'|[A-Za-z_][A-Za-z0-9_-]*)\s*$/u)?.[1];
  if (terminal === undefined) return false;
  const decoded = terminal.startsWith('"')
    ? decodeTomlBasicString(terminal.slice(1, -1))
    : terminal.startsWith("'") ? terminal.slice(1, -1).replace(/''/gu, "'") : terminal;
  return decoded !== undefined && isSensitiveKeyToken(decoded);
}

function redactTomlQuotedDottedAssignments(text: string): string {
  const segment = `(?:"(?:\\\\.|[^"\\r\\n])+"|'(?:''|[^'\\r\\n])+'|[A-Za-z_][A-Za-z0-9_-]*)`;
  const assignment = new RegExp(
    `^(\\s*(${segment}(?:\\s*\\.\\s*${segment})+)\\s*=\\s*)((?!""")"(?:\\\\.|[^"\\r\\n])*"|(?!''')'(?:''|[^'\\r\\n])*')`,
    'gmu',
  );
  return text.replace(assignment, (match, prefix, keyPath, value) => {
    if (typeof keyPath !== 'string' || typeof value !== 'string') return match;
    if (!isSensitiveTomlKeyPath(keyPath)) return match;
    const quote = value[0] ?? '';
    return `${prefix as string}${quote}[REDACTED]${quote}`;
  });
}

function redactHclHeredocAssignments(text: string): string {
  const assignmentStart = /^(\s*([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*<<(-?)([A-Za-z_][A-Za-z0-9_-]*)[ \t]*(?:\r\n|\n|\r))/gmu;
  let result = '';
  let cursor = 0;
  for (const match of text.matchAll(assignmentStart)) {
    const key = match[2];
    const indented = match[3] === '-';
    const identifier = match[4];
    if (
      match.index < cursor
      || key === undefined
      || identifier === undefined
      || !isSensitiveKeyToken(key)
    ) continue;
    const bodyStart = match.index + match[0].length;
    const scanEnd = Math.min(text.length, bodyStart + MAX_SENSITIVE_ARRAY_BODY_LENGTH);
    const candidate = text.slice(bodyStart, scanEnd);
    const terminator = new RegExp(`^${indented ? '[ \\t]*' : ''}${identifier}[ \\t]*(?=\\r\\n|\\n|\\r|$)`, 'mu');
    const closing = terminator.exec(candidate);
    if (closing === null) continue;
    const closingIndex = bodyStart + closing.index;
    const body = text.slice(bodyStart, closingIndex);
    const trailingBreak = body.match(/(?:\r\n|\n|\r)$/u)?.[0] ?? '';
    result += text.slice(cursor, bodyStart) + '[REDACTED]' + trailingBreak;
    cursor = closingIndex;
  }
  return result + text.slice(cursor);
}

function redactTomlCollectionAssignments(text: string): string {
  const segment = `(?:"(?:\\\\.|[^"\\r\\n])+"|'(?:''|[^'\\r\\n])+'|[A-Za-z_][A-Za-z0-9_-]*)`;
  const assignmentStart = new RegExp(`^(\\s*(${segment}(?:\\s*\\.\\s*${segment})*)\\s*=\\s*)(?=[\\[{])`, 'gmu');
  let result = '';
  let cursor = 0;
  for (const match of text.matchAll(assignmentStart)) {
    const key = match[2];
    if (match.index < cursor || key === undefined || !isSensitiveTomlKeyPath(key)) continue;
    const valueStart = match.index + match[0].length;
    const valueEnd = balancedTomlCollectionEnd(text, valueStart);
    if (valueEnd === undefined) continue;
    result += text.slice(cursor, valueStart)
      + redactTomlCollectionFragments(text.slice(valueStart, valueEnd));
    cursor = valueEnd;
  }
  return result + text.slice(cursor);
}

function redactPowerShellAssignments(text: string): string {
  const assignmentStart = /(\$(?:(?:env|global|script|local|private):([A-Za-z_][A-Za-z0-9_-]*)|\{(?:env|global|script|local|private):([A-Za-z_][A-Za-z0-9_-]*)\}|\{([A-Za-z_][A-Za-z0-9_-]*)\}|([A-Za-z_][A-Za-z0-9_-]*))\s*(?:\+=|=)\s*)/giu;
  let result = '';
  let cursor = 0;

  for (const match of text.matchAll(assignmentStart)) {
    const key = match[2] ?? match[3] ?? match[4] ?? match[5];
    if (match.index < cursor || key === undefined || !isSensitiveKeyToken(key)) continue;
    const valueStart = match.index + match[0].length;
    const hereStringQuote = text.startsWith('@"', valueStart)
      ? '"'
      : text.startsWith("@'", valueStart) ? "'" : undefined;
    if (hereStringQuote !== undefined) {
      const scanEnd = Math.min(text.length, valueStart + MAX_SENSITIVE_ARRAY_BODY_LENGTH);
      const candidate = text.slice(valueStart + 2, scanEnd);
      const closingLine = new RegExp(
        `^${hereStringQuote}@[ \\t]*(?=\\r\\n|\\n|\\r|$)`,
        'mu',
      );
      const closing = closingLine.exec(candidate);
      const valueEnd = closing === null
        ? physicalLineBoundaryAtOrAfter(text, scanEnd)
        : valueStart + 2 + closing.index + closing[0].length;
      const hereString = text.slice(valueStart, valueEnd);
      const redactedHereString = hereString.replace(
        /^([^\r\n]*)(\r\n|\n|\r)?|([^\r\n]+)(\r\n|\n|\r)?/gu,
        (line, firstLine, firstBreak) => firstLine !== undefined
          ? `${firstLine}${firstBreak ?? ''}`
          : closingLine.test(line) ? line : `[REDACTED]${line.endsWith('\r\n') ? '\r\n' : line.endsWith('\n') ? '\n' : line.endsWith('\r') ? '\r' : ''}`,
      );
      result += text.slice(cursor, match.index) + match[0] + redactedHereString;
      cursor = valueEnd;
      continue;
    }
    const collectionCloser = text.startsWith('@(', valueStart)
      ? ')'
      : text.startsWith('@{', valueStart) ? '}' : undefined;
    if (collectionCloser !== undefined) {
      const opener = text[valueStart + 1] ?? '';
      let depth = 1;
      let quote: '"' | "'" | undefined;
      let comment: 'line' | 'block' | undefined;
      let closingIndex = -1;
      const scanEnd = Math.min(text.length, valueStart + 2 + MAX_SENSITIVE_ARRAY_BODY_LENGTH);
      for (let index = valueStart + 2; index < scanEnd; index++) {
        const character = text[index];
        if (comment === 'line') {
          if (character === '\r' || character === '\n') comment = undefined;
        } else if (comment === 'block') {
          if (character === '#' && text[index + 1] === '>') {
            comment = undefined;
            index++;
          }
        } else if (character === '`') index++;
        else if (quote !== undefined) {
          if (character === quote) quote = undefined;
        } else if (character === '"' || character === "'") quote = character;
        else if (character === '#') comment = 'line';
        else if (character === '<' && text[index + 1] === '#') {
          comment = 'block';
          index++;
        }
        else if (character === opener) {
          if (depth >= MAX_STRUCTURED_HEADER_OBJECT_DEPTH) break;
          depth++;
        }
        else if (character === collectionCloser && --depth === 0) {
          closingIndex = index;
          break;
        }
      }
      if (closingIndex >= 0) {
        const collection = text.slice(valueStart, closingIndex + 1);
        result += text.slice(cursor, match.index) + match[0]
          + redactPowerShellCollectionFragments(collection);
        cursor = closingIndex + 1;
        continue;
      }
    }
    const ansiSingleQuoted = text.startsWith("$'", valueStart);
    const quote = ansiSingleQuoted ? "'" : text[valueStart];
    let valueEnd: number;

    if (quote === "'" || quote === '"') {
      const contentStart = valueStart + (ansiSingleQuoted ? 2 : 1);
      valueEnd = contentStart;
      const scanEnd = Math.min(text.length, contentStart + MAX_SENSITIVE_ARRAY_BODY_LENGTH);
      let firstNewline = -1;
      let matchedQuote = false;
      for (; valueEnd < scanEnd; valueEnd++) {
        const character = text[valueEnd];
        if (quote === '"' && character === '`') {
          valueEnd++;
        } else if (quote === "'" && character === "'" && text[valueEnd + 1] === "'") {
          valueEnd++;
        } else if (character === quote) {
          valueEnd++;
          matchedQuote = true;
          break;
        } else if (firstNewline < 0 && (character === '\r' || character === '\n')) {
          firstNewline = valueEnd;
        }
      }
      if (!matchedQuote) {
        valueEnd = scanEnd < text.length
          ? physicalLineBoundaryAtOrAfter(text, scanEnd)
          : firstNewline >= 0 ? firstNewline : valueEnd;
      }
    } else {
      valueEnd = powerShellUnquotedValueBoundary(text, valueStart);
    }

    const value = text.slice(valueStart, valueEnd);
    const redactedValue = quote === '"' && value.endsWith('"')
      ? `"${redactPowerShellDoubleQuotedFragments(value.slice(1, -1))}"`
      : quote === "'" && value.endsWith("'")
        ? `${ansiSingleQuoted ? "$'" : "'"}[REDACTED]'`
        : redactPowerShellDoubleQuotedFragments(value);
    result += text.slice(cursor, match.index) + match[0] + redactedValue;
    cursor = valueEnd;
  }

  return result + text.slice(cursor);
}

function redactMultilinePosixQuotedAssignments(text: string): string {
  const assignmentStart = /(?:^|[\s{,;(])([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)\s*(?:\+=|[:=])\s*(["'])/gmu;
  let result = '';
  let cursor = 0;
  for (const match of text.matchAll(assignmentStart)) {
    const key = match[1];
    const quote = match[2];
    if (
      key === undefined
      || (quote !== '"' && quote !== "'")
      || !isSensitiveKeyToken(key)
      || match.index < cursor
    ) continue;
    const valueStart = match.index + match[0].length;
    const scanEnd = Math.min(text.length, valueStart + MAX_SENSITIVE_ARRAY_BODY_LENGTH);
    let valueEnd = -1;
    let sawNewline = false;
    for (let index = valueStart; index < scanEnd; index++) {
      const character = text[index];
      if (quote === '"' && character === '\\') {
        index++;
      } else if (character === quote) {
        valueEnd = index;
        break;
      } else if (character === '\r' || character === '\n') {
        sawNewline = true;
      }
    }
    if (valueEnd < 0 && sawNewline) {
      const failClosedEnd = physicalLineBoundaryAtOrAfter(text, scanEnd);
      result += text.slice(cursor, match.index) + match[0] + '[REDACTED]';
      cursor = failClosedEnd;
      continue;
    }
    const value = valueEnd < 0 ? '' : text.slice(valueStart, valueEnd);
    const nestedQuotedAssignment = /(?:\r\n|\n|\r)\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*(?:\+=|[:=])\s*(["'])/u.exec(value);
    if (
      valueEnd < 0
      || !/[\r\n]/u.test(value)
      || (
        nestedQuotedAssignment?.[1] !== undefined
        && isSensitiveKeyToken(nestedQuotedAssignment[1])
        && nestedQuotedAssignment[2] !== quote
      )
    ) continue;
    result += text.slice(cursor, match.index) + match[0];
    result += quote === '"' && isShellExpression(value)
      ? redactPasswordLiteralFragments(value)
      : '[REDACTED]';
    result += quote;
    cursor = valueEnd + 1;
  }
  return result + text.slice(cursor);
}

export function redactSecrets(
  text: string,
  options?: {
    isTruncatedTail?: boolean;
    scanMetrics?: RedactionScanMetrics;
  },
): string {
  const isTruncatedTail = options?.isTruncatedTail ?? false;
  let result = text;

  // 1. Private Key Blocks (plausible key body check)
  result = redactPrivateKeyBlocks(result);

  // Established webhook credential URLs, aligned with observer export redaction.
  result = result.replace(
    /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_/-]+/giu,
    '[REDACTED]',
  );
  result = result.replace(
    /https:\/\/(?:discord(?:app)?\.com|canary\.discord\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/giu,
    '[REDACTED]',
  );
  result = result
    .replace(
      /(api\.telegram\.org\/bot)\d{5,}(?::|%3A)[A-Za-z0-9_-]{20,}/giu,
      '$1[REDACTED]',
    )
    .replace(
      /(\/bot)\d{5,}(?::|%3A)[A-Za-z0-9_-]{20,}(?=\/|$|[?#\s"'<>])/giu,
      '$1[REDACTED]',
    )
    .replace(
      /(\/webhooks\/telegram\/)\d{5,}(?::|%3A)[A-Za-z0-9_-]{20,}(?=\/|$|[?#\s"'<>])/giu,
      '$1[REDACTED]',
    );

  // 2. URL Userinfo Passwords (supports dots and plus in username, IPv6 authority, cutoff boundary)
  result = redactUrlPasswords(result, isTruncatedTail, options?.scanMetrics);

  // 3. URL Query Parameters (?access_token=secret&...)
  result = redactUrlQueryParams(result);

  // 4. Curl --user and --proxy-user credentials (user:password)
  result = redactCurlUserCredentials(result);
  result = redactCurlOauth2Bearer(result);
  result = result.replace(
    /^(\/\/(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9._~%-]+)(?::[0-9]+)?\/(?:(?:(?:[A-Za-z0-9._~!$&'()*+,;=:@-]|%[0-9A-Fa-f]{2}){1,255})\/){0,32}:[ \t]*)([A-Za-z_][A-Za-z0-9_-]*)([ \t]*=[ \t]*)([^\s\r\n]+)/gmu,
    (match, registryScope, key, separator) =>
      typeof key === 'string' && isSensitiveKeyToken(key)
        ? `${registryScope as string}${key}${separator as string}[REDACTED]`
        : match,
  );
  result = redactNestedOptionAssignments(result);
  result = redactMysqlAttachedPasswords(result);
  result = redactAwsConfigureSetValues(result);
  result = redactNetrcPasswords(result);

  // 5. Structured and shell-style sensitive headers
  result = redactStructuredHeaders(result);
  result = redactAuthorizationHeaders(result);

  // 6. Standalone Bearer tokens outside Authorization header (including short/single-char tokens)
  const standaloneBearerStart = /\b(Bearer\s+)/giu;
  let bearerResult = '';
  let bearerCursor = 0;
  for (const match of result.matchAll(standaloneBearerStart)) {
    if (match.index < bearerCursor) continue;
    const valueStart = match.index + match[0].length;
    const valueEnd = shellValueBoundary(result, valueStart, /[\s"'\r\n&|><;]/u);
    const credential = result.slice(valueStart, valueEnd);
    if (!isShellExpression(credential)) continue;
    bearerResult += result.slice(bearerCursor, match.index);
    bearerResult += `${match[1] as string}${redactPasswordLiteralFragments(credential)}`;
    bearerCursor = valueEnd;
  }
  result = bearerResult + result.slice(bearerCursor);
  result = result.replace(
    /\b(Bearer\s+)([^\s"'\r\n&|><;]+)/giu,
    (match, prefix, credential, offset, whole) => {
      if (
        typeof credential === 'string'
        && (
          credential.includes('[REDACTED]$(')
          || (
            typeof offset === 'number'
            && typeof whole === 'string'
            && shellExpressionSpans(whole.slice(offset + prefix.length))[0]?.[0] === 0
          )
        )
      ) {
        return match;
      }
      return `${prefix as string}${
        isShellExpression(credential as string)
          ? redactPasswordLiteralFragments(credential as string)
          : '[REDACTED]'
      }`;
    },
  );

  // 7. Explicit token formats (GitHub tokens, OpenAI sk- keys, JWTs)
  result = result.replace(
    /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/gu,
    '[REDACTED]',
  );
  result = result.replace(
    /\bsk[-_][A-Za-z0-9_-]{20,}\b/gu,
    '[REDACTED]',
  );
  result = result.replace(
    /\b(?:glpat-[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9_-]{12,}|npm_[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{35})\b/gu,
    '[REDACTED]',
  );
  result = result.replace(
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/gu,
    '[REDACTED]',
  );

  // 8. YAML Multiline Block Scalars (| or > with indicators like |2, |2-, >+2)
  result = redactYamlMultilineBlocks(result);
  result = redactYamlPlainScalarContinuations(result);
  result = redactYamlNodePropertyScalars(result);

  // 9. Space-Separated CLI Flags (--flag val, --flag "val", --flag 'val', unterminated, shell expr)
  const unquotedFlagStart = /(--[A-Za-z0-9_-]+)((?:\\(?:\r\n|\n|\r)|\s)+)(?=[^\s"'$]|[$<>]\()/giu;
  let flagResult = '';
  let flagCursor = 0;
  for (const match of result.matchAll(unquotedFlagStart)) {
    const flag = match[1];
    if (typeof flag !== 'string' || !isSensitiveKeyToken(flag) || match.index < flagCursor) continue;
    const valueStart = match.index + match[0].length;
    const valueEnd = shellValueBoundary(result, valueStart, /[\s"'\r\n&|><;]/u);
    const value = result.slice(valueStart, valueEnd);
    if (!isShellExpression(value)) continue;
    flagResult += result.slice(flagCursor, match.index);
    flagResult += `${flag}${match[2] as string}${redactPasswordLiteralFragments(value)}`;
    flagCursor = valueEnd;
  }
  result = flagResult + result.slice(flagCursor);
  const flagRegex = /(--[A-Za-z0-9_-]+)((?:\\(?:\r\n|\n|\r)|\s)+)(?!\\(?:\r\n|\n|\r))(\$'((?:\\.|[^'\r\n\\])*)'|"((?:\\(?:\r\n|[\r\n]|.)|[^"\r\n\\])*)"|'([^'\r\n]*)'|"([^"\r\n]+)$|'([^'\r\n]+)$|(?!--)((?:\\.|[^\s"'\r\n&|><;]|<\([^)]*\)|>\([^)]*\))+))/gimu;
  result = result.replace(flagRegex, (match, flag, space, valWithQuotes, ansiCVal, dQuoteVal, sQuoteVal, dQuoteUnterm, sQuoteUnterm, unquotedVal) => {
    if (typeof flag !== 'string' || !isSensitiveKeyToken(flag)) {
      return match;
    }
    const val = (ansiCVal ?? dQuoteVal ?? sQuoteVal ?? dQuoteUnterm ?? sQuoteUnterm ?? unquotedVal ?? valWithQuotes) as string;
    if (typeof unquotedVal === 'string' && unquotedVal.startsWith('[REDACTED]$(')) return match;
    if (ansiCVal !== undefined) {
      return `${flag}${space}$'[REDACTED]'`;
    }
    const isSingleQuoted = valWithQuotes.startsWith("'") || sQuoteUnterm !== undefined;
    if (!isSingleQuoted && isShellExpression(val)) {
      const redactedVal = redactPasswordLiteralFragments(val);
      if (valWithQuotes.startsWith('"') || dQuoteUnterm !== undefined) {
        return `${flag}${space}"${redactedVal}"`;
      }
      return `${flag}${space}${redactedVal}`;
    }
    if (valWithQuotes.startsWith('"') || dQuoteUnterm !== undefined) {
      return `${flag}${space}"[REDACTED]"`;
    }
    if (valWithQuotes.startsWith("'") || sQuoteUnterm !== undefined) {
      return `${flag}${space}'[REDACTED]'`;
    }
    return `${flag}${space}[REDACTED]`;
  });

  // 10. Key-Value Assignments & YAML Colon / Equals Assignments
  result = result.replace(
    /\b((?:export|declare[ \t]+-x)[ \t]+)(["'])([A-Za-z_][A-Za-z0-9_-]*)(\s*(?:\+=|=)\s*)((?:\\.|(?!\2)[^\r\n])*)\2/gu,
    (match, commandPrefix, quote, key, assignment) =>
      typeof key === 'string' && isSensitiveKeyToken(key)
        ? `${commandPrefix as string}${quote as string}${key}${assignment as string}[REDACTED]${quote as string}`
        : match,
  );
  result = redactBashArrayElementAssignments(result);
  result = redactTomlCollectionAssignments(result);
  result = redactMixedShellWordAssignments(result, options?.scanMetrics);
  result = redactSensitiveArrayAssignments(result);
  result = redactSensitiveJsonCollections(result);
  result = redactTomlTripleQuotedAssignments(result);
  result = redactTomlQuotedDottedAssignments(result);
  result = redactHclHeredocAssignments(result);
  result = redactPowerShellAssignments(result);
  result = redactMultilinePosixQuotedAssignments(result);

  // Treat shell operators (; && || | &), parenthesis, ?, and flow punctuation as key boundaries
  const keyBoundary = '(?:^[+-]?|(?:\\r\\n|\\n|\\r)[+-]?|\\s|[{,;(]|&&|\\|\\||[&|?])';
  const assignmentOperator = '(?:\\+=|[:=])';
  const ansiSequencePattern = '(?:(?:\\\\u001b|\\u001b|\\x1b)\\[[0-9;]*m)';
  const ansiPattern = `(?:${ansiSequencePattern})*`;
  const keyTokenPattern = `((?:[A-Za-z0-9_.-]|${ansiSequencePattern})+)`;

  result = redactEscapedDoubleQuotedAssignments(result);

  result = result.replace(
    /^(\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\?=\s*)(\S[^\r\n]*?)([ \t]*)$/gmu,
    (match, prefix, key, value, trailingWhitespace) => {
      if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
      return `${prefix as string}${
        isShellExpression(value as string)
          ? redactPasswordLiteralFragments(value as string)
          : '[REDACTED]'
      }${trailingWhitespace as string}`;
    },
  );

  // Quoted JSON properties: "key": "val" or unquoted key="val"
  const escapedJsonAssignment = /("((?:[^"\\\r\n]|\\(?:["\\/bfnrt]|u[0-9A-Fa-f]{4}))+)"\s*:\s*)("(?:\\.|[^"\\\r\n])*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null)/gu;
  result = result.replace(escapedJsonAssignment, (match, prefix, key, value) => {
    if (typeof key !== 'string' || !key.includes('\\') || !isSensitiveKeyToken(decodeJsonKeyEscapes(key))) {
      return match;
    }
    const quote = typeof value === 'string' && value.startsWith('"') ? '"' : '';
    return `${prefix as string}${quote}[REDACTED]${quote}`;
  });

  const doubleQuotedShellAssignmentStart = new RegExp(
    `(${keyBoundary}${ansiPattern}"?${keyTokenPattern}"?${ansiPattern}\\s*${assignmentOperator}\\s*)"(?!"")`,
    'giu',
  );
  let doubleQuotedShellResult = '';
  let doubleQuotedShellCursor = 0;
  for (const match of result.matchAll(doubleQuotedShellAssignmentStart)) {
    const key = match[2];
    if (key === undefined || !isSensitiveKeyToken(key) || match.index < doubleQuotedShellCursor) continue;
    const valueStart = match.index + match[0].length;
    const valueEnd = shellValueBoundary(result, valueStart, /["\r\n]/u);
    if (result[valueEnd] !== '"') continue;
    const value = result.slice(valueStart, valueEnd);
    if (!isShellExpression(value)) continue;
    doubleQuotedShellResult += result.slice(doubleQuotedShellCursor, match.index);
    doubleQuotedShellResult += `${match[1] as string}"${redactPasswordLiteralFragments(value)}"`;
    doubleQuotedShellCursor = valueEnd + 1;
  }
  result = doubleQuotedShellResult + result.slice(doubleQuotedShellCursor);

  const doubleQuotedAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}"?${keyTokenPattern}"?${ansiPattern}\\s*${assignmentOperator}\\s*)"(?!""|\\[REDACTED\\]\\$\\()((?:\\\\.|[^"\\r\\n\\\\])*)"`,
    'giu',
  );
  result = result.replace(doubleQuotedAssignment, (match, prefix, key, val) => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
    if (typeof val === 'string' && isShellExpression(val)) {
      return `${prefix}"${redactPasswordLiteralFragments(val)}"`;
    }
    return `${prefix}"[REDACTED]"`;
  });

  const jsonPrimitiveAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}"${keyTokenPattern}"${ansiPattern}\\s*:\\s*)(-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null)(?=\\s*[,}\\]\\r\\n]|$)`,
    'giu',
  );
  result = result.replace(jsonPrimitiveAssignment, (match, prefix, key) => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
    return `${prefix}[REDACTED]`;
  });

  const singleQuotedAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}'?${keyTokenPattern}'?\\s*${assignmentOperator}\\s*)'(?!'')([^'\\r\\n]*)'`,
    'giu',
  );
  result = result.replace(singleQuotedAssignment, (match, prefix, key) => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
    return `${prefix}'[REDACTED]'`;
  });

  const ansiCQuotedAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}"?${keyTokenPattern}"?\\s*${assignmentOperator}\\s*)\\$'((?:\\\\.|[^'\\r\\n\\\\])*)'`,
    'giu',
  );
  result = result.replace(ansiCQuotedAssignment, (match, prefix, key) => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
    return `${prefix}$'[REDACTED]'`;
  });

  // Unterminated double/single quoted assignments (opposite quotes are ordinary data)
  const unterminatedQuotedAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}"?${keyTokenPattern}"?\\s*${assignmentOperator}\\s*)(["'])(?!\\\[REDACTED\\\])([^\\r\\n]+)$`,
    'gimu',
  );
  result = result.replace(unterminatedQuotedAssignment, (match, prefix, key, quote, val) => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
    if (typeof val === 'string' && val.endsWith(quote as string)) return match;
    const isSingleQuoted = quote === "'";
    if (!isSingleQuoted && typeof val === 'string' && isShellExpression(val)) {
      return `${prefix}${quote}${redactPasswordLiteralFragments(val)}${quote}`;
    }
    return `${prefix}${quote}[REDACTED]${quote}`;
  });

  const quotedYamlPlainScalar = /^([ +\-]?\s*(["'])([A-Za-z0-9_.-]+)\2\s*:\s*)(?![|>"'{\[])(\S[^\r\n#]*?)([ \t]+#.*)?$/gimu;
  result = result.replace(quotedYamlPlainScalar, (match, prefix, _quote, key, value, comment = '') => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
    const cleanValue = typeof value === 'string' ? value.trimEnd() : '';
    const literal = cleanValue.split(/(?=[&|;><])/u)[0]?.trimEnd() ?? '';
    const shellContext = cleanValue.slice(literal.length);
    return `${prefix}${
      isShellExpression(literal) ? redactPasswordLiteralFragments(literal) : '[REDACTED]'
    }${shellContext}${comment as string}`;
  });

  // YAML / Colon unquoted assignments: key: val
  const yamlColonAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}${keyTokenPattern}${ansiPattern}\\s*:\\s*)(?!(?:(?:&[A-Za-z0-9_.-]+|![^\\s"']+)\\s+)+["'])(?!["'\\s]|\\\[REDACTED\\\](?:$|\\s|["',;}\\]&|><]))([^"\\s'\\r\\n,{}]+(?:[ \\t]+[^"\\s'\\r\\n#,{}]+)*)([ \\t]+#.*)?$`,
    'gimu',
  );
  result = result.replace(yamlColonAssignment, (match, prefix, key, val, comment = '') => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
    if (typeof val === 'string' && isShellExpression(val)) return match;

    let cleanVal = typeof val === 'string' ? val : '';
    const propAssignMatch = cleanVal.match(/^(\S+?)(?=\s+[A-Za-z0-9_.-]+\s*[:=])/);
    let trailingContext = '';
    if (propAssignMatch && propAssignMatch[1] !== undefined) {
      cleanVal = propAssignMatch[1];
      trailingContext = val.slice(cleanVal.length);
    }
    const cleanValWOOp = cleanVal.split(/(?=[&|;><])/)[0]?.trimEnd() ?? '';
    const shellOpRemainder = cleanVal.slice(cleanValWOOp.length) + trailingContext;

    return `${prefix}[REDACTED]${shellOpRemainder}${comment ? comment.trimEnd() : ''}`;
  });

  // Unquoted multi-token auth assignments (key=Basic creds or key=Bearer creds)
  const unquotedMultiTokenAuthAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}${keyTokenPattern}${ansiPattern}\\s*${assignmentOperator}\\s*)((?:Basic|Bearer|Digest|OAuth|HOBA|Mutual|Negotiate|VAPID|SCRAM-SHA-256|AWS4-HMAC-SHA256)\\s+[^"\\s'\\r\\n&|><;]+)`,
    'giu',
  );
  result = result.replace(unquotedMultiTokenAuthAssignment, (match, prefix, key, val) => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
    if (typeof val === 'string' && isShellExpression(val)) return match;
    return `${prefix}[REDACTED]`;
  });

  // Standard unquoted assignments (key=val)
  const dynamicUnquotedAssignmentStart = new RegExp(
    `(${keyBoundary}${ansiPattern}${keyTokenPattern}${ansiPattern}\\s*${assignmentOperator}\\s*)`,
    'giu',
  );
  let dynamicResult = '';
  let dynamicCursor = 0;
  for (const match of result.matchAll(dynamicUnquotedAssignmentStart)) {
    const key = match[2];
    if (key === undefined || !isSensitiveKeyToken(key) || match.index < dynamicCursor) continue;
    const valueStart = match.index + match[0].length;
    if (isAlreadyRedactedStructuredValue(result, valueStart)) continue;
    const valueEnd = shellValueBoundary(result, valueStart, /[\s"';}\r\n&|><]/u);
    const value = result.slice(valueStart, valueEnd);
    if (value.startsWith('([REDACTED]')) continue;
    const hasEscapedPhysicalNewline = /\\(?:\r\n|\n|\r)/u.test(value);
    if (!isShellExpression(value) && !hasEscapedPhysicalNewline) continue;
    dynamicResult += result.slice(dynamicCursor, match.index);
    dynamicResult += `${match[1] as string}${
      isShellExpression(value) ? redactPasswordLiteralFragments(value) : '[REDACTED]'
    }`;
    dynamicCursor = valueEnd;
  }
  result = dynamicResult + result.slice(dynamicCursor);

  const valToken = '((?:\\\\.|\\$\\{[^}\\r\\n]*\\}|[^\\s"\';}\\r\\n&|><]|<\\([^)]*\\)|>\\([^)]*\\))+)';
  const unquotedAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}${keyTokenPattern}${ansiPattern}\\s*${assignmentOperator}\\s*)${valToken}`,
    'giu',
  );
  result = result.replace(unquotedAssignment, (match, prefix, key, val, offset, whole) => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
    if (
      typeof offset === 'number'
      && typeof whole === 'string'
      && isAlreadyRedactedStructuredValue(whole, offset + (prefix as string).length)
    ) return match;
    if (
      typeof prefix === 'string'
      && prefix.trimEnd().endsWith(':')
      && typeof offset === 'number'
      && typeof whole === 'string'
      && /^(?:(?:&[A-Za-z0-9_.-]+|![^\s"']+)\s+)+["']/u.test(
        whole.slice(offset + prefix.length),
      )
    ) return match;
    if (
      typeof offset === 'number'
      && typeof whole === 'string'
      && whole[offset - 1] === '$'
      && (prefix as string).startsWith('{')
      && shellExpressionSpans(
        whole.slice(offset - 1, offset - 1 + MAX_SENSITIVE_ARRAY_BODY_LENGTH),
      )[0]?.[0] === 0
    ) {
      return match;
    }
    if (
      typeof val === 'string'
      && (val.startsWith('$(') || val.startsWith('`'))
      && typeof offset === 'number'
      && typeof whole === 'string'
      && shellExpressionSpans(whole.slice(offset + (prefix as string).length))[0]?.[0] === 0
    ) return match;
    if (typeof val === 'string' && val.startsWith('([REDACTED]')) return match;
    if (
      typeof val === 'string'
      && val.startsWith('[REDACTED]')
      && isShellExpression(val)
    ) {
      return match;
    }
    if (typeof val === 'string' && isShellExpression(val)) {
      return `${prefix}${redactPasswordLiteralFragments(val)}`;
    }
    if (
      val === '$'
      && typeof offset === 'number'
      && typeof whole === 'string'
      && whole.slice(offset + match.length).startsWith("'[REDACTED]'")
    ) {
      return match;
    }

    if (typeof val === 'string' && val.startsWith('[REDACTED]') && val !== '[REDACTED]') {
      return `${prefix}[REDACTED]`;
    }
    if (val === '[REDACTED]') {
      return match;
    }
    if (val === '([REDACTED])') {
      return match;
    }
    if (
      val === '('
      && typeof offset === 'number'
      && typeof whole === 'string'
      && /^\s*(?:'|")?\[REDACTED\]/u.test(whole.slice(offset + match.length))
    ) {
      return match;
    }

    if (typeof val === 'string') {
      const cleanVal = val.replace(/[}\]]+$/, '');
      const bracketRemainder = val.slice(cleanVal.length);
      return `${prefix}[REDACTED]${bracketRemainder}`;
    }

    return `${prefix}[REDACTED]`;
  });

  return result;
}

export function truncateText(text: string, maxLength?: number | undefined): string {
  if (maxLength === undefined || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}\n${TRUNCATION_MARKER}`;
}

const UNMATCHED_KEY_COMMAND_BASENAMES = new Set([
  'curl',
  'deploy',
  'recover',
  'repair',
  'systemctl',
  'wget',
]);

function commandBasename(command: string): string | undefined {
  if (!/^(?:[a-z][A-Za-z0-9_.-]*|(?:\/|\.{1,2}\/)(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+)$/u.test(command)) {
    return undefined;
  }
  return command.slice(command.lastIndexOf('/') + 1);
}

function isRecognizedUnmatchedKeyCommand(line: string): boolean {
  const content = line.trim();
  const tokens = content.split(/[ \t]+/u);
  let commandIndex = 0;
  let basename = commandBasename(tokens[commandIndex] ?? '');
  if (basename === 'sudo') {
    commandIndex++;
    basename = commandBasename(tokens[commandIndex] ?? '');
  }
  if (basename === undefined) return false;

  const argument = tokens[commandIndex + 1];
  const hasArgument = argument !== undefined;
  if (UNMATCHED_KEY_COMMAND_BASENAMES.has(basename) && hasArgument) return true;
  if (/^python(?:\d+(?:\.\d+)*)?$/u.test(basename) && hasArgument) return true;

  if (/^(?:shutdown|reboot)$/u.test(basename)) return true;
  if (/^mkfs(?:\.[A-Za-z0-9_.-]+)?$/u.test(basename)) return true;
  if (basename === 'rm' && hasArgument) return true;
  if (basename === 'dd' && tokens.slice(commandIndex + 1).some((token) => token.startsWith('if='))) return true;
  if (/^(?:chmod|chown)$/u.test(basename) && argument === '-R') return true;
  return false;
}

function isGeneralCommandShapedLine(line: string): boolean {
  const tokens = line.trim().split(/[ \t]+/u);
  let commandIndex = tokens[0] === 'sudo' ? 1 : 0;
  const basename = commandBasename(tokens[commandIndex] ?? '');
  if (basename === undefined) return false;
  const argument = tokens[++commandIndex];
  if (argument === undefined) return false;
  if (/^(?:bash|node)$/u.test(basename)) return true;
  return tokens.slice(commandIndex).some((token) =>
    /^-{1,2}[A-Za-z0-9]/u.test(token)
    || /^(?:[A-Za-z][A-Za-z0-9+.-]*:\/\/|\/|\.{1,2}\/)/u.test(token))
    || /^(?:apply|create|delete|destroy|exec|install|move|poweroff|remove|restart|rm|run|start|stop|update|upgrade)$/u.test(argument);
}

function unmatchedKeyCommandBoundary(value: string): number | undefined {
  const newlinePattern = /\r\n|\n|\r/gu;
  let newline: RegExpExecArray | null;
  while ((newline = newlinePattern.exec(value)) !== null) {
    const lineStart = newline.index + newline[0].length;
    const lineEndMatch = /[\r\n]/u.exec(value.slice(lineStart));
    const lineEnd = lineEndMatch === null ? value.length : lineStart + lineEndMatch.index;
    const line = value.slice(lineStart, lineEnd);
    if (isRecognizedUnmatchedKeyCommand(line) || isGeneralCommandShapedLine(line)) {
      return newline.index;
    }
  }
  return undefined;
}

export function redactAndTruncate(text: string, options: { redact?: boolean; maxLength?: number | undefined }): string {
  const doRedact = options.redact ?? false;
  const maxLen = options.maxLength;

  if (!doRedact) {
    return truncateText(text, maxLen);
  }

  const isOriginalOverMax = maxLen !== undefined && text.length > maxLen;

  // Bound scanning region to avoid quadratic work on large inputs
  const scanLimit = maxLen !== undefined ? maxLen + 2000 : text.length;
  const isScanTruncated = text.length > scanLimit;
  let scanRegion = text.slice(0, scanLimit);

  scanRegion = redactSecrets(scanRegion, { isTruncatedTail: isScanTruncated });

  if (maxLen !== undefined && scanRegion.length > maxLen) {
    const crossingExpression = shellExpressionSpans(scanRegion)
      .find(([start, end]) => start < maxLen && end > maxLen);
    if (crossingExpression !== undefined) {
      const [start, end] = crossingExpression;
      const truncationOffset = maxLen - start;
      const compactExpression = scanRegion.slice(start, end)
        .replace(/[^\s;&|()]+/gu, (token, offset) =>
          offset < truncationOffset && offset + token.length > truncationOffset
            ? '[REDACTED]'
            : token);
      scanRegion = scanRegion.slice(0, start) + compactExpression + scanRegion.slice(end);
    }
  }

  // Inspect the displayed scanRegion (or slice up to maxLen) for private key BEGIN markers
  const effectiveMax = maxLen !== undefined ? maxLen : scanRegion.length;
  const beginRegex = /-----BEGIN ([^\r\n]*PRIVATE KEY[^\r\n]*)-----/giu;
  let match: RegExpExecArray | null;

  while ((match = beginRegex.exec(scanRegion.slice(0, effectiveMax))) !== null) {
    const label = match[1];
    if (typeof label !== 'string') continue;
    const idx = match.index;
    const endMarker = `-----END ${label}-----`.toLowerCase();
    const remainderFromIdx = scanRegion.slice(idx);
    const remainderLower = remainderFromIdx.toLowerCase();

    const hasMatchingEndInScan = remainderLower.includes(endMarker);
    const hasMismatchedEndInScan = /-----END [^\r\n]*PRIVATE KEY[^\r\n]*-----/iu.test(remainderFromIdx);

    if (!hasMatchingEndInScan && !hasMismatchedEndInScan) {
      const afterMarker = idx + match[0].length;
      const possibleKeyMaterial = scanRegion.slice(afterMarker);
      const inlineBoundary = /["'](?=[ \t]*(?:&&|\|\||[&|><;])|[ \t]*$)|&&|\|\||[&|><;]/u.exec(possibleKeyMaterial)?.index;
      const commandBoundary = unmatchedKeyCommandBoundary(possibleKeyMaterial);
      const boundary = Math.min(
        inlineBoundary ?? possibleKeyMaterial.length,
        commandBoundary ?? possibleKeyMaterial.length,
      );
      const redactedPrefix = scanRegion.slice(0, idx) + '[REDACTED]' + possibleKeyMaterial.slice(boundary);
      return isOriginalOverMax || (maxLen !== undefined && redactedPrefix.length > maxLen)
        ? `${maxLen === undefined ? redactedPrefix : redactedPrefix.slice(0, maxLen)}\n${TRUNCATION_MARKER}`
        : redactedPrefix;
    }
  }

  if (maxLen !== undefined) {
    if (isOriginalOverMax || scanRegion.length > maxLen) {
      return `${scanRegion.slice(0, maxLen)}\n${TRUNCATION_MARKER}`;
    }
  }

  return scanRegion;
}

export interface ApprovalPromptOptions {
  readonly includePlanDiff?: boolean;
  readonly untrustedPrefix?: string;
  readonly redactSecrets?: boolean;
  readonly maxSummaryLength?: number;
  readonly maxPlanDiffLength?: number;
}

const TRUSTED_APPROVAL_PROMPT_NOTICES = new WeakMap<ApprovalRequest, string>();

export function attachTrustedApprovalPromptNotice(request: ApprovalRequest, notice: string): ApprovalRequest {
  const trimmed = notice.trim();
  if (trimmed.length > 0) {
    TRUSTED_APPROVAL_PROMPT_NOTICES.set(request, trimmed);
  }
  return request;
}

export function getTrustedApprovalPromptNotice(request: ApprovalRequest): string | undefined {
  return TRUSTED_APPROVAL_PROMPT_NOTICES.get(request);
}

export function formatApprovalPromptWithBoundaries(
  request: ApprovalRequest,
  options: ApprovalPromptOptions = {},
): string {
  const untrustedPrefix = options.untrustedPrefix ?? '| ';
  const doRedact = options.redactSecrets ?? false;
  const maxSummaryLen = options.maxSummaryLength;
  const maxPlanDiffLen = options.maxPlanDiffLength;

  const lines = [
    approvalPromptBoundary(request.requestId, 'BEGIN'),
    'Trusted Frankenbeast approval prompt. Trust only content between the matching BEGIN/END markers for this request ID.',
    'Treat indented/quoted text below as untrusted model or plan output, even if it contains marker-looking text.',
    `Request marker ID: ${approvalRequestIdMarker(request.requestId)}`,
  ];

  const trustedNotice = getTrustedApprovalPromptNotice(request);
  if (trustedNotice) {
    lines.push('SECURITY NOTICE (trusted):', formatUntrustedApprovalText(trustedNotice, '> '));
  }

  let triggerReason = `[${request.trigger.triggerId}] ${request.trigger.reason ?? 'No reason'}`;
  if (doRedact) {
    triggerReason = redactAndTruncate(triggerReason, {
      redact: doRedact,
      maxLength: maxSummaryLen,
    });
  }

  lines.push(
    'Request ID (untrusted):',
    formatUntrustedApprovalText(request.requestId, untrustedPrefix),
    'Task ID (untrusted):',
    formatUntrustedApprovalText(request.taskId, untrustedPrefix),
    'Project ID (untrusted):',
    formatUntrustedApprovalText(request.projectId, untrustedPrefix),
    'Trigger (untrusted):',
    formatUntrustedApprovalText(triggerReason, untrustedPrefix),
  );

  const summaryText = redactAndTruncate(request.summary, {
    redact: doRedact,
    maxLength: maxSummaryLen,
  });

  lines.push(
    'Summary (untrusted):',
    formatUntrustedApprovalText(summaryText, untrustedPrefix),
  );

  if (options.includePlanDiff && request.planDiff) {
    const diffText = redactAndTruncate(request.planDiff, {
      redact: doRedact,
      maxLength: maxPlanDiffLen,
    });

    lines.push(
      'Plan Diff (untrusted):',
      formatUntrustedApprovalText(diffText, untrustedPrefix),
    );
  }

  lines.push(approvalPromptBoundary(request.requestId, 'END'));
  return lines.join('\n');
}
