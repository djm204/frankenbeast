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
  `^\\s*(?:\\*|//)?\\s*(${UNRESOLVED_COMMENT_MARKERS.join('|')})(?:\\b|(?=\\())`,
  'gim',
);
const UNRESOLVED_COMMENT_LINE_PATTERN = new RegExp(
  `//\\s*(${UNRESOLVED_COMMENT_MARKERS.join('|')})\\b`,
  'i',
);
const MAX_COMMENT_RATIO = 0.5;

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

    if (current === '/' && next === '/') {
      return index;
    }

    index += 1;
  }

  return -1;
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

function canStartRegexLiteral(content: string, index: number): boolean {
  const previous = previousSignificantCharacter(content, index);
  const previousToken = previousSignificantToken(content, index);
  if (isPostfixOperatorBefore(content, index)) {
    return false;
  }
  return (
    [
      'return',
      'throw',
      'case',
      'yield',
      'await',
      'typeof',
      'void',
      'delete',
      'else',
      'of',
      'in',
      'default',
    ].includes(previousToken) ||
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

function extractMarkerLabels(pattern: RegExp, comment: string): string[] {
  pattern.lastIndex = 0;
  return [...comment.matchAll(pattern)].flatMap((match) =>
    match[1] ? [match[1]] : [],
  );
}

function collectLineCommentLabels(
  content: string,
  start: number,
): [string[], number] {
  const end = content.indexOf('\n', start + 2);
  const commentEnd = end === -1 ? content.length : end;
  const comment = content.slice(start, commentEnd);
  return [extractMarkerLabels(UNRESOLVED_COMMENT_PATTERN, comment), commentEnd];
}

function collectBlockCommentLabels(
  content: string,
  start: number,
): [string[], number] {
  const end = content.indexOf('*/', start + 2);
  const commentEnd = end === -1 ? content.length : end + 2;
  const comment = content
    .slice(start, commentEnd)
    .replace(/^\/\*/, '')
    .replace(/\*\/$/, '');
  return [extractMarkerLabels(UNRESOLVED_MARKER_PATTERN, comment), commentEnd];
}

function isJsxTextBlockComment(content: string, start: number, end: number): boolean {
  const before = content.slice(0, start);
  const after = content.slice(end);
  const previousNonWhitespace = before.trimEnd().at(-1) ?? '';

  if (previousNonWhitespace === '{') {
    return false;
  }

  const lastTagEnd = before.lastIndexOf('>');
  const lastTagStart = before.lastIndexOf('<', lastTagEnd);
  const nextTagStart = after.indexOf('<');

  if (lastTagEnd === -1 || lastTagStart === -1 || nextTagStart === -1) {
    return false;
  }

  const textSinceLastTag = before.slice(lastTagEnd + 1);
  const lastOpenBrace = textSinceLastTag.lastIndexOf('{');
  const lastCloseBrace = textSinceLastTag.lastIndexOf('}');
  if (lastOpenBrace > lastCloseBrace) {
    return false;
  }

  const openingTag = before.slice(lastTagStart, lastTagEnd + 1).trim();
  const nextTag = after.slice(nextTagStart).trimStart();
  return (
    /^<[A-Za-z][^>]*>$/.test(openingTag) &&
    !/\/\s*>$/.test(openingTag) &&
    /^<\/[A-Za-z]/.test(nextTag)
  );
}

function collectTemplateLiteralLabels(
  content: string,
  start: number,
): [string[], number] {
  const labels: string[] = [];
  let index = start + 1;

  while (index < content.length) {
    const current = content[index];
    const next = content[index + 1];
    if (current === '\\') {
      index += 2;
      continue;
    }
    if (current === '`') {
      return [labels, index + 1];
    }
    if (current === '$' && next === '{') {
      const [expressionLabels, expressionEnd] = collectCodeLabels(
        content,
        index + 2,
        '}',
      );
      labels.push(...expressionLabels);
      index = expressionEnd;
      continue;
    }
    index += 1;
  }

  return [labels, index];
}

function collectCodeLabels(
  content: string,
  start = 0,
  endCharacter?: string,
): [string[], number] {
  const labels: string[] = [];
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
        return [labels, index];
      }
      continue;
    }

    if (endCharacter && endCharacter !== '}' && current === endCharacter) {
      return [labels, index + 1];
    }

    if (current === "'" && /[$\w]/.test(content[index - 1] ?? '')) {
      index += 1;
      continue;
    }

    if (current === '"' || current === "'") {
      index = skipQuotedLiteral(content, index);
      continue;
    }

    if (current === '`' && next === '`' && content[index + 2] === '`') {
      while (content[index] === '`') {
        index += 1;
      }
      continue;
    }

    if (current === '`') {
      const [templateLabels, templateEnd] = collectTemplateLiteralLabels(
        content,
        index,
      );
      labels.push(...templateLabels);
      index = templateEnd;
      continue;
    }

    if (current === '/' && next === '/') {
      const [commentLabels, commentEnd] = collectLineCommentLabels(
        content,
        index,
      );
      labels.push(...commentLabels);
      index = commentEnd;
      continue;
    }

    if (current === '/' && next === '*') {
      const [commentLabels, commentEnd] = collectBlockCommentLabels(
        content,
        index,
      );
      if (!isJsxTextBlockComment(content, index, commentEnd)) {
        labels.push(...commentLabels);
      }
      index = commentEnd;
      continue;
    }

    if (current === '/' && canStartRegexLiteral(content, index)) {
      index = skipRegexLiteral(content, index);
      continue;
    }

    index += 1;
  }

  return [labels, index];
}

function collectUnresolvedCommentMarkerLabels(content: string): string[] {
  return collectCodeLabels(content)[0];
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
    const labels = collectUnresolvedCommentMarkerLabels(content);
    if (labels.length > 0) {
      findings.push({
        message: `Found ${labels.length} unresolved marker comment(s): ${labels.join(', ')}. Address or track these as issues.`,
        severity: 'info',
        suggestion:
          'Resolve deferred-work items or convert them to tracked issues',
      });
    }
  }
}
