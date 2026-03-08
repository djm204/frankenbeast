import { describe, it, expect, vi } from 'vitest';
import { SafetyEvaluator } from '../../../src/evaluators/safety.js';
import type { GuardrailsPort } from '../../../src/types/contracts.js';
import type { EvaluationInput } from '../../../src/types/evaluation.js';

function createMockGuardrailsPort(
  rules: GuardrailsPort extends { getSafetyRules(): Promise<infer R> }
    ? Awaited<R>
    : never = [],
): GuardrailsPort {
  return {
    getSafetyRules: vi.fn().mockResolvedValue(rules),
    executeSandbox: vi.fn().mockResolvedValue({
      success: true,
      output: '',
      exitCode: 0,
      timedOut: false,
    }),
  };
}

function createInput(content: string): EvaluationInput {
  return { content, metadata: {} };
}

describe('SafetyEvaluator', () => {
  it('implements Evaluator interface', () => {
    const port = createMockGuardrailsPort();
    const evaluator = new SafetyEvaluator(port);
    expect(evaluator.name).toBe('safety');
    expect(evaluator.category).toBe('deterministic');
    expect(typeof evaluator.evaluate).toBe('function');
  });

  it('passes when no safety rules are violated', async () => {
    const port = createMockGuardrailsPort([
      { id: 'r1', description: 'no eval', pattern: 'eval\\(', severity: 'block' },
    ]);
    const evaluator = new SafetyEvaluator(port);

    const result = await evaluator.evaluate(createInput('const x = 1;'));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
    expect(result.findings).toHaveLength(0);
  });

  it('fails when a blocking rule is violated', async () => {
    const port = createMockGuardrailsPort([
      { id: 'r1', description: 'no eval', pattern: 'eval\\(', severity: 'block' },
    ]);
    const evaluator = new SafetyEvaluator(port);

    const result = await evaluator.evaluate(createInput('eval("code")'));

    expect(result.verdict).toBe('fail');
    expect(result.score).toBe(0);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe('critical');
    expect(result.findings[0]!.message).toContain('no eval');
  });

  it('warns but passes on warning-severity rules', async () => {
    const port = createMockGuardrailsPort([
      { id: 'r1', description: 'avoid console.log', pattern: 'console\\.log', severity: 'warn' },
    ]);
    const evaluator = new SafetyEvaluator(port);

    const result = await evaluator.evaluate(createInput('console.log("debug")'));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBeLessThan(1);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe('warning');
  });

  it('detects multiple rule violations', async () => {
    const port = createMockGuardrailsPort([
      { id: 'r1', description: 'no eval', pattern: 'eval\\(', severity: 'block' },
      { id: 'r2', description: 'no exec', pattern: 'exec\\(', severity: 'block' },
    ]);
    const evaluator = new SafetyEvaluator(port);

    const result = await evaluator.evaluate(createInput('eval("x"); exec("y")'));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(2);
  });

  it('passes when content matches no rules', async () => {
    const port = createMockGuardrailsPort([]);
    const evaluator = new SafetyEvaluator(port);

    const result = await evaluator.evaluate(createInput('anything'));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
    expect(result.findings).toHaveLength(0);
  });
});
