import type { Evaluator, EvaluationInput, EvaluationResult, EvaluationFinding } from './evaluator.js';

// Matches while(true){...} or for(;;){...} — captures the loop body
const INFINITE_LOOP_PATTERNS = [
  /while\s*\(\s*true\s*\)\s*\{([^}]*)\}/g,
  /for\s*\(\s*;;\s*\)\s*\{([^}]*)\}/g,
];

// Matches function name() { ... name() ... } where the call has no preceding if/return/?
const SELF_RECURSION_PATTERN =
  /function\s+(\w+)\s*\([^)]*\)\s*\{([\s\S]*?)\}/g;

// Keywords that legitimately exit (or suspend) a loop. `await`/`yield` cover
// intentional async event loops such as `while (true) { await queue.next(); }`.
const LOOP_EXIT_KEYWORDS = ['break', 'return', 'throw', 'await', 'yield'];

/**
 * Removes comments and string/template literals from a code snippet so that
 * keyword detection operates on real code, not on prose or data. Without this,
 * `// break down the problem` or `"break the ice"` would be mistaken for a real
 * `break` statement.
 */
function stripCommentsAndStrings(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments
    .replace(/\/\/[^\n]*/g, ' ') // line comments
    .replace(/`(?:\\.|[^`\\])*`/g, ' ') // template literals
    .replace(/"(?:\\.|[^"\\])*"/g, ' ') // double-quoted strings
    .replace(/'(?:\\.|[^'\\])*'/g, ' '); // single-quoted strings
}

/**
 * Word-boundary keyword check. Matches `break` but not `breakPoint`, and
 * `return` but not `returnValue`, eliminating identifier-based false matches.
 */
function hasKeyword(code: string, keyword: string): boolean {
  return new RegExp(`\\b${keyword}\\b`).test(code);
}

export class LogicLoopEvaluator implements Evaluator {
  readonly name = 'logic-loop';
  readonly category = 'deterministic' as const;

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    const findings: EvaluationFinding[] = [];

    this.checkInfiniteLoops(input.content, findings);
    this.checkUnguardedRecursion(input.content, findings);

    const score = findings.length === 0 ? 1 : 0;

    return {
      evaluatorName: this.name,
      verdict: findings.length === 0 ? 'pass' : 'fail',
      score,
      findings,
    };
  }

  private checkInfiniteLoops(content: string, findings: EvaluationFinding[]): void {
    for (const pattern of INFINITE_LOOP_PATTERNS) {
      for (const match of content.matchAll(pattern)) {
        const body = stripCommentsAndStrings(match[1] ?? '');
        const hasExit = LOOP_EXIT_KEYWORDS.some((kw) => hasKeyword(body, kw));
        if (!hasExit) {
          findings.push({
            message: 'Potential infinite loop detected: loop has no break or return statement',
            severity: 'critical',
            suggestion: 'Add a break condition or return statement inside the loop',
          });
        }
      }
    }
  }

  private checkUnguardedRecursion(content: string, findings: EvaluationFinding[]): void {
    for (const match of content.matchAll(SELF_RECURSION_PATTERN)) {
      const fnName = match[1];
      const rawBody = match[2] ?? '';

      if (!fnName) continue;

      const body = stripCommentsAndStrings(rawBody);

      // Check if the function calls itself
      const callPattern = new RegExp(`\\b${fnName}\\s*\\(`, 'g');
      if (!callPattern.test(body)) continue;

      // Check if there's a guard: a conditional, or a return before the
      // recursive call. Word-boundary matching avoids treating identifiers like
      // `notify` or `returnValue` as guards.
      const returnIdx = body.search(/\breturn\b/);
      const recursiveCallIdx = body.search(new RegExp(`\\b${fnName}\\s*\\(`));
      const hasGuard =
        hasKeyword(body, 'if') ||
        (returnIdx !== -1 && recursiveCallIdx !== -1 && returnIdx < recursiveCallIdx);

      if (!hasGuard) {
        findings.push({
          message: `Potential unguarded recursion detected: "${fnName}" calls itself without a visible base case`,
          severity: 'critical',
          suggestion: `Add a base case (if/return) before the recursive call to "${fnName}"`,
        });
      }
    }
  }
}
