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
  'authorization',
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

  // Normalize camelCase boundaries before lowercasing (e.g., clientSecret -> client_secret)
  const withSeparators = clean.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
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
  const lines = normalizedBody.split(/\r\n|\n|\r/u).map((l) => l.trim()).filter((l) => l.length > 0);
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

function redactUrlPasswords(text: string, isTruncatedTail = false): string {
  if (isTruncatedTail) {
    return text.replace(
      /\b([a-z0-9+.-]+:\/\/(?:[a-zA-Z0-9_%+.-]*:))([^@/\s]+)(?:(@[a-zA-Z0-9.\[\]:-]+)|(?=$))/giu,
      (_match, prefix, password, atHost) => {
        const redactedPassword = isShellExpression(password)
          ? redactPasswordLiteralFragments(password)
          : '[REDACTED]';
        return `${prefix}${redactedPassword}${atHost ?? ''}`;
      },
    );
  }

  return text.replace(
    /\b([a-z0-9+.-]+:\/\/(?:[a-zA-Z0-9_%+.-]*:))([^@/\s]+)(@[a-zA-Z0-9.\[\]:-]+)/giu,
    (_match, prefix, password, atHost) => {
      const redactedPassword = isShellExpression(password)
        ? redactPasswordLiteralFragments(password)
        : '[REDACTED]';
      return `${prefix}${redactedPassword}${atHost}`;
    },
  );
}

function redactUrlQueryParams(text: string): string {
  return text.replace(
    /([?&])([A-Za-z0-9_.-]+)(=)([^&\s"'\r\n#;|<>]*)?/giu,
    (match, p1, key, p3, val) => {
      if (isSensitiveKeyToken(key)) {
        if (typeof val === 'string' && isShellExpression(val)) {
          return `${p1}${key}${p3}${redactPasswordLiteralFragments(val)}`;
        }
        return `${p1}${key}${p3}[REDACTED]`;
      }
      return match;
    },
  );
}

function redactCurlUserCredentials(text: string): string {
  const curlUserRegex = /(--user|--proxy-user|-u|-U)(\s+|=)(?:\$'([A-Za-z0-9_.-]+:)((?:\\.|[^'\\\r\n])*)'|"([A-Za-z0-9_.-]+:)((?:\\.|[^"\\\r\n])*)"|'([A-Za-z0-9_.-]+:)([^'\r\n]*)'|([A-Za-z0-9_.-]+:)([^\s"'\r\n&|><;]+))/giu;
  return text.replace(curlUserRegex, (_match, flag, separator, ansiUser, _ansiPassword, doubleUser, doublePassword, singleUser, _singlePassword, bareUser, barePassword) => {
    if (typeof ansiUser === 'string') return `${flag}${separator}$'${ansiUser}[REDACTED]'`;
    if (typeof doubleUser === 'string') {
      const redactedPassword = isShellExpression(doublePassword)
        ? redactPasswordLiteralFragments(doublePassword)
        : '[REDACTED]';
      return `${flag}${separator}"${doubleUser}${redactedPassword}"`;
    }
    if (typeof singleUser === 'string') return `${flag}${separator}'${singleUser}[REDACTED]'`;
    const redactedPassword = isShellExpression(barePassword)
      ? redactPasswordLiteralFragments(barePassword)
      : '[REDACTED]';
    return `${flag}${separator}${bareUser as string}${redactedPassword}`;
  });
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
      let depth = 1;
      let quote: '"' | "'" | undefined;
      for (let index = start + 2; index < val.length; index++) {
        if (val[index] === '\\') {
          index++;
        } else if (quote !== undefined) {
          if (val[index] === quote) quote = undefined;
        } else if (val[index] === '"' || val[index] === "'") {
          quote = val[index] as '"' | "'";
        } else if (val[index] === '(') {
          depth++;
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
  let result = '';
  let cursor = 0;
  let segmentStart = 0;
  let quote: '"' | "'" | undefined;
  let escaped = false;

  for (let index = 0; index < body.length; index++) {
    const character = body[index];
    if (quote !== undefined) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\' && quote === '"') {
        escaped = true;
      } else if (character === quote) {
        const content = body.slice(segmentStart + 1, index);
        result += body.slice(cursor, segmentStart);
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

  result += redactPasswordLiteralFragments(body.slice(cursor));
  return result;
}

const MAX_SENSITIVE_ARRAY_BODY_LENGTH = 65_536;

function redactSensitiveArrayAssignments(text: string): string {
  const assignmentStart = /(?:^|[\s{,;(])([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)\s*[:=]\s*\(/gmu;
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
      ...['\r', '\n']
        .map((newline) => text.indexOf(newline, bodyStart))
        .filter((index) => index >= 0),
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
    result += redactArrayLiteralFragments(text.slice(openingIndex + 1, closingIndex));
    result += ')';
    cursor = closingIndex + 1;
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
    result += text.slice(cursor, match.index);
    result += `${match[1]}[REDACTED]${text.slice(closingStart, closingStart + openingSlashCount + 1)}`;
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

  const valueProperty = /(["']value["']\s*:\s*)("(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*')/giu;
  let result = '';
  let cursor = 0;
  for (const match of object.matchAll(valueProperty)) {
    if (depthAt[match.index] !== 1) continue;
    const prefix = match[1] as string;
    const quotedValue = match[2] as string;
    result += object.slice(cursor, match.index);
    result += `${prefix}${quotedValue[0]}[REDACTED]${quotedValue[0]}`;
    cursor = match.index + match[0].length;
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
    (_match, open, headerQuote, headerName, separator, valueQuote) =>
      `${open}${headerQuote}${headerName}${headerQuote}${separator}${valueQuote}[REDACTED]${valueQuote}`,
  );

  return result;
}

function redactAuthorizationHeaders(text: string): string {
  let result = text;

  const headers = SENSITIVE_HEADER_NAMES;

  // Cookie separators are header syntax, not shell boundaries, on standalone lines.
  result = result.replace(
    /(^|\r\n|\n|\r)(\s*(?:[+-]\s*)?Cookie\s*:\s*)[^;\s=&|<>]+\s*=\s*(?:"(?:\\.|[^"\\\r\n])*"|[^;\s&|<>]*)(?:;\s*[^;\s=&|<>]+\s*=\s*(?:"(?:\\.|[^"\\\r\n])*"|[^;\s&|<>]*))*/giu,
    '$1$2[REDACTED]',
  );

  // 1. Standalone header lines at start of line: Authorization: Basic foo.
  // Shell operators only end the value when they are outside a balanced substitution.
  const standaloneHeader = new RegExp(`^(\\s*(?:[+-]\\s*)?${headers}\\s*:\\s*)`, 'iu');
  result = result.replace(/(^|\r\n|\n|\r)([^\r\n]*)/gu, (_match, lineStart, line) => {
    const headerMatch = (line as string).match(standaloneHeader);
    const prefix = headerMatch?.[1];
    if (prefix === undefined || (line as string).slice(prefix.length).startsWith('[REDACTED]')) {
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
  result = result.replace(
    new RegExp(`(?<!["'])(\\b${headers}\\s*:\\s*)(?!\\s*\\\[REDACTED\\\])([^\\s"'\r\n&|><;]+)`, 'giu'),
    '$1[REDACTED]',
  );

  return result;
}

function redactShellScalarLine(content: string, withinShellContext = false): string | undefined {
  const tokens = content.trim().split(/\s+/u);
  const commandIndex = tokens[0] === 'sudo' ? 1 : 0;
  const command = tokens[commandIndex];
  if (command === undefined) return undefined;

  if (
    tokens.length <= commandIndex + 1
    && !/^(?:shutdown|reboot|mkfs(?:\.[A-Za-z0-9_.-]+)?)$/u.test(command)
  ) return undefined;
  const isEstablishedVisibleFollowup = withinShellContext
    && /^(?:echo|printf)\s/u.test(content);
  if (!isRecognizedUnmatchedKeyCommand(content) && !isEstablishedVisibleFollowup) return undefined;

  const prefix = commandIndex === 1 ? ['sudo', command] : [command];
  let tokenIndex = commandIndex + 1;
  while (tokenIndex < tokens.length && /^-[A-Za-z0-9-]+$/u.test(tokens[tokenIndex] ?? '')) {
    prefix.push(tokens[tokenIndex] as string);
    tokenIndex++;
  }

  return tokenIndex < tokens.length ? `${prefix.join(' ')} [REDACTED]` : prefix.join(' ');
}

function redactYamlMultilineBlocks(text: string): string {
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
      const contentLine = blockDiffPrefix !== '' && line.startsWith(blockDiffPrefix)
        ? line.slice(blockDiffPrefix.length)
        : line;
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
            out.push(`${blockDiffPrefix}${contentLine.slice(0, currentIndent)}${shellStructure}`);
          }
        } else if (blockDiffPrefix !== '') {
          out.push(`${blockDiffPrefix}${contentLine.slice(0, currentIndent)}[REDACTED]`);
        }
        continue;
      } else {
        inRedactedBlock = false;
        blockDiffPrefix = '';
        preserveShellContext = false;
      }
    }

    const yamlBlockMatch = line.match(/^([+-]?)(\s*)(["']?)([A-Za-z0-9_-]+)\3\s*:\s*[|>](?:[-+]?\d?|\d?[-+]?)(?:\s*#.*)?$/);
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

export function redactSecrets(text: string, options?: { isTruncatedTail?: boolean }): string {
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

  // 2. URL Userinfo Passwords (supports dots and plus in username, IPv6 authority, cutoff boundary)
  result = redactUrlPasswords(result, isTruncatedTail);

  // 3. URL Query Parameters (?access_token=secret&...)
  result = redactUrlQueryParams(result);

  // 4. Curl --user and --proxy-user credentials (user:password)
  result = redactCurlUserCredentials(result);

  // 5. Structured and shell-style sensitive headers
  result = redactStructuredHeaders(result);
  result = redactAuthorizationHeaders(result);

  // 6. Standalone Bearer tokens outside Authorization header (including short/single-char tokens)
  result = result.replace(
    /\b(Bearer\s+)([^\s"'\r\n&|><;]+)/giu,
    (_match, prefix, credential) => `${prefix as string}${
      isShellExpression(credential as string)
        ? redactPasswordLiteralFragments(credential as string)
        : '[REDACTED]'
    }`,
  );

  // 7. Explicit token formats (GitHub tokens, OpenAI sk- keys, JWTs)
  result = result.replace(
    /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/gu,
    '[REDACTED]',
  );
  result = result.replace(
    /\bsk-[A-Za-z0-9_-]{20,}\b/gu,
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

  // 9. Space-Separated CLI Flags (--flag val, --flag "val", --flag 'val', unterminated, shell expr)
  const flagRegex = /(--[A-Za-z0-9_-]+)(\s+)(\$'((?:\\.|[^'\r\n\\])*)'|"((?:\\(?:\r\n|[\r\n]|.)|[^"\r\n\\])*)"|'([^'\r\n]*)'|"([^"\r\n]+)$|'([^'\r\n]+)$|(?!--)((?:\\.|[^\s"'\r\n&|><;]|<\([^)]*\)|>\([^)]*\))+))/gimu;
  result = result.replace(flagRegex, (match, flag, space, valWithQuotes, ansiCVal, dQuoteVal, sQuoteVal, dQuoteUnterm, sQuoteUnterm, unquotedVal) => {
    if (typeof flag !== 'string' || !isSensitiveKeyToken(flag)) {
      return match;
    }
    const val = (ansiCVal ?? dQuoteVal ?? sQuoteVal ?? dQuoteUnterm ?? sQuoteUnterm ?? unquotedVal ?? valWithQuotes) as string;
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
  result = redactSensitiveArrayAssignments(result);

  // Treat shell operators (; && || | &), parenthesis, ?, and flow punctuation as key boundaries
  const keyBoundary = '(?:^[+-]?|(?:\\r\\n|\\n|\\r)[+-]?|\\s|[{,;(]|&&|\\|\\||[&|?])';
  const ansiPattern = '(?:(?:\\\\u001b|\\u001b|\\x1b)\\[[0-9;]*m)*';
  const keyTokenPattern = '([A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*)';

  result = redactEscapedDoubleQuotedAssignments(result);

  // Quoted JSON properties: "key": "val" or unquoted key="val"
  const doubleQuotedAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}"?${keyTokenPattern}"?${ansiPattern}\\s*[:=]\\s*)"((?:\\\\.|[^"\\r\\n\\\\])*)"`,
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
    `(${keyBoundary}${ansiPattern}'?${keyTokenPattern}'?\\s*[:=]\\s*)'([^'\\r\\n]*)'`,
    'giu',
  );
  result = result.replace(singleQuotedAssignment, (match, prefix, key) => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
    return `${prefix}'[REDACTED]'`;
  });

  const ansiCQuotedAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}"?${keyTokenPattern}"?\\s*[:=]\\s*)\\$'((?:\\\\.|[^'\\r\\n\\\\])*)'`,
    'giu',
  );
  result = result.replace(ansiCQuotedAssignment, (match, prefix, key) => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
    return `${prefix}$'[REDACTED]'`;
  });

  // Unterminated double/single quoted assignments (opposite quotes are ordinary data)
  const unterminatedQuotedAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}"?${keyTokenPattern}"?\\s*[:=]\\s*)(["'])(?!\\\[REDACTED\\\])([^\\r\\n]+)$`,
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

  // YAML / Colon unquoted assignments: key: val
  const yamlColonAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}${keyTokenPattern}${ansiPattern}\\s*:\\s*)(?!["'\\s]|\\\[REDACTED\\\](?:$|\\s|["',;}\\]&|><]))([^"\\s'\\r\\n,{}]+(?:[ \\t]+[^"\\s'\\r\\n#,{}]+)*)([ \\t]+#.*)?$`,
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
    `(${keyBoundary}${ansiPattern}${keyTokenPattern}${ansiPattern}\\s*[:=]\\s*)((?:Basic|Bearer)\\s+[^"\\s'\\r\\n&|><;]+)`,
    'giu',
  );
  result = result.replace(unquotedMultiTokenAuthAssignment, (match, prefix, key, val) => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
    if (typeof val === 'string' && isShellExpression(val)) return match;
    return `${prefix}[REDACTED]`;
  });

  // Standard unquoted assignments (key=val)
  const valToken = '((?:\\\\.|\\$\\{[^}\\r\\n]*\\}|[^\\s"\';}\\r\\n&|><]|<\\([^)]*\\)|>\\([^)]*\\))+)';
  const unquotedAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}${keyTokenPattern}${ansiPattern}\\s*[:=]\\s*)${valToken}`,
    'giu',
  );
  result = result.replace(unquotedAssignment, (match, prefix, key, val, offset, whole) => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
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

function unmatchedKeyCommandBoundary(value: string): number | undefined {
  const newlinePattern = /\r\n|\n|\r/gu;
  let newline: RegExpExecArray | null;
  while ((newline = newlinePattern.exec(value)) !== null) {
    const lineStart = newline.index + newline[0].length;
    const lineEndMatch = /[\r\n]/u.exec(value.slice(lineStart));
    const lineEnd = lineEndMatch === null ? value.length : lineStart + lineEndMatch.index;
    if (isRecognizedUnmatchedKeyCommand(value.slice(lineStart, lineEnd))) {
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
