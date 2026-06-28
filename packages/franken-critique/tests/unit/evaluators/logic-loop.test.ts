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

  it('handles empty content', async () => {
    const evaluator = new LogicLoopEvaluator();
    const result = await evaluator.evaluate(createInput(''));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
  });
});
