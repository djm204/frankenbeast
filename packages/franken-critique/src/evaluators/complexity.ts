import type {
  Evaluator,
  EvaluationInput,
  EvaluationResult,
  EvaluationFinding,
} from './evaluator.js';

const MAX_PARAMS = 5;
const MAX_NESTING = 4;
const MAX_FUNCTION_LINES = 50;

const FUNCTION_PATTERN = /function\s+\w+\s*\(([^)]*)\)\s*\{([\s\S]*?)\}/g;
const ARROW_FUNCTION_PATTERN =
  /(?:const|let|var)\s+\w+\s*=\s*\(([^)]*)\)\s*(?::\s*\w+\s*)?=>\s*\{([\s\S]*?)\}/g;
const REGEX_PREFIX_CHARS = new Set([
  '(',
  '{',
  '=',
  ':',
  ',',
  ';',
  '!',
  '&',
  '|',
  '?',
  '+',
  '-',
  '*',
  '~',
  '^',
  '<',
  '>',
]);

function stripIgnoredBraceSyntax(content: string): string {
  let sanitized = '';

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '/' && next === '/') {
      const end = findLineEnd(content, i + 2);
      sanitized += maskIgnored(content, i, end);
      i = end - 1;
      continue;
    }

    if (char === '/' && next === '*') {
      const end = findBlockCommentEnd(content, i + 2);
      sanitized += maskIgnored(content, i, end);
      i = end - 1;
      continue;
    }

    if (char === '"' || char === "'") {
      const end = findQuotedStringEnd(content, i, char);
      sanitized += maskIgnored(content, i, end);
      i = end - 1;
      continue;
    }

    if (char === '`') {
      const masked = maskTemplateLiteral(content, i);
      sanitized += masked.content;
      i = masked.end - 1;
      continue;
    }

    if (char === '/' && shouldStartRegexLiteral(content, i)) {
      const end = findRegexLiteralEnd(content, i);
      sanitized += maskIgnored(content, i, end);
      i = end - 1;
      continue;
    }

    sanitized += char;
  }

  return sanitized;
}

function maskIgnored(content: string, start: number, end: number): string {
  return content.slice(start, end).replace(/[^\n]/g, ' ');
}

function findLineEnd(content: string, start: number): number {
  const newline = content.indexOf('\n', start);
  return newline === -1 ? content.length : newline;
}

function findBlockCommentEnd(content: string, start: number): number {
  const end = content.indexOf('*/', start);
  return end === -1 ? content.length : end + 2;
}

function findQuotedStringEnd(
  content: string,
  start: number,
  quote: string,
): number {
  for (let i = start + 1; i < content.length; i++) {
    if (content[i] === '\\') {
      i++;
      continue;
    }
    if (content[i] === quote) {
      return i + 1;
    }
  }

  return content.length;
}

function findTemplateLiteralEnd(content: string, start: number): number {
  for (let i = start + 1; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '\\') {
      i++;
      continue;
    }
    if (char === '$' && next === '{') {
      const expression = readTemplateExpression(content, i + 2);
      i = expression.end - 1;
      continue;
    }
    if (char === '`') {
      return i + 1;
    }
  }

  return content.length;
}

function maskTemplateLiteral(
  content: string,
  start: number,
): { content: string; end: number } {
  let sanitized = ' ';

  for (let i = start + 1; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '\\') {
      sanitized += maskIgnored(content, i, Math.min(i + 2, content.length));
      i++;
      continue;
    }

    if (char === '$' && next === '{') {
      const expression = readTemplateExpression(content, i + 2);
      sanitized += '  ';
      sanitized += stripIgnoredBraceSyntax(expression.content);
      if (expression.closed) sanitized += ' ';
      i = expression.end - 1;
      continue;
    }

    if (char === '`') {
      sanitized += ' ';
      return { content: sanitized, end: i + 1 };
    }

    sanitized += char === '\n' ? '\n' : ' ';
  }

  return { content: sanitized, end: content.length };
}

function readTemplateExpression(
  content: string,
  start: number,
): { content: string; end: number; closed: boolean } {
  let depth = 0;

  for (let i = start; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '/' && next === '/') {
      i = findLineEnd(content, i + 2) - 1;
      continue;
    }

    if (char === '/' && next === '*') {
      i = findBlockCommentEnd(content, i + 2) - 1;
      continue;
    }

    if (char === '"' || char === "'") {
      i = findQuotedStringEnd(content, i, char) - 1;
      continue;
    }

    if (char === '`') {
      i = findTemplateLiteralEnd(content, i) - 1;
      continue;
    }

    if (char === '/' && shouldStartRegexLiteral(content, i)) {
      i = findRegexLiteralEnd(content, i) - 1;
      continue;
    }

    if (char === '{') {
      depth++;
      continue;
    }

    if (char === '}') {
      if (depth === 0) {
        return {
          content: content.slice(start, i),
          end: i + 1,
          closed: true,
        };
      }
      depth--;
    }
  }

  return { content: content.slice(start), end: content.length, closed: false };
}

function shouldStartRegexLiteral(content: string, slashIndex: number): boolean {
  const before = trimRegexLookbehind(content.slice(0, slashIndex));
  if (!before) return true;

  const previous = before.charAt(before.length - 1);
  if (
    (previous === '+' || previous === '-') &&
    before.endsWith(`${previous}${previous}`)
  ) {
    return false;
  }

  if (previous === ')' && isControlHeaderPrefix(before)) return true;

  if (previous === '[') {
    const beforeBracket = before.slice(0, -1).trimEnd();
    if (!beforeBracket) return true;

    const previousBeforeBracket = beforeBracket.charAt(
      beforeBracket.length - 1,
    );
    return (
      previousBeforeBracket === '[' ||
      REGEX_PREFIX_CHARS.has(previousBeforeBracket) ||
      isRegexKeywordPrefix(beforeBracket)
    );
  }

  if (previous === '!') {
    const beforeBang = before.slice(0, -1).trimEnd();
    return !/[\w$\])]$/.test(beforeBang);
  }

  if (REGEX_PREFIX_CHARS.has(previous)) return true;

  return isRegexKeywordPrefix(before);
}

function isRegexKeywordPrefix(content: string): boolean {
  return /\b(?:return|throw|case|delete|typeof|void|in|of|yield|await)$/.test(
    content,
  );
}

function trimRegexLookbehind(content: string): string {
  let before = content.trimEnd();

  while (before.endsWith('*/')) {
    const start = before.lastIndexOf('/*');
    if (start === -1) break;
    before = before.slice(0, start).trimEnd();
  }

  const lastLineStart = before.lastIndexOf('\n') + 1;
  const trailingLine = before.slice(lastLineStart);
  const trailingComment = findLineCommentStart(trailingLine);
  if (trailingComment !== -1) {
    before = before.slice(0, lastLineStart + trailingComment).trimEnd();
  }

  return before;
}

function findLineCommentStart(line: string): number {
  let quote: '"' | "'" | '`' | null = null;

  for (let i = 0; i < line.length - 1; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (quote) {
      if (char === '\\') {
        i++;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '/' && next === '/') return i;
  }

  return -1;
}

function isControlHeaderPrefix(content: string): boolean {
  let depth = 0;

  for (let i = content.length - 1; i >= 0; i--) {
    const char = content[i];

    if (char === ')') {
      depth++;
      continue;
    }

    if (char === '(') {
      depth--;
      if (depth === 0) {
        const prefix = content.slice(0, i).trimEnd();
        return /\b(?:if|while|for|with)$/.test(prefix);
      }
    }
  }

  return false;
}

function findRegexLiteralEnd(content: string, start: number): number {
  let inCharacterClass = false;

  for (let i = start + 1; i < content.length; i++) {
    const char = content[i];

    if (char === '\\') {
      i++;
      continue;
    }

    if (char === '[') {
      inCharacterClass = true;
      continue;
    }

    if (char === ']') {
      inCharacterClass = false;
      continue;
    }

    if (char === '/' && !inCharacterClass) {
      let end = i + 1;
      while (/[a-z]/i.test(content[end] ?? '')) {
        end++;
      }
      return end;
    }

    if (char === '\n') {
      return i;
    }
  }

  return content.length;
}

export class ComplexityEvaluator implements Evaluator {
  readonly name = 'complexity';
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

    this.checkParameterCount(input.content, findings);
    this.checkNestingDepth(input.content, findings);
    this.checkFunctionLength(input.content, findings);

    const score = Math.max(0, 1 - findings.length * 0.25);

    return {
      evaluatorName: this.name,
      verdict: findings.length === 0 ? 'pass' : 'fail',
      score,
      findings,
    };
  }

  private checkParameterCount(
    content: string,
    findings: EvaluationFinding[],
  ): void {
    for (const pattern of [FUNCTION_PATTERN, ARROW_FUNCTION_PATTERN]) {
      for (const match of content.matchAll(pattern)) {
        const params = match[1]?.trim();
        if (!params) continue;
        const count = params.split(',').filter((p) => p.trim()).length;
        if (count > MAX_PARAMS) {
          findings.push({
            message: `Function has ${count} parameters (max ${MAX_PARAMS}). Consider using an options object.`,
            severity: 'warning',
            suggestion:
              'Group related parameters into an options/config object',
          });
        }
      }
    }
  }

  private checkNestingDepth(
    content: string,
    findings: EvaluationFinding[],
  ): void {
    let maxDepth = 0;
    let currentDepth = 0;

    for (const char of stripIgnoredBraceSyntax(content)) {
      if (char === '{') {
        currentDepth++;
        if (currentDepth > maxDepth) maxDepth = currentDepth;
      } else if (char === '}') {
        currentDepth = Math.max(0, currentDepth - 1);
      }
    }

    if (maxDepth > MAX_NESTING) {
      findings.push({
        message: `Code nesting depth is ${maxDepth} levels (max ${MAX_NESTING}). Extract nested logic into separate functions.`,
        severity: 'warning',
        suggestion:
          'Use early returns, guard clauses, or extract helper functions to reduce nesting',
      });
    }
  }

  private checkFunctionLength(
    content: string,
    findings: EvaluationFinding[],
  ): void {
    for (const pattern of [FUNCTION_PATTERN, ARROW_FUNCTION_PATTERN]) {
      for (const match of content.matchAll(pattern)) {
        const body = match[2] ?? '';
        const lineCount = body.split('\n').length;
        if (lineCount > MAX_FUNCTION_LINES) {
          findings.push({
            message: `Function is ${lineCount} lines long (max ${MAX_FUNCTION_LINES}). Break it into smaller functions.`,
            severity: 'warning',
            suggestion:
              'Extract logical sections into well-named helper functions',
          });
        }
      }
    }
  }
}
