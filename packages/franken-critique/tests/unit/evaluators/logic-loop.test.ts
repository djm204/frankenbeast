import { describe, it, expect } from 'vitest';
import { LogicLoopEvaluator } from '../../../src/evaluators/logic-loop.js';
import type { EvaluationInput } from '../../../src/types/evaluation.js';

function createInput(content: string): EvaluationInput {
  return { content, metadata: {} };
}

describe('LogicLoopEvaluator', () => {
  it('implements Evaluator interface', () => {
    const evaluator = new LogicLoopEvaluator();
    expect(evaluator.name).toBe('logic-loop');
    expect(evaluator.category).toBe('deterministic');
    expect(typeof evaluator.evaluate).toBe('function');
  });

  it('passes clean code', async () => {
    const evaluator = new LogicLoopEvaluator();
    const result = await evaluator.evaluate(
      createInput('function add(a, b) { return a + b; }'),
    );

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
    expect(result.findings).toHaveLength(0);
  });

  it('detects while(true) without break', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `function run() { while(true) { doWork(); } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('passes while(true) with break', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `while(true) { if (done) break; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
  });

  it('detects for(;;) without break', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `for(;;) { doWork(); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('passes for(;;) with break', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `for(;;) { if (done) break; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
  });

  it('detects direct self-recursive function without base case', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `function loop() { loop(); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('recursion');
  });

  it('passes recursive function with conditional guard', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `function fact(n) { if (n <= 1) return 1; return n * fact(n - 1); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
  });

  // Regression tests for issue #69: substring matching produced false matches.
  it('flags infinite loop whose only "break" is inside a comment', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `while(true) {
      // break down the problem into steps
      doWork();
    }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('flags infinite loop whose only "break" is inside a string literal', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `while(true) { log("break the ice"); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('flags infinite loop where "break"/"return" appear only inside identifiers', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `while(true) { breakPoint = computeReturnValue(); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('does not flag a real break that is preceded by a break-like identifier', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `while(true) { breakPoint = 1; if (done) break; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
  });

  it('treats await-based event loops as intentional (no finding)', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `while (true) { const msg = await queue.next(); handle(msg); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
  });

  // Regression for PR #385 (Codex): a `//` inside a string literal must not be
  // treated as a line comment that swallows a real exit on the same line.
  it('does not flag a loop whose break follows a URL-like string on one line', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `while (true) { log("http://x"); break; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
  });

  // Regression for PR #385 (Codex): exit/suspend keywords must apply to the
  // loop itself, not to nested functions or member names.
  it('flags an infinite loop whose only await is inside a nested arrow function', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `while (true) { const f = async () => await work(); doWork(); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('flags an infinite loop whose only await is a member/method name', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `while (true) { timer.await(); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('flags an infinite loop whose only return is inside a nested callback', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `while (true) { items.forEach(() => { return; }); doWork(); `;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('does not treat a "returnValue" identifier as a recursion base case', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `function loop() { const returnValue = 1; loop(); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('recursion');
  });

  // Regression for PR #385 round 2 (Codex F3): an exit inside a braced
  // conditional/try block is a real loop exit and must not be flagged.
  it('passes a loop whose break sits inside a braced if block', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `while (true) { if (done) { break; } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
  });

  it('passes a loop whose return sits inside a braced try block', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `for (;;) { try { return compute(); } catch (e) { log(e); } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
  });

  it('still flags an infinite loop whose only break is inside a NESTED loop', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `while (true) { for (const x of xs) { break; } doWork(); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('still flags an infinite loop whose only break is inside a switch', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `while (true) { switch (k) { case 1: break; } doWork(); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  // Regression for PR #385 round 2 (Codex F4): an await that is not the first
  // token of a concise arrow body still belongs to that nested function.
  it('flags an infinite loop whose await is buried in a concise arrow body', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `while (true) { const f = async () => work(await job); doWork(); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  // Regression for PR #385 round 2 (Codex F5): a `//` inside a regex literal
  // must not be treated as a comment that swallows a real exit.
  it('does not flag a loop whose break follows a regex literal containing slashes', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `while (true) { if (/\\/\\//.test(url)) break; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
  });

  it('still treats division as division, not a regex literal', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `while (true) { const r = a / b / c; if (r > 1) break; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
  });

  it('masks regex literals after control-flow keywords in fallback loop scanning', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `function unfinished() { while (true) { throw /break/.test(reason); doWork(); `;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
  });

  it('masks regex literals after keyword-prefixed await before fallback recursion scanning', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `Analysis notes:\nfunction loop() { const helper = async () => await /if/.test(value); loop(); not javascript`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('recursion');
  });

  it('ignores keywords inside template interpolation strings while fallback scanning', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = 'while (true) { log(`${({ value: "break }" })}`); doWork(); not javascript';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('ignores keywords inside template interpolation comments while fallback scanning', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = 'while (true) { log(`${({ value: /* break } */ 1 })}`); doWork(); not javascript';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('does not treat exits inside class methods as exits from the containing loop', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `while (true) { class Worker { run() { return work(); } } doWork(); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('does not treat a nested function call as outer unguarded recursion', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `function loop() { function inner() { loop(); } return inner; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
  });

  it('detects unguarded recursion through an immediately invoked arrow function', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `function loop() { (() => loop())(); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('recursion');
  });

  it('detects TypeScript functions that contain infinite loops', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `function run(): void { while (true) { work(); } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('treats for-await loops as intentional async suspension points', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `async function run() { while (true) { for await (const job of queue) { handle(job); } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
  });

  it('detects infinite loops inside markdown code fences', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = '```js\nwhile (true) { doWork(); }\n```';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('detects infinite loops in later markdown code fences', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = '```js\nconst ok = true;\n```\n```js\nwhile (true) { doWork(); }\n```';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('detects infinite loop snippets embedded in prose', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = 'Here is the issue: while (true) { doWork(); }';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('tries later keyword occurrences when extracting prose snippets', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = 'This may run while the snippet is while (true) { doWork(); }';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('trims prose after embedded code snippets', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = 'while (true) { doWork(); }\nThis hangs.';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('does not treat commented snippets as executable fallback code', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = 'const ok = true; // while (true) { doWork(); }';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
  });

  it('detects infinite loops in TSX snippets', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `function C() { while (true) { doWork(); } return <div />; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('does not extract fallback snippets from string literals', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `const msg = "while (true) { work(); }";`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
  });

  it('parses valid sources before treating fence markers inside strings as markdown', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = 'const msg = "```js\\nwhile (true) { work(); }\\n```";';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
  });

  it('ignores string literal keywords during fallback extraction', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = 'const msg = "while (true) { work(); }"; ???';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
  });

  it('does not duplicate findings from a single fenced block', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = '```js\nwhile (true) { doWork(); }\n```';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
  });

  it('balances fallback snippets without counting string braces', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = 'while (true) { log("}"); work(); } and then hangs';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('parses valid sources before extracting fenced comments', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = '/* ```js\nwhile (true) { work(); }\n``` */\nconst ok = true;';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
  });

  it('detects recursion through invoked local helper functions', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = 'function loop(){ function again(){ loop(); } again(); }';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('recursion');
  });

  it('falls back for obvious malformed infinite loops', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = 'while (true) { doWork(; }';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('does not duplicate overlapping fallback snippets', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = 'Note: while (true) { work(); } function ok() {}';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
  });

  it('continues past many non-code keyword hits when extracting fallback snippets', async () => {
    const evaluator = new LogicLoopEvaluator();
    const prefix = Array.from({ length: 60 }, () => 'while ordinary prose').join(' ');
    const content = `${prefix} while (true) { work(); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('keeps malformed loops inside fences visible to fallback detection', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = '```js\nwhile (true) { doWork(; }\n```';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('detects recursion through invoked arrow helper functions', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = 'function loop(){ const again = () => loop(); again(); }';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('recursion');
  });

  it('falls back for malformed loops even when another snippet parses', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = 'while (true) { doWork(; } function ok() {}';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('honors guards inside invoked helper functions', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = 'function loop(n){ function again(){ if (n <= 0) return; loop(n - 1); } again(); }';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
  });

  it('does not treat nested fallback returns as loop exits', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = 'while (true) { const f = () => { return; }; doWork(; }';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('infinite loop');
  });

  it('does not duplicate findings when the full source already parses', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `function run() { while (true) { doWork(); } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
  });

  it('detects unguarded recursion through immediately invoked function call helpers', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `function loop(){ (function(){ loop(); }).call(null); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('recursion');
  });

  it('detects unguarded recursion in named function expressions', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `const f = function loop() { loop(); };`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('recursion');
  });

  it('honors guards inside recursive immediately invoked functions', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `function loop(n) { (() => { if (n <= 0) return; loop(n - 1); })(); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
  });

  it('detects unguarded recursion inside class static blocks', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `function loop() { class C { static { loop(); } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('recursion');
  });

  it('treats throws in class static blocks as loop exits', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = `while (true) { class C { static { throw new Error('stop'); } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
  });

  // Regression for PR #385 round 2 (Codex F6): real code inside a template
  // interpolation must remain visible to recursion detection.
  it('detects recursion that occurs inside a template interpolation', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = 'function loop() { const s = `${loop()}`; }';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('recursion');
  });

  it('keeps fallback exits scoped out of nested loops and functions', async () => {
    const evaluator = new LogicLoopEvaluator();
    const nestedBreak = 'while (true) { for (;;) { break; } doWork(; }';
    const nestedAwait = 'while (true) { const f = async () => await job; doWork(; }';

    await expect(evaluator.evaluate(createInput(nestedBreak))).resolves.toMatchObject({ verdict: 'fail' });
    await expect(evaluator.evaluate(createInput(nestedAwait))).resolves.toMatchObject({ verdict: 'fail' });
  });

  it('falls back to recursion checks for malformed function snippets', async () => {
    const evaluator = new LogicLoopEvaluator();
    const result = await evaluator.evaluate(createInput('function loop() { loop(; }'));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('recursion');
  });

  it('does not duplicate overlapping prose function and loop snippets', async () => {
    const evaluator = new LogicLoopEvaluator();
    const result = await evaluator.evaluate(createInput('Note: function run() { while (true) { work(); } }'));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
  });

  it('masks fallback text using code-unit offsets', async () => {
    const evaluator = new LogicLoopEvaluator();
    const result = await evaluator.evaluate(createInput('😀😀😀😀😀😀 const msg = "while (true) { work(); }"; ???'));

    expect(result.verdict).toBe('pass');
  });

  it('does not count helper guards that run after helper-mediated recursion', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = 'function loop(){ function guard(){ return; } function again(){ loop(); } again(); guard(); }';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('recursion');
  });

  it('resolves helper calls only from the call-site lexical scope', async () => {
    const evaluator = new LogicLoopEvaluator();
    const hiddenHelper = 'function loop(){ { function again(){ loop(); } } function again(){ return; } again(); }';
    const blockScopedHelper = 'function loop(){ { function again(){ loop(); } again(); } }';

    await expect(evaluator.evaluate(createInput(hiddenHelper))).resolves.toMatchObject({ verdict: 'pass' });
    await expect(evaluator.evaluate(createInput(blockScopedHelper))).resolves.toMatchObject({ verdict: 'fail' });
  });

  it('does not treat returns after helper recursion as guards', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = 'function loop(){ function again(){ loop(); return; } again(); }';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('recursion');
  });

  it('preserves template interpolation code during malformed fallback scans', async () => {
    const evaluator = new LogicLoopEvaluator();
    const content = 'function loop(){ const s = `${loop()}`; bad(; }';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings[0]!.message).toContain('recursion');
  });

  it('handles empty content', async () => {
    const evaluator = new LogicLoopEvaluator();
    const result = await evaluator.evaluate(createInput(''));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
  });
});
