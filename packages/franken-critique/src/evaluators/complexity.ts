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
    const char = content[i];
    if (char === openChar) {
      depth++;
    } else if (char === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function findBodyOpenAfterSignature(content: string, startIndex: number): number {
  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];
    if (char === '{') return i;
    if (char === ';') return -1;
  }

  return -1;
}

function findArrowToken(content: string, startIndex: number): number {
  for (let i = startIndex; i < content.length - 1; i++) {
    if (content[i] === '=' && content[i + 1] === '>') return i;
    if (content[i] === ';') return -1;
  }

  return -1;
}

function collectFunctionBlocks(content: string): FunctionBlock[] {
  const blocks: FunctionBlock[] = [];

  for (const match of content.matchAll(/function\s+\w+\s*\(/g)) {
    const paramsOpenIndex = (match.index ?? 0) + match[0].length - 1;
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
    /(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\(/g,
  )) {
    const paramsOpenIndex = (match.index ?? 0) + match[0].length - 1;
    const paramsCloseIndex = findMatchingDelimiter(content, paramsOpenIndex, '(', ')');
    if (paramsCloseIndex === -1) continue;

    const arrowIndex = findArrowToken(content, paramsCloseIndex + 1);
    if (arrowIndex === -1) continue;

    const bodyOpenIndex = findBodyOpenAfterSignature(content, arrowIndex + 2);
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
  let depth = 0;

  for (const char of params) {
    if (char === '<' || char === '(' || char === '[' || char === '{') {
      depth++;
    } else if (char === '>' || char === ')' || char === ']' || char === '}') {
      depth = Math.max(0, depth - 1);
    }

    if (char === ',' && depth === 0) {
      if (segmentHasContent) count++;
      segmentHasContent = false;
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
