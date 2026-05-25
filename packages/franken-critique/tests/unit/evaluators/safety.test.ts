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

  it('allows non-overlapping quantified alternation safety rules', async () => {
    const port = createMockGuardrailsPort([
      {
        id: 'safe-alternation',
        description: 'safe alternation',
        pattern: '(?:cat|dog)+',
        severity: 'block',
      },
    ]);
    const evaluator = new SafetyEvaluator(port);

    const result = await evaluator.evaluate(createInput('bird'));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
    expect(result.findings).toHaveLength(0);
  });

  it('allows repeated groups with fixed inner quantifiers', async () => {
    const port = createMockGuardrailsPort([
      {
        id: 'fixed-digits',
        description: 'fixed digits',
        pattern: '(?:\\d{2})+',
        severity: 'block',
      },
      {
        id: 'fixed-letter',
        description: 'fixed letter',
        pattern: '(ab{3})+',
        severity: 'block',
      },
      {
        id: 'exact-range-letter',
        description: 'exact range letter',
        pattern: '(?:a{2,2})+',
        severity: 'block',
      },
    ]);
    const evaluator = new SafetyEvaluator(port);

    const result = await evaluator.evaluate(createInput('safe content'));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
    expect(result.findings).toHaveLength(0);
  });

  it('allows optional outer groups with variable inner quantifiers', async () => {
    const port = createMockGuardrailsPort([
      {
        id: 'optional-plus',
        description: 'optional plus',
        pattern: '^(a+)?$',
        severity: 'block',
      },
      {
        id: 'optional-range',
        description: 'optional range',
        pattern: '^(a+){0,1}$',
        severity: 'block',
      },
    ]);
    const evaluator = new SafetyEvaluator(port);

    const result = await evaluator.evaluate(createInput('bbb'));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
    expect(result.findings).toHaveLength(0);
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
        id: 'bad-regex',
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
      {
        id: 'redos-optional',
        description: 'redos optional pattern',
        pattern: '(a?)+$',
        severity: 'block',
      },
    ]);
    const evaluator = new SafetyEvaluator(port);

    const result = await evaluator.evaluate(
      createInput('safe content without matching input'),
    );

    expect(result.verdict).toBe('fail');
    expect(result.score).toBe(0);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('Unsafe safety rule regex'),
        severity: 'critical',
      }),
      expect.objectContaining({
        message: expect.stringContaining('Unsafe safety rule regex'),
        severity: 'critical',
      }),
    ]);
  });

  it('rejects nested brace quantifier patterns before evaluating content', async () => {
    const port = createMockGuardrailsPort([
      {
        id: 'redos-brace',
        description: 'redos brace pattern',
        pattern: '(a{1,})+$',
        severity: 'block',
      },
    ]);
    const evaluator = new SafetyEvaluator(port);

    const result = await evaluator.evaluate(
      createInput('safe content without matching input'),
    );

    expect(result.verdict).toBe('fail');
    expect(result.score).toBe(0);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('Unsafe safety rule regex'),
        severity: 'critical',
      }),
    ]);
  });

  it('rejects grouped nested quantifier bypass patterns', async () => {
    const port = createMockGuardrailsPort([
      {
        id: 'redos-grouped-plus',
        description: 'grouped plus pattern',
        pattern: '((a)+)+$',
        severity: 'block',
      },
      {
        id: 'redos-grouped-brace',
        description: 'grouped brace pattern',
        pattern: '((a{1,})){1,}$',
        severity: 'block',
      },
      {
        id: 'redos-fixed-outer-repeat',
        description: 'fixed outer repeat pattern',
        pattern: '(a+){10}$',
        severity: 'block',
      },
    ]);
    const evaluator = new SafetyEvaluator(port);

    const result = await evaluator.evaluate(
      createInput('safe content without matching input'),
    );

    expect(result.verdict).toBe('fail');
    expect(result.score).toBe(0);
    expect(result.findings).toHaveLength(3);
    expect(result.findings).toEqual([
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
    ]);
  });

  it('does not echo invalid safety rule patterns in findings', async () => {
    const secretPattern = 'secret_token_abc(';
    const port = createMockGuardrailsPort([
      {
        id: 'secret-regex',
        description: 'secret regex',
        pattern: secretPattern,
        severity: 'block',
      },
    ]);
    const evaluator = new SafetyEvaluator(port);

    const result = await evaluator.evaluate(createInput('safe content'));

    expect(JSON.stringify(result.findings)).not.toContain(secretPattern);
  });

  it('rejects grouped overlapping alternation bypass patterns', async () => {
    const port = createMockGuardrailsPort([
      {
        id: 'redos-alternation',
        description: 'grouped alternation pattern',
        pattern: '((a|aa))+$',
        severity: 'block',
      },
      {
        id: 'redos-noncapturing-alternation',
        description: 'grouped noncapturing alternation pattern',
        pattern: '(?:(a|aa))+$',
        severity: 'block',
      },
      {
        id: 'redos-direct-alternation',
        description: 'direct alternation pattern',
        pattern: '(a|aa)+$',
        severity: 'block',
      },
      {
        id: 'redos-direct-noncapturing-alternation',
        description: 'direct noncapturing alternation pattern',
        pattern: '(?:a|aa)+$',
        severity: 'block',
      },
      {
        id: 'redos-named-capture-alternation',
        description: 'named capture alternation pattern',
        pattern: '(?<x>a|aa)+$',
        severity: 'block',
      },
      {
        id: 'redos-digit-class-alternation',
        description: 'digit class alternation pattern',
        pattern: '(?:[0-9]|\\d\\d)+$',
        severity: 'block',
      },
      {
        id: 'redos-hex-alternation',
        description: 'hex alternation pattern',
        pattern: '(?:\\x61|a{2})+$',
        severity: 'block',
      },
      {
        id: 'redos-inline-modifier-alternation',
        description: 'inline modifier alternation pattern',
        pattern: '(?i:a|aa)+$',
        severity: 'block',
      },
      {
        id: 'redos-large-fixed-alternation',
        description: 'large fixed alternation pattern',
        pattern: '(?:a|a{1000000000})+$',
        severity: 'block',
      },
      {
        id: 'redos-unicode-alternation',
        description: 'unicode alternation pattern',
        pattern: '(?:\\u0061|a{2})+$',
        severity: 'block',
      },
      {
        id: 'redos-singleton-class-alternation',
        description: 'singleton class alternation pattern',
        pattern: '(?:a|[a]a)+$',
        severity: 'block',
      },
      {
        id: 'redos-case-folded-alternation',
        description: 'case folded alternation pattern',
        pattern: '(?i:a|Aa)+$',
        severity: 'block',
      },
      {
        id: 'redos-case-folded-class-alternation',
        description: 'case folded class alternation pattern',
        pattern: '(?i:[A-Z]|aa)+$',
        severity: 'block',
      },
      {
        id: 'redos-grouped-alternative',
        description: 'grouped alternative pattern',
        pattern: '(?:a|(?:aa))+$',
        severity: 'block',
      },
      {
        id: 'redos-word-literal-alternation',
        description: 'word literal alternation pattern',
        pattern: '^(?:\\w|a)+!$',
        severity: 'block',
      },
      {
        id: 'redos-later-nested-alternative',
        description: 'later nested alternative pattern',
        pattern: '(?:(?:a|b)|b)+$',
        severity: 'block',
      },
      {
        id: 'redos-class-literal-alternation',
        description: 'class literal alternation pattern',
        pattern: '(?:(?:[ab]|b))+$',
        severity: 'block',
      },
      {
        id: 'redos-wildcard-literal-alternation',
        description: 'wildcard literal alternation pattern',
        pattern: '^(?:.|a)+!$',
        severity: 'block',
      },
      {
        id: 'redos-negated-escape-alternation',
        description: 'negated escape alternation pattern',
        pattern: '^(?:\\D|a)+\\d$',
        severity: 'block',
      },
    ]);
    const evaluator = new SafetyEvaluator(port);

    const result = await evaluator.evaluate(createInput('safe content'));

    expect(result.verdict).toBe('fail');
    expect(result.score).toBe(0);
    expect(result.findings).toHaveLength(19);
    expect(result.findings).toEqual([
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
    ]);
  });
});
