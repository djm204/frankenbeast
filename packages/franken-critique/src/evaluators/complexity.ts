import type {
  Evaluator,
  EvaluationInput,
  EvaluationResult,
  EvaluationFinding,
} from './evaluator.js';
import { stripCommentsAndStringLiterals } from './source-sanitizer.js';

const MAX_PARAMS = 5;
const MAX_NESTING = 4;
const MAX_FUNCTION_LINES = 50;

interface FunctionBlock {
  params: string;
  body: string;
}

function findMatchingDelimiter(
  content: string,
  openIndex: number,
  openChar: string,
  closeChar: string,
): number {
  let depth = 0;

  for (let i = openIndex; i < content.length; i++) {
    const char = content[i] ?? '';
    if (char === openChar) {
      depth++;
    } else if (char === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function isTypeOperandPrefix(char: string): boolean {
  return [':', '|', '&', ',', '<', '(', '['].includes(char);
}

function previousIdentifier(content: string, beforeIndex: number): string {
  let end = beforeIndex;
  while (end >= 0 && /\s/.test(content[end] ?? '')) end--;
  let start = end;
  while (start >= 0 && /[A-Za-z0-9_$]/.test(content[start] ?? '')) start--;
  return content.slice(start + 1, end + 1);
}

function findBodyOpenAfterSignature(content: string, startIndex: number): number {
  let inReturnType = false;
  let typeDepth = 0;
  let expectTypeOperand = false;

  for (let i = startIndex; i < content.length; i++) {
    const char = content[i] ?? '';
    const isWhitespace = /\s/.test(char);

    if (!inReturnType) {
      if (char === '{') return i;
      if (char === ';') return -1;
      if (char === ':') {
        inReturnType = true;
        expectTypeOperand = true;
      }
      continue;
    }

    if (typeDepth === 0 && char === '=' && content[i + 1] === '>') {
      expectTypeOperand = true;
      i++;
      continue;
    }

    if (char === '{' && typeDepth === 0) {
      const closeIndex = findMatchingDelimiter(content, i, '{', '}');
      if (closeIndex === -1) return -1;
      let nextIndex = closeIndex + 1;
      while (/\s/.test(content[nextIndex] ?? '')) nextIndex++;
      if (
        expectTypeOperand ||
        ['keyof', 'is', 'asserts'].includes(previousIdentifier(content, i - 1)) ||
        content[nextIndex] === '{' ||
        content[nextIndex] === '|' ||
        content[nextIndex] === '&' ||
        content[nextIndex] === '?' ||
        content[nextIndex] === ':' ||
        (content[nextIndex] === '=' && content[nextIndex + 1] === '>')
      ) {
        i = closeIndex;
        expectTypeOperand =
          content[nextIndex] === '|' ||
          content[nextIndex] === '&' ||
          content[nextIndex] === '?' ||
          content[nextIndex] === ':';
        continue;
      }
      return i;
    }

    if (char === '<' || char === '(' || char === '[' || char === '{') {
      typeDepth++;
    } else if (
      char === '>' ||
      char === ')' ||
      char === ']' ||
      char === '}'
    ) {
      typeDepth = Math.max(0, typeDepth - 1);
    } else if (char === ';' && typeDepth === 0) {
      return -1;
    }

    if (!isWhitespace) {
      expectTypeOperand =
        typeDepth === 0 &&
        isTypeOperandPrefix(char);
    }
  }

  return -1;
}

function findBlockBodyOpen(content: string, startIndex: number): number {
  let index = startIndex;
  while (/\s/.test(content[index] ?? '')) index++;
  return content[index] === '{' ? index : -1;
}

function findArrowToken(content: string, startIndex: number): number {
  let index = startIndex;
  while (/\s/.test(content[index] ?? '')) index++;

  if (content[index] !== ':') {
    return content[index] === '=' && content[index + 1] === '>' ? index : -1;
  }

  let typeDepth = 0;
  let previousSignificant = ':';
  for (let i = index + 1; i < content.length - 1; i++) {
    const char = content[i] ?? '';
    const isWhitespace = /\s/.test(char);

    if (typeDepth === 0 && char === '=' && content[i + 1] === '>') {
      if (previousSignificant === ')') {
        let nextIndex = i + 2;
        while (/\s/.test(content[nextIndex] ?? '')) nextIndex++;
        if (content[nextIndex] === '{') {
          const closeIndex = findMatchingDelimiter(content, nextIndex, '{', '}');
          if (closeIndex === -1) return -1;
          let afterObjectIndex = closeIndex + 1;
          while (/\s/.test(content[afterObjectIndex] ?? '')) afterObjectIndex++;
          if (
            !['=', '|', '&', '?', ':'].includes(content[afterObjectIndex] ?? '')
          ) {
            return i;
          }
        }
      } else {
        return i;
      }
      previousSignificant = '>';
      i++;
      continue;
    }

    if (char === '<' || char === '(' || char === '[' || char === '{') {
      typeDepth++;
    } else if (
      char === '>' ||
      char === ')' ||
      char === ']' ||
      char === '}'
    ) {
      typeDepth = Math.max(0, typeDepth - 1);
    } else if (char === ';' && typeDepth === 0) {
      return -1;
    }

    if (!isWhitespace && typeDepth === 0) previousSignificant = char;
  }

  return -1;
}

function collectFunctionBlocks(content: string): FunctionBlock[] {
  const blocks: FunctionBlock[] = [];

  for (const match of content.matchAll(/function\s+\w+/g)) {
    let paramsOpenIndex = (match.index ?? 0) + match[0].length;
    while (/\s/.test(content[paramsOpenIndex] ?? '')) paramsOpenIndex++;
    if (content[paramsOpenIndex] === '<') {
      const typeParamsCloseIndex = findMatchingDelimiter(
        content,
        paramsOpenIndex,
        '<',
        '>',
      );
      if (typeParamsCloseIndex === -1) continue;
      paramsOpenIndex = typeParamsCloseIndex + 1;
      while (/\s/.test(content[paramsOpenIndex] ?? '')) paramsOpenIndex++;
    }
    if (content[paramsOpenIndex] !== '(') continue;
    const paramsCloseIndex = findMatchingDelimiter(content, paramsOpenIndex, '(', ')');
    if (paramsCloseIndex === -1) continue;

    const bodyOpenIndex = findBodyOpenAfterSignature(
      content,
      paramsCloseIndex + 1,
    );
    if (bodyOpenIndex === -1) continue;

    const bodyCloseIndex = findMatchingDelimiter(content, bodyOpenIndex, '{', '}');
    if (bodyCloseIndex === -1) continue;

    blocks.push({
      params: content.slice(paramsOpenIndex + 1, paramsCloseIndex),
      body: content.slice(bodyOpenIndex + 1, bodyCloseIndex),
    });
  }

  for (const match of content.matchAll(
    /(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?/g,
  )) {
    let paramsOpenIndex = (match.index ?? 0) + match[0].length;
    while (/\s/.test(content[paramsOpenIndex] ?? '')) paramsOpenIndex++;
    if (content[paramsOpenIndex] === '<') {
      const typeParamsCloseIndex = findMatchingDelimiter(
        content,
        paramsOpenIndex,
        '<',
        '>',
      );
      if (typeParamsCloseIndex === -1) continue;
      paramsOpenIndex = typeParamsCloseIndex + 1;
      while (/\s/.test(content[paramsOpenIndex] ?? '')) paramsOpenIndex++;
    }
    if (content[paramsOpenIndex] !== '(') continue;
    let nestedParamsIndex = paramsOpenIndex + 1;
    while (/\s/.test(content[nestedParamsIndex] ?? '')) nestedParamsIndex++;
    if (content[nestedParamsIndex] === '(') {
      paramsOpenIndex = nestedParamsIndex;
    }
    const paramsCloseIndex = findMatchingDelimiter(content, paramsOpenIndex, '(', ')');
    if (paramsCloseIndex === -1) continue;

    const arrowIndex = findArrowToken(content, paramsCloseIndex + 1);
    if (arrowIndex === -1) continue;

    const bodyOpenIndex = findBlockBodyOpen(content, arrowIndex + 2);
    if (bodyOpenIndex === -1) continue;

    const bodyCloseIndex = findMatchingDelimiter(content, bodyOpenIndex, '{', '}');
    if (bodyCloseIndex === -1) continue;

    blocks.push({
      params: content.slice(paramsOpenIndex + 1, paramsCloseIndex),
      body: content.slice(bodyOpenIndex + 1, bodyCloseIndex),
    });
  }

  return blocks;
}

function countTopLevelParameters(params: string): number {
  let count = 0;
  let segmentHasContent = false;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;
  let inTypeAnnotation = false;
  let inDefaultValue = false;

  for (let i = 0; i < params.length; i++) {
    const char = params[i] ?? '';
    const atTopLevel =
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      angleDepth === 0;

    if (char === ':' && atTopLevel && !inDefaultValue) {
      inTypeAnnotation = true;
    } else if (char === '=' && params[i + 1] !== '>' && atTopLevel) {
      inTypeAnnotation = false;
      inDefaultValue = true;
    } else if (char === '(') {
      parenDepth++;
    } else if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
    } else if (char === '[') {
      bracketDepth++;
    } else if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (char === '{') {
      braceDepth++;
    } else if (char === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
    } else if (char === '<' && inTypeAnnotation) {
      angleDepth++;
    } else if (char === '>' && angleDepth > 0) {
      angleDepth--;
    }

    const isTopLevelComma =
      char === ',' &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      angleDepth === 0;

    if (isTopLevelComma) {
      if (segmentHasContent) count++;
      segmentHasContent = false;
      inTypeAnnotation = false;
      inDefaultValue = false;
      continue;
    }

    if (!char.match(/\s/)) segmentHasContent = true;
  }

  if (segmentHasContent) count++;
  return count;
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

    const sanitizedContent = stripCommentsAndStringLiterals(input.content);
    const findings: EvaluationFinding[] = [];

    this.checkParameterCount(sanitizedContent, findings);
    this.checkNestingDepth(sanitizedContent, findings);
    this.checkFunctionLength(sanitizedContent, findings);

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
    for (const block of collectFunctionBlocks(content)) {
      const params = block.params.trim();
      if (!params) continue;
      const count = countTopLevelParameters(params);
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

  private checkNestingDepth(
    content: string,
    findings: EvaluationFinding[],
  ): void {
    let maxDepth = 0;
    let currentDepth = 0;

    for (const char of content) {
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
    for (const block of collectFunctionBlocks(content)) {
      const lineCount = block.body.split('\n').length;
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
