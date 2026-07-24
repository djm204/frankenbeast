import { describe, it, expect } from 'vitest';
import { ConcisenessEvaluator } from '../../../src/evaluators/conciseness.js';
import type { EvaluationInput } from '../../../src/types/evaluation.js';

function createInput(content: string): EvaluationInput {
  return { content, metadata: {} };
}

describe('ConcisenessEvaluator', () => {
  it('implements Evaluator interface', () => {
    const evaluator = new ConcisenessEvaluator();
    expect(evaluator.name).toBe('conciseness');
    expect(evaluator.category).toBe('heuristic');
  });

  it('passes concise code', async () => {
    const evaluator = new ConcisenessEvaluator();
    const content = `export function greet(name: string): string {\n  return \`Hello, \${name}\`;\n}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('flags excessive comments relative to code', async () => {
    const evaluator = new ConcisenessEvaluator();
    const lines = [
      '// This function adds two numbers together',
      '// It takes two parameters a and b',
      '// It returns the sum of a and b',
      '// This is a very important function',
      '// Do not remove this function',
      '// It is used in many places',
      '// The function is pure',
      '// The function has no side effects',
      'function add(a, b) { return a + b; }',
    ];
    const result = await evaluator.evaluate(createInput(lines.join('\n')));

    expect(result.findings.some((f) => f.message.includes('comment'))).toBe(true);
  });

  it('flags TODO/FIXME/HACK comments', async () => {
    const evaluator = new ConcisenessEvaluator();
    const content = `// TODO: fix this later\n// HACK: temporary workaround\nconst x = 1;`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('TODO') || f.message.includes('HACK'))).toBe(true);
  });

  it('passes empty content', async () => {
    const evaluator = new ConcisenessEvaluator();
    const result = await evaluator.evaluate(createInput(''));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
  });

  it('bounds execution and memory on oversized inputs (>500KB)', async () => {
    const evaluator = new ConcisenessEvaluator();
    // Generate an input larger than 500KB (600,000 chars)
    const largeLine = 'const x = 42; // some code comment\n';
    const oversizedContent = largeLine.repeat(20_000); // ~700KB
    expect(oversizedContent.length).toBeGreaterThan(500_000);

    const start = Date.now();
    const result = await evaluator.evaluate(createInput(oversizedContent));
    const duration = Date.now() - start;

    expect(result.evaluatorName).toBe('conciseness');
    expect(duration).toBeLessThan(1000); // Execution should complete very quickly
  });
});

