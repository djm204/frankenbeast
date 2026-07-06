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
]);

function stripIgnoredBraceSyntax(content: string): string {
  let sanitized = '';

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '/' && next === '/' && !isUrlSchemeSlash(content, i)) {
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

    if (
      (char === '"' || char === "'") &&
      isLikelyQuotedStringStart(content, i, char)
    ) {
      const end = findQuotedStringEnd(content, i, char);
      sanitized += maskIgnored(content, i, end);
      i = end - 1;
      continue;
    }

    if (char === '`' && next === '`' && content[i + 2] === '`') {
      const end = findLineEnd(content, i + 3);
      sanitized += maskIgnored(content, i, end);
      i = end - 1;
      continue;
    }

    if (char === '`') {
      const inlineCodeEnd = findInlineMarkdownCodeEnd(content, i);
      if (inlineCodeEnd !== -1 && !isLikelyTemplateLiteralStart(content, i)) {
        sanitized += maskIgnored(content, i, i + 1);
        sanitized += stripIgnoredBraceSyntax(
          content.slice(i + 1, inlineCodeEnd - 1),
        );
        sanitized += maskIgnored(content, inlineCodeEnd - 1, inlineCodeEnd);
        i = inlineCodeEnd - 1;
        continue;
      }

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

function isUrlSchemeSlash(content: string, slashIndex: number): boolean {
  if (content[slashIndex - 1] !== ':') return false;

  let schemeStart = slashIndex - 2;
  while (schemeStart >= 0 && /[A-Za-z]/.test(content[schemeStart] ?? '')) {
    schemeStart--;
  }

  const scheme = content.slice(schemeStart + 1, slashIndex - 1).toLowerCase();
  return /^(?:https?|ftp|file)$/.test(scheme);
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
    if (content[i] === '\n') return i;
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

function isLikelyQuotedStringStart(
  content: string,
  start: number,
  quote: string,
): boolean {
  if (quote !== "'") return true;

  const previous = content[start - 1] ?? '';
  const next = content[start + 1] ?? '';

  return !(/[A-Za-z0-9]/.test(previous) && /[A-Za-z]/.test(next));
}

function findInlineMarkdownCodeEnd(content: string, start: number): number {
  for (let i = start + 1; i < content.length; i++) {
    if (content[i] === '\n') return -1;
    if (content[i] === '`') return i + 1;
  }

  return -1;
}

function isLikelyTemplateLiteralStart(content: string, start: number): boolean {
  const previousIndex = findPreviousRegexLookbehindIndex(content, start);
  if (previousIndex === -1) return false;

  const previous = content[previousIndex] ?? '';
  if ('=([{,:!+-*?/&|^~<>'.includes(previous)) return true;
  if (previous === '>' && content[previousIndex - 1] === '=') return true;

  return isRegexKeywordPrefix(content, previousIndex);
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

    if (char === '/' && next === '/' && !isUrlSchemeSlash(content, i)) {
      i = findLineEnd(content, i + 2) - 1;
      continue;
    }

    if (char === '/' && next === '*') {
      i = findBlockCommentEnd(content, i + 2) - 1;
      continue;
    }

    if (char === '"' || char === "'") {
      if (isLikelyQuotedStringStart(content, i, char)) {
        i = findQuotedStringEnd(content, i, char) - 1;
        continue;
      }
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
  const previousIndex = findPreviousRegexLookbehindIndex(content, slashIndex);
  if (previousIndex === -1) return true;

  const previous = content[previousIndex] ?? '';
  if (
    (previous === '+' || previous === '-') &&
    content[previousIndex - 1] === previous
  ) {
    return false;
  }

  if (previous === ')' && isControlHeaderPrefix(content, previousIndex)) {
    return true;
  }

  if (previous === '>' && content[previousIndex - 1] === '=') return true;

  if (previous === '}') return true;

  if (previous === '[') return true;

  if (previous === '!') {
    const previousBeforeBangIndex = findPreviousRegexLookbehindIndex(
      content,
      previousIndex,
    );
    if (previousBeforeBangIndex === -1) return true;
    return !/[\w$\])]$/.test(content[previousBeforeBangIndex] ?? '');
  }

  if (REGEX_PREFIX_CHARS.has(previous)) return true;

  return isRegexKeywordPrefix(content, previousIndex);
}

function isRegexKeywordPrefix(content: string, endIndex: number): boolean {
  let start = endIndex;
  while (start >= 0 && /[\w$]/.test(content[start] ?? '')) start--;

  const word = content.slice(start + 1, endIndex + 1);
  const beforeWord = content[start] ?? '';
  if (beforeWord === '.' || /[\w$]/.test(beforeWord)) return false;

  return /^(?:return|throw|case|delete|typeof|void|in|of|yield|await|else)$/.test(
    word,
  );
}

function findPreviousRegexLookbehindIndex(
  content: string,
  beforeIndex: number,
): number {
  let index = beforeIndex - 1;

  while (index >= 0) {
    while (index >= 0 && /\s/.test(content[index] ?? '')) index--;
    if (index < 0) return -1;

    if (content[index] === '/' && content[index - 1] === '*') {
      const start = content.lastIndexOf('/*', index - 2);
      if (start === -1) return index;
      index = start - 1;
      continue;
    }

    const lineStart = content.lastIndexOf('\n', index) + 1;
    const trailingLine = content.slice(lineStart, index + 1);
    const trailingComment = findLineCommentStart(trailingLine);
    if (trailingComment !== -1) {
      index = lineStart + trailingComment - 1;
      continue;
    }

    return index;
  }

  return -1;
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

    if (char === '/' && next === '/' && !isUrlSchemeSlash(line, i)) return i;
  }

  return -1;
}

function isControlHeaderPrefix(
  content: string,
  closeParenIndex: number,
): boolean {
  let depth = 0;

  for (let i = closeParenIndex; i >= 0; i--) {
    const char = content[i];

    if (char === ')') {
      depth++;
      continue;
    }

    if (char === '(') {
      depth--;
      if (depth === 0) {
        const previousIndex = findPreviousRegexLookbehindIndex(content, i);
        if (previousIndex === -1) return false;

        let keywordStart = previousIndex;
        while (keywordStart >= 0 && /[\w$]/.test(content[keywordStart] ?? '')) {
          keywordStart--;
        }
        const keyword = content.slice(keywordStart + 1, previousIndex + 1);
        return /^(?:if|while|for|with)$/.test(keyword);
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
