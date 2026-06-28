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
 *
 * Implemented as a single left-to-right scan so that whichever construct opens
 * first wins. A naive replace-comments-then-strings ordering would treat the
 * `//` inside `log("http://x"); break;` as a line comment and delete the real
 * `break`, producing a false infinite-loop finding.
 */
function stripCommentsAndStrings(code: string): string {
  let out = '';
  let i = 0;
  const n = code.length;

  while (i < n) {
    const c = code[i];
    const next = code[i + 1];

    // Line comment: skip to end of line.
    if (c === '/' && next === '/') {
      i += 2;
      while (i < n && code[i] !== '\n') i++;
      out += ' ';
      continue;
    }

    // Block comment: skip to closing */.
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      out += ' ';
      continue;
    }

    // String / template literal: skip to matching unescaped quote.
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < n) {
        if (code[i] === '\\') {
          i += 2;
          continue;
        }
        if (code[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      out += ' ';
      continue;
    }

    out += c;
    i++;
  }

  return out;
}

/**
 * Word-boundary keyword check. Matches `break` but not `breakPoint`, and
 * `return` but not `returnValue`, eliminating identifier-based false matches.
 */
function hasKeyword(code: string, keyword: string): boolean {
  return new RegExp(`\\b${keyword}\\b`).test(code);
}

/**
 * Detects whether a loop body contains a real loop-level exit/suspend keyword.
 *
 * A bare keyword match anywhere in the body is not enough: `await`/`yield`/etc.
 * only suspend or exit the *outer* loop when they execute as part of its direct
 * control flow. This scan rejects matches that are:
 *   - member accesses (`timer.await()` — `await` is a method name),
 *   - the concise body of a nested arrow function (`() => await work()` — the
 *     keyword runs when the function is called, not by the loop), or
 *   - nested inside another block such as a nested function (brace depth > 0).
 *
 * The body is assumed to already have comments and strings stripped.
 */
function hasLoopExit(body: string, keywords: ReadonlyArray<string>): boolean {
  const keywordSet = new Set(keywords);
  // Tokens we care about: braces, arrow, member access (`.name`), identifiers.
  const tokenPattern = /=>|[{}]|\.\s*[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*/g;
  let braceDepth = 0;
  let prevWasArrow = false;

  for (const match of body.matchAll(tokenPattern)) {
    const token = match[0];

    if (token === '{') {
      braceDepth++;
      prevWasArrow = false;
      continue;
    }
    if (token === '}') {
      if (braceDepth > 0) braceDepth--;
      prevWasArrow = false;
      continue;
    }
    if (token === '=>') {
      prevWasArrow = true;
      continue;
    }

    const isMemberAccess = token.startsWith('.');
    if (
      !isMemberAccess &&
      braceDepth === 0 &&
      !prevWasArrow &&
      keywordSet.has(token)
    ) {
      return true;
    }

    prevWasArrow = false;
  }

  return false;
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
        const hasExit = hasLoopExit(body, LOOP_EXIT_KEYWORDS);
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
