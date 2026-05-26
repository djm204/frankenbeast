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
      {
        id: 'r1',
        description: 'no eval',
        pattern: 'eval\\(',
        severity: 'block',
      },
    ]);
    const evaluator = new SafetyEvaluator(port);

    const result = await evaluator.evaluate(createInput('const x = 1;'));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
    expect(result.findings).toHaveLength(0);
  });

  it('fails when a blocking rule is violated', async () => {
    const port = createMockGuardrailsPort([
      {
        id: 'r1',
        description: 'no eval',
        pattern: 'eval\\(',
        severity: 'block',
      },
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
      {
        id: 'r1',
        description: 'avoid console.log',
        pattern: 'console\\.log',
        severity: 'warn',
      },
    ]);
    const evaluator = new SafetyEvaluator(port);

    const result = await evaluator.evaluate(
      createInput('console.log("debug")'),
    );

    expect(result.verdict).toBe('pass');
    expect(result.score).toBeLessThan(1);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe('warning');
  });

  it('detects multiple rule violations', async () => {
    const port = createMockGuardrailsPort([
      {
        id: 'r1',
        description: 'no eval',
        pattern: 'eval\\(',
        severity: 'block',
      },
      {
        id: 'r2',
        description: 'no exec',
        pattern: 'exec\\(',
        severity: 'block',
      },
    ]);
    const evaluator = new SafetyEvaluator(port);

    const result = await evaluator.evaluate(
      createInput('eval("x"); exec("y")'),
    );

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

  it('reports malformed safety rule regexes instead of throwing', async () => {
    const port = createMockGuardrailsPort([
      {
        id: 'bad',
        description: 'bad regex',
        pattern: 'eval(',
        severity: 'block',
      },
    ]);
    const evaluator = new SafetyEvaluator(port);

    await expect(
      evaluator.evaluate(createInput('const x = 1;')),
    ).resolves.toMatchObject({
      verdict: 'fail',
      score: 0,
      findings: [
        expect.objectContaining({
          message: expect.stringContaining('Invalid safety rule regex'),
          severity: 'critical',
        }),
      ],
    });
  });

  it('rejects nested quantifier patterns before evaluating content', async () => {
    const port = createMockGuardrailsPort([
      {
        id: 'redos',
        description: 'redos pattern',
        pattern: '(a+)+$',
        severity: 'block',
      },
    ]);
    const evaluator = new SafetyEvaluator(port);

    const startedAt = performance.now();
    const result = await evaluator.evaluate(createInput(`${'a'.repeat(40)}!`));
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs).toBeLessThan(100);

    expect(result.verdict).toBe('fail');
    expect(result.score).toBe(0);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('Unsafe safety rule regex'),
        severity: 'critical',
      }),
    ]);
  });

  it('allows noncapturing groups with safe optional quantifiers', async () => {
    const port = createMockGuardrailsPort([
      {
        id: 'url',
        description: 'example domain',
        pattern: '(?:https?:\\/\\/)?example\\.com',
        severity: 'block',
      },
    ]);
    const evaluator = new SafetyEvaluator(port);

    const result = await evaluator.evaluate(createInput('https://example.com'));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('Safety rule violated'),
        severity: 'critical',
      }),
    ]);
  });

  it('allows literal escaped backslash sequences that resemble backreferences', async () => {
    const port = createMockGuardrailsPort([
      {
        id: 'literal-number',
        description: 'literal numeric backreference text',
        pattern: '\\\\1',
        severity: 'warn',
      },
      {
        id: 'literal-name',
        description: 'literal named backreference text',
        pattern: '\\\\k<name>',
        severity: 'warn',
      },
    ]);
    const evaluator = new SafetyEvaluator(port);

    const result = await evaluator.evaluate(createInput('literal \\1 and \\k<name>'));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('literal numeric backreference text'),
        severity: 'warning',
      }),
      expect.objectContaining({
        message: expect.stringContaining('literal named backreference text'),
        severity: 'warning',
      }),
    ]);
  });
});
