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

const FUNCTION_PATTERN = /function\s+\w+\s*\(([^)]*)\)\s*\{([\s\S]*?)\}/g;
const ARROW_FUNCTION_PATTERN =
  /(?:const|let|var)\s+\w+\s*=\s*\(([^)]*)\)\s*(?::\s*\w+\s*)?=>\s*\{([\s\S]*?)\}/g;
const PARAMETER_LIST_START_PATTERNS = [
  /function\s+\w+\s*\(/g,
  /(?:const|let|var)\s+\w+\s*=\s*\(/g,
];

function extractParameterLists(content: string): string[] {
  const parameterLists: string[] = [];

  for (const pattern of PARAMETER_LIST_START_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      const openParenIndex = (match.index ?? 0) + match[0].length - 1;
      const parameterList = readBalancedParenthesizedContent(
        content,
        openParenIndex,
      );
      if (parameterList !== null) {
        parameterLists.push(parameterList);
      }
    }
  }

  return parameterLists;
}

function readBalancedParenthesizedContent(
  content: string,
  openParenIndex: number,
): string | null {
  let depth = 0;

  for (let index = openParenIndex + 1; index < content.length; index++) {
    const char = content[index];
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      if (depth === 0) {
        return content.slice(openParenIndex + 1, index);
      }
      depth--;
    }
  }

  return null;
}

function countTopLevelParameters(params: string): number {
  let count = 0;
  let hasParameterContent = false;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let angleDepth = 0;

  for (let index = 0; index < params.length; index++) {
    const char = params[index];
    if (char === undefined) continue;
    const previousChar = params[index - 1];

    if (char.trim()) {
      hasParameterContent = true;
    }

    if (char === '(') {
      parenDepth++;
    } else if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
    } else if (char === '{') {
      braceDepth++;
    } else if (char === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
    } else if (char === '[') {
      bracketDepth++;
    } else if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (char === '<') {
      angleDepth++;
    } else if (char === '>' && previousChar !== '=') {
      angleDepth = Math.max(0, angleDepth - 1);
    } else if (
      char === ',' &&
      parenDepth === 0 &&
      braceDepth === 0 &&
      bracketDepth === 0 &&
      angleDepth === 0
    ) {
      count++;
      hasParameterContent = false;
    }
  }

  return hasParameterContent ? count + 1 : count;
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
    for (const params of extractParameterLists(content)) {
      const trimmedParams = params.trim();
      if (!trimmedParams) continue;
      const count = countTopLevelParameters(trimmedParams);
      if (count > MAX_PARAMS) {
        findings.push({
          message: `Function has ${count} parameters (max ${MAX_PARAMS}). Consider using an options object.`,
          severity: 'warning',
          suggestion: 'Group related parameters into an options/config object',
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
