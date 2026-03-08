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

  it('handles empty content', async () => {
    const evaluator = new LogicLoopEvaluator();
    const result = await evaluator.evaluate(createInput(''));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
  });
});
