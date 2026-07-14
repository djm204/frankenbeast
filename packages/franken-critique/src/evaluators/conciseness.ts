import type {
  Evaluator,
  EvaluationInput,
  EvaluationResult,
  EvaluationFinding,
} from './evaluator.js';

const COMMENT_LINE_PATTERN = /^\s*\/\//;
const BLOCK_COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;
const UNRESOLVED_COMMENT_MARKERS = [
  ['TO', 'DO'].join(''),
  ['FIX', 'ME'].join(''),
  ['HA', 'CK'].join(''),
  ['X', 'XX'].join(''),
] as const;
const UNRESOLVED_COMMENT_PATTERN = new RegExp(
  `//\\s*(${UNRESOLVED_COMMENT_MARKERS.join('|')})\\b`,
  'gi',
);
const UNRESOLVED_MARKER_PATTERN = new RegExp(
  `^\\s*(?:\\*+|//)?\\s*@?(${UNRESOLVED_COMMENT_MARKERS.join('|')})(?:\\b|(?=\\())`,
  'gim',
);
const UNRESOLVED_COMMENT_LINE_PATTERN = new RegExp(
  `//\\s*(${UNRESOLVED_COMMENT_MARKERS.join('|')})\\b`,
  'i',
);
const MAX_COMMENT_RATIO = 0.5;

interface UnresolvedMarkerOccurrence {
  readonly label: string;
  readonly index: number;
}

function skipQuotedLiteral(content: string, start: number): number {
  const quote = content[start];
  let index = start + 1;

  while (index < content.length) {
    const current = content[index];
    if (current === '\\') {
      index += 2;
      continue;
    }
    if (quote !== '`' && (current === '\n' || current === '\r')) {
      return index;
    }
    if (current === quote) {
      return index + 1;
    }
    index += 1;
  }

  return index;
}

function findLineCommentStart(
  content: string,
  lineStart: number,
  lineEnd: number,
): number {
  let index = lineStart;

  while (index < lineEnd) {
    const current = content[index];
    const next = content[index + 1];

    if (current === '"' || current === "'" || current === '`') {
      index = skipQuotedLiteral(content, index);
      continue;
    }

    if (current === '/' && next === '*') {
      const commentEnd = content.indexOf('*/', index + 2);
      index = commentEnd === -1 ? lineEnd : commentEnd + 2;
      continue;
    }

    if (current === '/' && next !== '/' && startsRegexLiteralOnLine(content, index, lineStart)) {
      index = skipRegexLiteral(content, index);
      continue;
    }

    if (current === '/' && next === '/') {
      return index;
    }

    index += 1;
  }

  return -1;
}

function startsRegexLiteralOnLine(
  content: string,
  index: number,
  lineStart: number,
): boolean {
  let cursor = index - 1;
  while (cursor >= lineStart && /\s/.test(content[cursor] ?? '')) {
    cursor -= 1;
  }

  if (cursor < lineStart) {
    return true;
  }

  let tokenStart = cursor;
  while (tokenStart >= lineStart && /[$\w]/.test(content[tokenStart] ?? '')) {
    tokenStart -= 1;
  }

  return (
    isRegexPrefixToken(content.slice(tokenStart + 1, cursor + 1)) ||
    followsForIterationKeywordOnLine(content, index) ||
    '([{=,:;!&|?+-*~^<>/'.includes(content[cursor] ?? '')
  );
}

function isRegexPrefixToken(token: string): boolean {
  return [
    'return',
    'throw',
    'case',
    'yield',
    'await',
    'typeof',
    'void',
    'delete',
    'else',
    'do',
    'default',
  ].includes(token);
}

function followsForIterationKeywordOnLine(content: string, index: number): boolean {
  const lineStart = content.lastIndexOf('\n', index - 1) + 1;
  return /\bfor\s*\([^)]*\b(?:of|in)\s*$/.test(
    content.slice(lineStart, index),
  );
}

function previousSignificantIndex(content: string, index: number): number {
  let cursor = index - 1;

  while (cursor >= 0) {
    while (cursor >= 0 && /\s/.test(content[cursor] ?? '')) {
      cursor -= 1;
    }

    if (cursor <= 0) {
      return cursor;
    }

    if (content[cursor] === '/' && content[cursor - 1] === '*') {
      const start = content.lastIndexOf('/*', cursor - 2);
      if (start === -1) {
        return cursor;
      }
      cursor = start - 1;
      continue;
    }

    const lineStart = content.lastIndexOf('\n', cursor) + 1;
    const lineCommentStart = findLineCommentStart(content, lineStart, cursor + 1);
    if (lineCommentStart !== -1) {
      cursor = lineCommentStart - 1;
      continue;
    }

    return cursor;
  }

  return cursor;
}

function previousSignificantCharacter(content: string, index: number): string {
  const cursor = previousSignificantIndex(content, index);
  return cursor >= 0 ? (content[cursor] ?? '') : '';
}

function previousSignificantToken(content: string, index: number): string {
  let cursor = previousSignificantIndex(content, index);

  const end = cursor + 1;
  while (cursor >= 0 && /[$\w]/.test(content[cursor] ?? '')) {
    cursor -= 1;
  }

  return content.slice(cursor + 1, end);
}

function previousTokenIsPropertyName(content: string, index: number): boolean {
  const tokenEnd = previousSignificantIndex(content, index) + 1;
  let cursor = tokenEnd - 1;
  while (cursor >= 0 && /[$\w]/.test(content[cursor] ?? '')) {
    cursor -= 1;
  }

  if (content[cursor] === '#') {
    return true;
  }

  return (
    content[cursor] === '.' &&
    !(content[cursor - 1] === '.' && content[cursor - 2] === '.')
  );
}

function isSpreadOperatorBefore(content: string, index: number): boolean {
  const previousIndex = previousSignificantIndex(content, index);
  return (
    content[previousIndex] === '.' &&
    content[previousIndex - 1] === '.' &&
    content[previousIndex - 2] === '.'
  );
}

function isOperandEndingCharacter(character: string): boolean {
  return /[$\w)\]]/.test(character);
}

function isPostfixOperatorBefore(content: string, index: number): boolean {
  const previousIndex = previousSignificantIndex(content, index);
  const previous = previousIndex >= 0 ? (content[previousIndex] ?? '') : '';

  if (previous === '!') {
    const operandIndex = previousSignificantIndex(content, previousIndex);
    const operand = operandIndex >= 0 ? (content[operandIndex] ?? '') : '';
    return isOperandEndingCharacter(operand);
  }

  if (
    (previous === '+' || previous === '-') &&
    content[previousIndex - 1] === previous
  ) {
    const operandIndex = previousSignificantIndex(content, previousIndex - 1);
    const operand = operandIndex >= 0 ? (content[operandIndex] ?? '') : '';
    return isOperandEndingCharacter(operand);
  }

  return false;
}

function findMatchingOpeningParen(content: string, closeIndex: number): number {
  const openParens: number[] = [];
  let cursor = 0;

  while (cursor <= closeIndex && cursor < content.length) {
    const current = content[cursor];
    const next = content[cursor + 1];

    if (current === '"' || current === "'" || current === '`') {
      cursor = skipQuotedLiteral(content, cursor);
      continue;
    }

    if (current === '/' && next === '/') {
      const lineEnd = content.indexOf('\n', cursor + 2);
      cursor = lineEnd === -1 ? content.length : lineEnd + 1;
      continue;
    }

    if (current === '/' && next === '*') {
      const commentEnd = content.indexOf('*/', cursor + 2);
      cursor = commentEnd === -1 ? content.length : commentEnd + 2;
      continue;
    }

    if (current === '/' && canStartRegexLiteralWhileMatchingParens(content, cursor)) {
      cursor = skipRegexLiteral(content, cursor);
      continue;
    }

    if (current === '(') {
      openParens.push(cursor);
    } else if (current === ')') {
      const openIndex = openParens.pop();
      if (cursor === closeIndex) {
        return openIndex ?? -1;
      }
    }

    cursor += 1;
  }

  return -1;
}

function followsControlCondition(content: string, index: number): boolean {
  const previousIndex = previousSignificantIndex(content, index);
  if (content[previousIndex] !== ')') {
    return false;
  }

  const openIndex = findMatchingOpeningParen(content, previousIndex);
  if (openIndex === -1) {
    return false;
  }

  return ['if', 'while', 'for', 'with'].includes(
    previousSignificantToken(content, openIndex),
  );
}

function canStartRegexLiteralWhileMatchingParens(
  content: string,
  index: number,
): boolean {
  const previous = previousSignificantCharacter(content, index);
  const previousToken = previousSignificantToken(content, index);
  if (isPostfixOperatorBefore(content, index)) {
    return false;
  }
  if (previousTokenIsPropertyName(content, index)) {
    return false;
  }
  if (isSpreadOperatorBefore(content, index)) {
    return true;
  }
  return (
    isRegexPrefixToken(previousToken) ||
    followsForIterationKeywordOnLine(content, index) ||
    previous === '' ||
    '([{=,:;!&|?+-*~^<>/'.includes(previous)
  );
}

function canStartRegexLiteral(content: string, index: number): boolean {
  const previous = previousSignificantCharacter(content, index);
  const previousToken = previousSignificantToken(content, index);
  if (isPostfixOperatorBefore(content, index)) {
    return false;
  }
  if (previousTokenIsPropertyName(content, index)) {
    return false;
  }
  if (isSpreadOperatorBefore(content, index)) {
    return true;
  }
  if (
    previous === '}' &&
    /^\s*$/.test(content.slice(content.lastIndexOf('\n', index - 1) + 1, index))
  ) {
    return true;
  }
  if (
    previous === '<' &&
    previousSignificantIndex(content, index) === index - 1 &&
    /[A-Za-z>]/.test(content[index + 1] ?? '')
  ) {
    let beforeLessThan = index - 2;
    while (beforeLessThan >= 0 && /\s/.test(content[beforeLessThan] ?? '')) {
      beforeLessThan -= 1;
    }
    if (!/[$\w)\]]/.test(content[beforeLessThan] ?? '')) {
      return false;
    }
  }
  return (
    isRegexPrefixToken(previousToken) ||
    followsForIterationKeywordOnLine(content, index) ||
    followsControlCondition(content, index) ||
    previous === '' ||
    '([{=,:;!&|?+-*~^<>/'.includes(previous)
  );
}

function skipRegexLiteral(content: string, start: number): number {
  let index = start + 1;
  let inCharacterClass = false;

  while (index < content.length) {
    const current = content[index];
    if (current === '\\') {
      index += 2;
      continue;
    }
    if ((current === '\n' || current === '\r') && !inCharacterClass) {
      return start + 1;
    }
    if (current === '[') {
      inCharacterClass = true;
    } else if (current === ']') {
      inCharacterClass = false;
    } else if (current === '/' && !inCharacterClass) {
      index += 1;
      while (/[$\w]/.test(content[index] ?? '')) {
        index += 1;
      }
      return index;
    }
    index += 1;
  }

  return index;
}

function isLikelyTypeArgumentTag(
  content: string,
  start: number,
  end: number,
): boolean {
  const tagText = content
    .slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim();
  if (
    !/^<\s*[A-Za-z_$][\w$]*(?:\s+(?:extends|=)\s*[^,>]+)?(?:\s*,\s*[A-Za-z_$][\w$]*(?:\s+(?:extends|=)\s*[^,>]+)?)*\s*>$/.test(
      tagText,
    )
  ) {
    return false;
  }

  let cursor = start - 1;
  while (cursor >= 0 && /\s/.test(content[cursor] ?? '')) {
    cursor -= 1;
  }
  const previous = content[cursor] ?? '';
  if (!/[$\w)=]/.test(previous)) {
    return false;
  }

  cursor = end;
  while (cursor < content.length && /\s/.test(content[cursor] ?? '')) {
    cursor += 1;
  }

  return ['(', '.', ';', ','].includes(content[cursor] ?? '');
}

function isLikelyJsxTagStart(content: string, index: number): boolean {
  const next = content[index + 1];
  if (!/[A-Za-z_$/>]/.test(next ?? '')) {
    return false;
  }
  if (content[index - 1] === '<') {
    return false;
  }

  if (next === '>') {
    return true;
  }

  const previousIndex = previousSignificantIndex(content, index);
  const previous = previousIndex === -1 ? '' : content[previousIndex] ?? '';
  const previousToken = previousSignificantToken(content, index);
  if (
    /[$\w)\]]/.test(previous) &&
    !['return', 'yield', 'case', 'else', 'do'].includes(previousToken)
  ) {
    return next === '/' && hasOpenJsxAncestorBefore(content, index);
  }

  if (next === '/') {
    return true;
  }

  return true;
}

function extractMarkerOccurrences(
  pattern: RegExp,
  comment: string,
  offset: number,
): UnresolvedMarkerOccurrence[] {
  pattern.lastIndex = 0;
  return [...comment.matchAll(pattern)].flatMap((match) =>
    match[1]
      ? [
          {
            label: match[1],
            index: offset + (match.index ?? 0) + match[0].indexOf(match[1]),
          },
        ]
      : [],
  );
}

function collectLineCommentMarkers(
  content: string,
  start: number,
): [UnresolvedMarkerOccurrence[], number] {
  const end = content.indexOf('\n', start + 2);
  const commentEnd = end === -1 ? content.length : end;
  const comment = content.slice(start, commentEnd);
  return [
    extractMarkerOccurrences(UNRESOLVED_COMMENT_PATTERN, comment, start),
    commentEnd,
  ];
}

function collectBlockCommentMarkers(
  content: string,
  start: number,
): [UnresolvedMarkerOccurrence[], number] {
  const end = content.indexOf('*/', start + 2);
  const commentEnd = end === -1 ? content.length : end + 2;
  const commentStart = start + 2;
  const comment = content
    .slice(commentStart, commentEnd)
    .replace(/\*\/$/, '');
  return [
    extractMarkerOccurrences(UNRESOLVED_MARKER_PATTERN, comment, commentStart),
    commentEnd,
  ];
}

function collectJsxTagExpressionMarkers(
  content: string,
  start: number,
  end: number,
): UnresolvedMarkerOccurrence[] {
  const markers: UnresolvedMarkerOccurrence[] = [];
  let index = start + 1;

  while (index < end - 1) {
    const current = content[index];
    if (current === '"' || current === "'") {
      index = skipQuotedLiteral(content, index);
      continue;
    }
    if (current === '/' && content[index + 1] === '*') {
      const [commentMarkers, commentEnd] = collectBlockCommentMarkers(
        content,
        index,
      );
      markers.push(...commentMarkers);
      index = commentEnd;
      continue;
    }
    if (current === '{') {
      const [expressionMarkers, expressionEnd] = collectCodeMarkers(
        content,
        index + 1,
        '}',
      );
      markers.push(...expressionMarkers);
      index = expressionEnd;
      continue;
    }
    index += 1;
  }

  return markers;
}

function skipJsxTag(content: string, start: number, limit = content.length): number {
  let index = start + 1;
  let quote = '';
  let braceDepth = 0;

  while (index < limit) {
    const current = content[index];
    if (quote) {
      if (current === '\\') {
        index += 2;
        continue;
      }
      if (current === quote) {
        quote = '';
      }
      index += 1;
      continue;
    }
    if (braceDepth > 0) {
      if (current === '"' || current === "'" || current === '`') {
        index = skipQuotedLiteral(content, index);
        continue;
      }
      if (current === '/' && content[index + 1] === '/') {
        const lineEnd = content.indexOf('\n', index + 2);
        index = lineEnd === -1 ? limit : lineEnd + 1;
        continue;
      }
      if (current === '/' && content[index + 1] === '*') {
        const commentEnd = content.indexOf('*/', index + 2);
        index = commentEnd === -1 ? limit : commentEnd + 2;
        continue;
      }
      if (current === '{') {
        braceDepth += 1;
      } else if (current === '}') {
        braceDepth -= 1;
      }
      index += 1;
      continue;
    }
    if (current === '"' || current === "'") {
      quote = current;
      index += 1;
      continue;
    }
    if (current === '{') {
      braceDepth = 1;
      index += 1;
      continue;
    }
    if (current === '>') {
      return index + 1;
    }
    index += 1;
  }

  return -1;
}

function findLastJsxTagBefore(
  content: string,
  end: number,
): { start: number; end: number; text: string } | undefined {
  let index = 0;
  let lastTag: { start: number; end: number; text: string } | undefined;

  while (index < end) {
    const current = content[index];
    const next = content[index + 1];

    if (current === '"' || current === "'" || current === '`') {
      index = skipQuotedLiteral(content, index);
      continue;
    }
    if (current === '/' && next === '/') {
      const lineEnd = content.indexOf('\n', index + 2);
      index = lineEnd === -1 ? end : lineEnd + 1;
      continue;
    }
    if (current === '/' && next === '*') {
      const commentEnd = content.indexOf('*/', index + 2);
      index = commentEnd === -1 ? end : commentEnd + 2;
      continue;
    }
    if (current === '<' && isLikelyJsxTagStart(content, index)) {
      const tagEnd = skipJsxTag(content, index, end);
      if (tagEnd !== -1) {
        if (!isLikelyTypeArgumentTag(content, index, tagEnd)) {
          lastTag = {
            start: index,
            end: tagEnd,
            text: content.slice(index, tagEnd).trim(),
          };
        }
        index = tagEnd;
        continue;
      }
    }
    index += 1;
  }

  return lastTag;
}

function findNextJsxTagAfter(content: string, start: number): string | undefined {
  let index = start;

  while (index < content.length) {
    const current = content[index];
    const next = content[index + 1];

    if (current === '"' || current === "'" || current === '`') {
      index = skipQuotedLiteral(content, index);
      continue;
    }
    if (current === '/' && next === '/') {
      const lineEnd = content.indexOf('\n', index + 2);
      index = lineEnd === -1 ? content.length : lineEnd + 1;
      continue;
    }
    if (current === '/' && next === '*') {
      const commentEnd = content.indexOf('*/', index + 2);
      index = commentEnd === -1 ? content.length : commentEnd + 2;
      continue;
    }
    if (current === '<' && isLikelyJsxTagStart(content, index)) {
      const tagEnd = skipJsxTag(content, index);
      if (tagEnd !== -1) {
        if (isLikelyTypeArgumentTag(content, index, tagEnd)) {
          index = tagEnd;
          continue;
        }
        return content.slice(index, tagEnd).trim();
      }
    }
    index += 1;
  }

  return undefined;
}

function jsxTagName(tag: string): string | undefined {
  const match = /^<\/?\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/.exec(
    tag,
  );
  return match?.[1];
}

function isSimpleJsxTagStart(content: string, index: number): boolean {
  const next = content[index + 1];
  return (
    content[index] === '<' &&
    /[A-Za-z_$/>]/.test(next ?? '') &&
    content[index - 1] !== '<'
  );
}

function hasOpenJsxAncestorBefore(content: string, end: number): boolean {
  const stack: string[] = [];
  let index = 0;

  while (index < end) {
    const current = content[index];
    const next = content[index + 1];

    if (current === '"' || current === "'" || current === '`') {
      index = skipQuotedLiteral(content, index);
      continue;
    }
    if (current === '/' && next === '/') {
      const lineEnd = content.indexOf('\n', index + 2);
      index = lineEnd === -1 ? end : lineEnd + 1;
      continue;
    }
    if (current === '/' && next === '*') {
      const commentEnd = content.indexOf('*/', index + 2);
      index = commentEnd === -1 ? end : commentEnd + 2;
      continue;
    }
    if (isSimpleJsxTagStart(content, index)) {
      const tagEnd = skipJsxTag(content, index, end);
      if (tagEnd !== -1 && !isLikelyTypeArgumentTag(content, index, tagEnd)) {
        const tag = content.slice(index, tagEnd).trim();
        if (tag === '<>') {
          stack.push('');
        } else if (tag.startsWith('</')) {
          stack.pop();
        } else if (!/\/\s*>$/.test(tag)) {
          const name = jsxTagName(tag);
          if (name) stack.push(name);
        }
        index = tagEnd;
        continue;
      }
    }
    index += 1;
  }

  return stack.length > 0;
}

function hasUnclosedBraceOnCurrentLine(content: string, end: number): boolean {
  const lineStart = content.lastIndexOf('\n', end - 1) + 1;
  let depth = 0;
  let index = lineStart;

  while (index < end) {
    const current = content[index];
    const next = content[index + 1];
    if (current === '"' || current === "'" || current === '`') {
      index = skipQuotedLiteral(content, index);
      continue;
    }
    if (current === '/' && next === '/') {
      const lineEnd = content.indexOf('\n', index + 2);
      index = lineEnd === -1 ? end : Math.min(lineEnd + 1, end);
      continue;
    }
    if (current === '/' && next === '*') {
      const commentEnd = content.indexOf('*/', index + 2);
      index = commentEnd === -1 ? end : Math.min(commentEnd + 2, end);
      continue;
    }
    if (current === '{') {
      depth += 1;
    } else if (current === '}' && depth > 0) {
      depth -= 1;
    }
    index += 1;
  }

  return depth > 0;
}

function isJsxTextBlockComment(content: string, start: number, end: number): boolean {
  const before = content.slice(0, start);
  const previousNonWhitespace = before.trimEnd().at(-1) ?? '';

  if (previousNonWhitespace === '{' || hasUnclosedBraceOnCurrentLine(content, start)) {
    return false;
  }

  const previousTag = findLastJsxTagBefore(content, start);
  const nextTag = findNextJsxTagAfter(content, end);

  if (!previousTag || !nextTag) {
    return false;
  }

  const textSinceLastTag = before.slice(previousTag.end);
  if (
    /(?:^|\s)(?:const|let|var|return|function|class)\b/.test(
      textSinceLastTag,
    )
  ) {
    return false;
  }
  const lastOpenBrace = textSinceLastTag.lastIndexOf('{');
  const lastCloseBrace = textSinceLastTag.lastIndexOf('}');
  if (lastOpenBrace > lastCloseBrace) {
    return false;
  }

  const openingTag = previousTag.text;
  if (openingTag === '<>') {
    return nextTag.startsWith('</>');
  }

  const isOpeningTag = new RegExp('^<[A-Za-z_$]').test(openingTag);
  const isSelfClosingTag = new RegExp('/\\s*>$').test(openingTag);
  const isClosingTag = new RegExp('^</[A-Za-z_$]').test(openingTag);

  if (!new RegExp('^<[/A-Za-z_$]').test(nextTag)) {
    return false;
  }

  if (isSelfClosingTag || isClosingTag) {
    return (
      nextTag.startsWith('</') ||
      hasOpenJsxAncestorBefore(content, previousTag.end)
    );
  }

  return isOpeningTag;
}

function collectTemplateLiteralMarkers(
  content: string,
  start: number,
): [UnresolvedMarkerOccurrence[], number] {
  const markers: UnresolvedMarkerOccurrence[] = [];
  let index = start + 1;

  while (index < content.length) {
    const current = content[index];
    const next = content[index + 1];
    if (current === '\\') {
      index += 2;
      continue;
    }
    if (current === '`') {
      return [markers, index + 1];
    }
    if (current === '$' && next === '{') {
      const [expressionMarkers, expressionEnd] = collectCodeMarkers(
        content,
        index + 2,
        '}',
      );
      markers.push(...expressionMarkers);
      index = expressionEnd;
      continue;
    }
    index += 1;
  }

  return [markers, index];
}

function collectCodeMarkers(
  content: string,
  start = 0,
  endCharacter?: string,
): [UnresolvedMarkerOccurrence[], number] {
  const markers: UnresolvedMarkerOccurrence[] = [];
  let index = start;
  let braceDepth = endCharacter === '}' ? 1 : 0;

  while (index < content.length) {
    const current = content[index];
    const next = content[index + 1];

    if (endCharacter === '}' && current === '{') {
      braceDepth += 1;
      index += 1;
      continue;
    }

    if (endCharacter === '}' && current === '}') {
      braceDepth -= 1;
      index += 1;
      if (braceDepth === 0) {
        return [markers, index];
      }
      continue;
    }

    if (endCharacter && endCharacter !== '}' && current === endCharacter) {
      return [markers, index + 1];
    }

    if (current === "'" && /[$\w]/.test(content[index - 1] ?? '')) {
      index += 1;
      continue;
    }

    if (current === '"' || current === "'") {
      index = skipQuotedLiteral(content, index);
      continue;
    }

    if (
      current === '`' &&
      next === '`' &&
      content[index + 2] === '`' &&
      /^\s*$/.test(content.slice(content.lastIndexOf('\n', index - 1) + 1, index))
    ) {
      while (content[index] === '`') {
        index += 1;
      }
      continue;
    }

    if (current === '`') {
      const [templateMarkers, templateEnd] = collectTemplateLiteralMarkers(
        content,
        index,
      );
      markers.push(...templateMarkers);
      index = templateEnd;
      continue;
    }

    if (current === '/' && next === '/') {
      const [commentMarkers, commentEnd] = collectLineCommentMarkers(
        content,
        index,
      );
      markers.push(...commentMarkers);
      index = commentEnd;
      continue;
    }

    if (current === '/' && next === '*') {
      const [commentMarkers, commentEnd] = collectBlockCommentMarkers(
        content,
        index,
      );
      if (!isJsxTextBlockComment(content, index, commentEnd)) {
        markers.push(...commentMarkers);
      }
      index = commentEnd;
      continue;
    }

    if (current === '<' && isLikelyJsxTagStart(content, index)) {
      const tagEnd = skipJsxTag(content, index);
      if (tagEnd !== -1 && !isLikelyTypeArgumentTag(content, index, tagEnd)) {
        markers.push(...collectJsxTagExpressionMarkers(content, index, tagEnd));
        index = tagEnd;
        continue;
      }
    }

    if (current === '/' && canStartRegexLiteral(content, index)) {
      index = skipRegexLiteral(content, index);
      continue;
    }

    index += 1;
  }

  return [markers, index];
}

function collectUnresolvedCommentMarkers(
  content: string,
): UnresolvedMarkerOccurrence[] {
  return collectCodeMarkers(content)[0];
}

function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

function formatLineRanges(lineNumbers: readonly number[]): string {
  const uniqueLines = [...new Set(lineNumbers)].sort((a, b) => a - b);
  const ranges: string[] = [];

  for (let index = 0; index < uniqueLines.length; index += 1) {
    const start = uniqueLines[index] ?? 0;
    let end = start;
    while (uniqueLines[index + 1] === end + 1) {
      index += 1;
      end = uniqueLines[index] ?? end;
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
  }

  return `lines ${ranges.join(', ')}`;
}

export class ConcisenessEvaluator implements Evaluator {
  readonly name = 'conciseness';
  readonly category = 'heuristic' as const;

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    if (!input.content.trim()) {
      return {
        evaluatorName: this.name,
        verdict: 'pass',
        score: 1,
        findings: [],
      };
    }

    const findings: EvaluationFinding[] = [];

    this.checkCommentRatio(input.content, findings);
    this.checkTodoComments(input.content, findings);

    const score = Math.max(0, 1 - findings.length * 0.2);

    return {
      evaluatorName: this.name,
      verdict: findings.length === 0 ? 'pass' : 'fail',
      score,
      findings,
    };
  }

  private checkCommentRatio(
    content: string,
    findings: EvaluationFinding[],
  ): void {
    const lines = content.split('\n');
    const totalLines = lines.filter((l) => l.trim().length > 0).length;
    if (totalLines === 0) return;

    // Count single-line comments and inline unresolved comment markers.
    let commentLines = lines.filter(
      (l) =>
        COMMENT_LINE_PATTERN.test(l) || UNRESOLVED_COMMENT_LINE_PATTERN.test(l),
    ).length;

    // Count block comment lines
    for (const match of content.matchAll(BLOCK_COMMENT_PATTERN)) {
      commentLines += match[0].split('\n').length;
    }

    const ratio = commentLines / totalLines;
    if (ratio > MAX_COMMENT_RATIO) {
      findings.push({
        message: `Excessive comment ratio: ${Math.round(ratio * 100)}% of lines are comments. Code should be self-documenting.`,
        severity: 'info',
        suggestion:
          'Remove obvious comments and let clear naming convey intent',
      });
    }
  }

  private checkTodoComments(
    content: string,
    findings: EvaluationFinding[],
  ): void {
    const markers = collectUnresolvedCommentMarkers(content);
    if (markers.length > 0) {
      const labels = markers.map((marker) => marker.label);
      findings.push({
        message: `Found ${labels.length} unresolved marker comment(s): ${labels.join(', ')}. Address or track these as issues.`,
        severity: 'info',
        location: formatLineRanges(
          markers.map((marker) => lineNumberAt(content, marker.index)),
        ),
        suggestion:
          'Resolve deferred-work items or convert them to tracked issues',
      });
    }
  }
}
