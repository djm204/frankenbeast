import type { Evaluator, EvaluationInput, EvaluationResult, EvaluationFinding } from './evaluator.js';

const MAX_PARAMS = 5;
const MAX_NESTING = 4;
const MAX_FUNCTION_LINES = 50;

const FUNCTION_PATTERN = /function\s+\w+\s*\(([^)]*)\)\s*\{([\s\S]*?)\}/g;
const ARROW_FUNCTION_PATTERN = /(?:const|let|var)\s+\w+\s*=\s*\(([^)]*)\)\s*(?::\s*\w+\s*)?=>\s*\{([\s\S]*?)\}/g;

enum ScannerState {
  Code = 'code',
  SingleLineComment = 'singleLineComment',
  MultiLineComment = 'multiLineComment',
  SingleQuote = 'singleQuote',
  DoubleQuote = 'doubleQuote',
  TemplateString = 'templateString',
}

export class ComplexityEvaluator implements Evaluator {
  readonly name = 'complexity';
  readonly category = 'heuristic' as const;

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    if (!input.content.trim()) {
      return { evaluatorName: this.name, verdict: 'pass', score: 1, findings: [] };
    }

    const sanitizedContent = this.stripCommentsAndStrings(input.content);

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

  private stripCommentsAndStrings(content: string): string {
    let result = '';
    let state: ScannerState = ScannerState.Code;

    for (let i = 0; i < content.length; i++) {
      const ch = content[i]!;
      const next = content[i + 1]!;

      if (state === ScannerState.Code) {
        if (ch === '/' && next === '/') {
          state = ScannerState.SingleLineComment;
          result += '  ';
          i += 1;
          continue;
        }

        if (ch === '/' && next === '*') {
          state = ScannerState.MultiLineComment;
          result += '  ';
          i += 1;
          continue;
        }

        if (ch === "'") {
          state = ScannerState.SingleQuote;
          result += ' ';
          continue;
        }

        if (ch === '"') {
          state = ScannerState.DoubleQuote;
          result += ' ';
          continue;
        }

        if (ch === '`') {
          state = ScannerState.TemplateString;
          result += ' ';
          continue;
        }

        result += ch;
        continue;
      }

      if (state === ScannerState.SingleLineComment) {
        if (ch === '\n') {
          state = ScannerState.Code;
          result += '\n';
        } else {
          result += ' ';
        }
        continue;
      }

      if (state === ScannerState.MultiLineComment) {
        if (ch === '*' && next === '/') {
          state = ScannerState.Code;
          result += '  ';
          i += 1;
          continue;
        }

        result += ch === '\n' ? '\n' : ' ';
        continue;
      }

      if (state === ScannerState.SingleQuote) {
        if (ch === '\\') {
          result += ' ';
          if (i + 1 < content.length) {
            result += ' ';
            i += 1;
          }
          continue;
        }

        if (ch === "'") {
          state = ScannerState.Code;
          result += ' ';
          continue;
        }

        result += ch === '\n' ? '\n' : ' ';
        continue;
      }

      if (state === ScannerState.DoubleQuote) {
        if (ch === '\\') {
          result += ' ';
          if (i + 1 < content.length) {
            result += ' ';
            i += 1;
          }
          continue;
        }

        if (ch === '"') {
          state = ScannerState.Code;
          result += ' ';
          continue;
        }

        result += ch === '\n' ? '\n' : ' ';
        continue;
      }

      if (state === ScannerState.TemplateString) {
        if (ch === '`') {
          state = ScannerState.Code;
          result += ' ';
          continue;
        }

        if (ch === '\n') {
          result += '\n';
        } else {
          result += ' ';
        }
      }
    }

    return result;
  }

  private checkParameterCount(content: string, findings: EvaluationFinding[]): void {
    for (const pattern of [FUNCTION_PATTERN, ARROW_FUNCTION_PATTERN]) {
      for (const match of content.matchAll(pattern)) {
        const params = match[1]?.trim();
        if (!params) continue;
        const count = params.split(',').filter((p) => p.trim()).length;
        if (count > MAX_PARAMS) {
          findings.push({
            message: `Function has ${count} parameters (max ${MAX_PARAMS}). Consider using an options object.`,
            severity: 'warning',
            suggestion: 'Group related parameters into an options/config object',
          });
        }
      }
    }
  }

  private checkNestingDepth(content: string, findings: EvaluationFinding[]): void {
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
        suggestion: 'Use early returns, guard clauses, or extract helper functions to reduce nesting',
      });
    }
  }

  private checkFunctionLength(content: string, findings: EvaluationFinding[]): void {
    for (const pattern of [FUNCTION_PATTERN, ARROW_FUNCTION_PATTERN]) {
      for (const match of content.matchAll(pattern)) {
        const body = match[2] ?? '';
        const lineCount = body.split('\n').length;
        if (lineCount > MAX_FUNCTION_LINES) {
          findings.push({
            message: `Function is ${lineCount} lines long (max ${MAX_FUNCTION_LINES}). Break it into smaller functions.`,
            severity: 'warning',
            suggestion: 'Extract logical sections into well-named helper functions',
          });
        }
      }
    }
  }
}
