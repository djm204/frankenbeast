import { describe, it, expect } from 'vitest';
import { ScalabilityEvaluator } from '../../../../src/critique/evaluators/scalability.js';
import type { EvaluationInput } from '../../../../src/critique/types/evaluation.js';

function createInput(content: string): EvaluationInput {
  return { content, metadata: {} };
}

describe('ScalabilityEvaluator', () => {
  it('implements Evaluator interface', () => {
    const evaluator = new ScalabilityEvaluator();
    expect(evaluator.name).toBe('scalability');
    expect(evaluator.category).toBe('heuristic');
  });

  it('passes clean code without hardcoded values', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const port = process.env.PORT ?? 3000;`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('flags hardcoded URLs', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const api = "http://localhost:3000/api";`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('hardcoded'))).toBe(true);
  });

  it('flags hardcoded IP addresses', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const host = "192.168.1.100";`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('hardcoded'))).toBe(true);
  });

  it('flags hardcoded port numbers in assignments', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const port = 8080;`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('hardcoded'))).toBe(true);
  });

  it('passes empty content', async () => {
    const evaluator = new ScalabilityEvaluator();
    const result = await evaluator.evaluate(createInput(''));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
  });
});
