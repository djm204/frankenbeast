import type { Evaluator, EvaluationInput, EvaluationResult, EvaluationFinding } from './evaluator.js';

// Loop headers we treat as unconditional: while(true){ and for(;;){.
// We only match up to the opening brace; the body is extracted with a
// brace-balanced scan so nested `{ ... }` blocks (if/try/switch) are preserved.
const INFINITE_LOOP_HEADERS = [
  /while\s*\(\s*true\s*\)\s*\{/g,
  /for\s*\(\s*;;\s*\)\s*\{/g,
];

// Matches function name() { ... } — body captured lazily; recursion detection
// works on the sanitized body (comments/strings removed, interpolations kept).
const SELF_RECURSION_PATTERN =
  /function\s+(\w+)\s*\([^)]*\)\s*\{([\s\S]*?)\}/g;

// Keywords that legitimately exit (or suspend) a loop. `await`/`yield` cover
// intentional async event loops such as `while (true) { await queue.next(); }`.
const LOOP_EXIT_KEYWORDS = new Set(['break', 'return', 'throw', 'await', 'yield']);

// Keywords that open a nested loop or switch. A `break` inside one of these is
// captured by it, not by the outer loop, so it does not count as an outer exit.
const LOOP_OR_SWITCH_KEYWORDS = new Set(['for', 'while', 'do', 'switch']);

/**
 * Returns true if a `/` at this position can legally start a regex literal,
 * based on the previous significant character. A `/` after a value (identifier,
 * number, closing bracket, or string) is division; anywhere an expression is
 * expected it begins a regex. This is the standard JS lexer heuristic.
 */
function regexCanStart(prevSignificant: string): boolean {
  if (prevSignificant === '') return true;
  return !/[A-Za-z0-9_$)\]}'"`]/.test(prevSignificant);
}

/**
 * Removes comments, string literals, and regex literals from a code snippet so
 * that keyword detection operates on real code, not on prose or data. Template
 * literals are special-cased: the literal text is dropped but the code inside
 * `${ ... }` interpolations is preserved (and recursively sanitized) so that
 * real expressions like `` `${loop()}` `` remain visible to recursion detection.
 *
 * Implemented as a single left-to-right scan so whichever construct opens first
 * wins. A naive replace-comments-then-strings ordering would treat the `//`
 * inside `log("http://x"); break;` or `/\/\//.test(x); break;` as a line comment
 * and delete the real `break`, producing a false infinite-loop finding.
 */
function sanitize(code: string): string {
  let out = '';
  let i = 0;
  const n = code.length;
  let prevSignificant = '';

  while (i < n) {
    const c = code[i]!;
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

    // String literal: skip to matching unescaped quote.
    if (c === '"' || c === "'") {
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
      prevSignificant = ')';
      continue;
    }

    // Template literal: drop literal text, keep & sanitize ${...} code.
    if (c === '`') {
      i++;
      out += ' ';
      while (i < n) {
        if (code[i] === '\\') {
          i += 2;
          continue;
        }
        if (code[i] === '`') {
          i++;
          break;
        }
        if (code[i] === '$' && code[i + 1] === '{') {
          i += 2;
          let depth = 1;
          let inner = '';
          while (i < n && depth > 0) {
            const cc = code[i];
            if (cc === '{') depth++;
            else if (cc === '}') {
              depth--;
              if (depth === 0) {
                i++;
                break;
              }
            }
            inner += cc;
            i++;
          }
          out += ` ${sanitize(inner)} `;
          continue;
        }
        i++;
      }
      prevSignificant = ')';
      continue;
    }

    // Regex literal: skip to closing unescaped `/` (respecting char classes).
    if (c === '/' && regexCanStart(prevSignificant)) {
      i++;
      let inClass = false;
      let terminated = false;
      while (i < n) {
        const ch = code[i];
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (ch === '\n') break; // unterminated — not a regex, bail
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) {
          i++;
          terminated = true;
          break;
        }
        i++;
      }
      if (terminated) {
        out += ' ';
        prevSignificant = ')';
        continue;
      }
      // Not a regex after all: fall through and treat `/` as a normal char.
      out += c;
      prevSignificant = c;
      i++;
      continue;
    }

    out += c;
    if (!/\s/.test(c)) prevSignificant = c;
    i++;
  }

  return out;
}

/**
 * Extracts the brace-balanced block starting at `openBraceIdx` (which must point
 * at a `{`). Returns the content between the outer braces. If the block is never
 * closed (truncated input), returns everything after the opening brace.
 * Assumes the code has already been sanitized so all braces are real.
 */
function extractBlock(code: string, openBraceIdx: number): string {
  let depth = 0;
  for (let i = openBraceIdx; i < code.length; i++) {
    const ch = code[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return code.slice(openBraceIdx + 1, i);
    }
  }
  return code.slice(openBraceIdx + 1);
}

/**
 * Word-boundary keyword check. Matches `break` but not `breakPoint`, and
 * `return` but not `returnValue`, eliminating identifier-based false matches.
 */
function hasKeyword(code: string, keyword: string): boolean {
  return new RegExp(`\\b${keyword}\\b`).test(code);
}

/**
 * Detects whether a (sanitized, brace-balanced) loop body contains a real
 * loop-level exit/suspend keyword.
 *
 * A bare keyword match anywhere in the body is not enough. An exit counts only
 * when it executes as part of the loop's own control flow, so this scan rejects:
 *   - member accesses (`timer.await()` — `await` is a method name),
 *   - keywords inside a nested function (braced `() => { return; }` or concise
 *     `() => await work(...)` arrow bodies, and `function` declarations), and
 *   - a `break` captured by a nested loop or `switch` rather than the outer loop.
 *
 * `return`/`throw`/`await`/`yield` inside plain blocks (`if`/`try`) still count,
 * which is why brace-balanced extraction matters: an exit inside `if (x) { ... }`
 * is a legitimate loop exit.
 */
function hasLoopExit(body: string): boolean {
  const tokenPattern = /=>|function\b|[{}()[\];,]|\.\s*[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*/g;

  // Semantic stack of `{ ... }` frames; brackets ()[]{} all bump `bracketDepth`,
  // which positions concise-arrow markers.
  const braceStack: Array<{ isFunc: boolean; loopOrSwitch: boolean }> = [];
  const conciseMarkers: number[] = []; // bracketDepth at each open concise arrow
  let bracketDepth = 0;
  let pendingFunc = false; // next `{` opens a function body
  let pendingLoopOrSwitch = false; // next `{` opens a loop/switch body
  let arrowPending = false; // we just saw `=>`, awaiting its body

  const insideFunction = (): boolean =>
    conciseMarkers.length > 0 || braceStack.some((f) => f.isFunc);
  const insideNestedLoopOrSwitch = (): boolean =>
    braceStack.some((f) => f.loopOrSwitch);

  for (const match of body.matchAll(tokenPattern)) {
    const token = match[0];

    // Resolve a concise-vs-braced arrow body the moment we see the next token.
    if (arrowPending) {
      arrowPending = false;
      if (token === '{') {
        pendingFunc = true; // braced arrow body; fall through to `{` handling
      } else {
        conciseMarkers.push(bracketDepth); // concise body; keep scanning token
      }
    }

    if (token === '{') {
      braceStack.push({
        isFunc: pendingFunc,
        loopOrSwitch: !pendingFunc && pendingLoopOrSwitch,
      });
      bracketDepth++;
      pendingFunc = false;
      pendingLoopOrSwitch = false;
      continue;
    }
    if (token === '(' || token === '[') {
      bracketDepth++;
      continue;
    }
    if (token === '}') {
      braceStack.pop();
      bracketDepth = Math.max(0, bracketDepth - 1);
      while (conciseMarkers.length && conciseMarkers[conciseMarkers.length - 1]! > bracketDepth) {
        conciseMarkers.pop();
      }
      pendingLoopOrSwitch = false;
      pendingFunc = false;
      continue;
    }
    if (token === ')' || token === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      while (conciseMarkers.length && conciseMarkers[conciseMarkers.length - 1]! > bracketDepth) {
        conciseMarkers.pop();
      }
      continue;
    }
    if (token === ';' || token === ',') {
      // A statement/argument boundary at the arrow's own depth ends a concise body.
      while (conciseMarkers.length && conciseMarkers[conciseMarkers.length - 1]! >= bracketDepth) {
        conciseMarkers.pop();
      }
      pendingLoopOrSwitch = false;
      pendingFunc = false;
      continue;
    }
    if (token === '=>') {
      arrowPending = true;
      continue;
    }
    if (token === 'function') {
      pendingFunc = true;
      continue;
    }
    if (token.startsWith('.')) {
      continue; // member access — never a loop keyword
    }

    if (LOOP_OR_SWITCH_KEYWORDS.has(token)) {
      pendingLoopOrSwitch = true;
      continue;
    }

    if (LOOP_EXIT_KEYWORDS.has(token)) {
      if (insideFunction()) continue;
      if (token === 'break' && insideNestedLoopOrSwitch()) continue;
      return true;
    }
  }

  return false;
}

export class LogicLoopEvaluator implements Evaluator {
  readonly name = 'logic-loop';
  readonly category = 'deterministic' as const;

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    const findings: EvaluationFinding[] = [];
    const sanitized = sanitize(input.content);

    this.checkInfiniteLoops(sanitized, findings);
    this.checkUnguardedRecursion(sanitized, findings);

    const score = findings.length === 0 ? 1 : 0;

    return {
      evaluatorName: this.name,
      verdict: findings.length === 0 ? 'pass' : 'fail',
      score,
      findings,
    };
  }

  private checkInfiniteLoops(sanitized: string, findings: EvaluationFinding[]): void {
    for (const header of INFINITE_LOOP_HEADERS) {
      for (const match of sanitized.matchAll(header)) {
        const braceIdx = match.index! + match[0].length - 1; // position of `{`
        const body = extractBlock(sanitized, braceIdx);
        if (!hasLoopExit(body)) {
          findings.push({
            message: 'Potential infinite loop detected: loop has no break or return statement',
            severity: 'critical',
            suggestion: 'Add a break condition or return statement inside the loop',
          });
        }
      }
    }
  }

  private checkUnguardedRecursion(sanitized: string, findings: EvaluationFinding[]): void {
    for (const match of sanitized.matchAll(SELF_RECURSION_PATTERN)) {
      const fnName = match[1];
      const body = match[2] ?? '';

      if (!fnName) continue;

      // Check if the function calls itself.
      const callPattern = new RegExp(`\\b${fnName}\\s*\\(`, 'g');
      if (!callPattern.test(body)) continue;

      // Check for a guard: a conditional, or a return before the recursive call.
      // Word-boundary matching avoids treating identifiers like `notify` or
      // `returnValue` as guards.
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
