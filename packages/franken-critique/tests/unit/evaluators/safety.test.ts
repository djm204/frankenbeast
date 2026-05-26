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
      {
        id: 'redos-word-range-alternation',
        description: 'word range alternation pattern',
        pattern: '^(?:\\w|[a-z]a)+!$',
        severity: 'block',
      },
      {
        id: 'redos-whitespace-tab-alternation',
        description: 'whitespace tab alternation pattern',
        pattern: '^(?:\\s|\\t)+!$',
        severity: 'block',
      },
      {
        id: 'redos-not-digit-word-alternation',
        description: 'not digit word alternation pattern',
        pattern: '^(?:\\D|\\w)+!$',
        severity: 'block',
      },
      {
        id: 'redos-negated-class-word-alternation',
        description: 'negated class word alternation pattern',
        pattern: '^(?:[^a]|\\w)+!$',
        severity: 'block',
      },
      {
        id: 'redos-space-class-alternation',
        description: 'space class alternation pattern',
        pattern: '^(?:\\s|[ ])+!$',
        severity: 'block',
      },
      {
        id: 'redos-hex-class-alternation',
        description: 'hex class alternation pattern',
        pattern: '^(?:[\\x61b]|aa)+$',
        severity: 'block',
      },
      {
        id: 'redos-nbsp-space-alternation',
        description: 'nbsp space alternation pattern',
        pattern: '^(?:\\s|\\u00A0\\s)+!$',
        severity: 'block',
      },
      {
        id: 'redos-truncated-prefix-overlap',
        description: 'truncated prefix overlap pattern',
        pattern: '^(?:a{1001}|a{1001}a)+$',
        severity: 'block',
      },
      {
        id: 'redos-not-word-unicode-alternation',
        description: 'not word unicode alternation pattern',
        pattern: '^(?:\\W|é)+$',
        severity: 'block',
      },
      {
        id: 'redos-not-word-unicode-class-alternation',
        description: 'not word unicode class alternation pattern',
        pattern: '^(?:\\W|[éê])+a$',
        severity: 'block',
      },
      {
        id: 'redos-backreference-alternation',
        description: 'backreference alternation pattern',
        pattern: '^([a-z]+)(?:\\1|a)+$',
        severity: 'block',
      },
      {
        id: 'redos-forward-backreference-alternation',
        description: 'forward backreference alternation pattern',
        pattern: '^(?:\\1a|a)+(a)$',
        severity: 'block',
      },
      {
        id: 'redos-case-folded-escaped-alternation',
        description: 'case folded escaped alternation pattern',
        pattern: '(?i:\\x41|aa)+$',
        severity: 'block',
      },
      {
        id: 'redos-case-folded-preserves-negated-escape',
        description: 'case folded negated escape pattern',
        pattern: '^(?i:\\D|a)+$',
        severity: 'block',
      },
      {
        id: 'redos-nonascii-negated-class-range-overlap',
        description: 'non-ascii negated class range overlap pattern',
        pattern: '^(?:[^a]|[Ω-Ϋ][Ω-Ϋ])+$',
        severity: 'block',
      },
      {
        id: 'redos-octal-escape-alternation',
        description: 'octal escape alternation pattern',
        pattern: '^(?:\\141|aa)+$',
        severity: 'block',
      },
      {
        id: 'redos-octal-class-escape-alternation',
        description: 'octal class escape alternation pattern',
        pattern: '^(?:[\\141]|aa)+$',
        severity: 'block',
      },
      {
        id: 'redos-legacy-incomplete-hex-escape-alternation',
        description: 'legacy incomplete hex escape alternation pattern',
        pattern: '^(?:\\x|xx)+$',
        severity: 'block',
      },
      {
        id: 'redos-class-word-boundary-identity-escape',
        description: 'class word boundary identity escape pattern',
        pattern: '^(?:[\\B]|BB)+$',
        severity: 'block',
      },
      {
        id: 'redos-class-nonletter-control-escape',
        description: 'class non-letter control escape pattern',
        pattern: '^(?:[\\c0]|\\x10\\x10)+$',
        severity: 'block',
      },
      {
        id: 'redos-comma-alt-serialization',
        description: 'comma alternative serialization pattern',
        pattern: '^(?:(?:,a)|(?:,b)|,)+$',
        severity: 'block',
      },
      {
        id: 'redos-zero-width-suffix-alternation',
        description: 'zero-width suffix alternation pattern',
        pattern: '^((a|aa)(?=a))+$',
        severity: 'block',
      },
    ]);
    const evaluator = new SafetyEvaluator(port);

    const result = await evaluator.evaluate(createInput('safe content'));

    expect(result.verdict).toBe('fail');
    expect(result.score).toBe(0);
    expect(result.findings).toHaveLength(41);
    expect(result.findings).toEqual(
      Array.from({ length: 41 }, () =>
        expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      ),
    );
  });

  it('allows disjoint and deterministic repeated alternatives', async () => {
    const port = createMockGuardrailsPort([
      {
        id: 'negated-class-disjoint',
        description: 'negated class disjoint',
        pattern: '^(?:[^a]|a)+!$',
        severity: 'block',
      },
      {
        id: 'not-space-disjoint',
        description: 'not space disjoint',
        pattern: '^(?:\\S| )+!$',
        severity: 'block',
      },
      {
        id: 'long-prefix-disjoint',
        description: 'long prefix disjoint',
        pattern: '^(?:a{257}b|a{257}c)+$',
        severity: 'block',
      },
      {
        id: 'nested-group-prefix-disjoint',
        description: 'nested group prefix disjoint',
        pattern: '^(?:(?:ab)|(?:ac))+$',
        severity: 'block',
      },
      {
        id: 'lazy-exact-count',
        description: 'lazy exact counted quantifier',
        pattern: '^(?:a{2}?)+$',
        severity: 'block',
      },
      {
        id: 'dot-newline-disjoint',
        description: 'dot newline disjoint',
        pattern: '^(?:.|\\n)+$',
        severity: 'block',
      },
      {
        id: 'character-class-escape-not-backreference',
        description: 'character class escape is not backreference',
        pattern: '^[\\1]+$',
        severity: 'block',
      },
      {
        id: 'unknown-named-escape-not-backreference',
        description: 'unknown named escape is not backreference',
        pattern: '^\\k<missing>$',
        severity: 'block',
      },
      {
        id: 'class-text-not-named-group',
        description: 'class text is not named group',
        pattern: '^[((?<x>)]\\k<x>$',
        severity: 'block',
      },
      {
        id: 'deterministic-suffix-after-inner-alternation',
        description: 'deterministic suffix after inner alternation',
        pattern: '^((a|aa)b)+$',
        severity: 'block',
      },
      {
        id: 'dot-line-separator-disjoint',
        description: 'dot line separator disjoint',
        pattern: '^(?:.|\\u2028)+!$',
        severity: 'block',
      },
      {
        id: 'dot-all-line-terminators-disjoint',
        description: 'dot all line terminators disjoint',
        pattern: '^(?:.|[\\u2028\\u2029])+!$',
        severity: 'block',
      },
      {
        id: 'backspace-class-disjoint',
        description: 'backspace class disjoint',
        pattern: '^(?:[\\b]|b)+$',
        severity: 'block',
      },
      {
        id: 'inline-modifier-text-in-class',
        description: 'inline modifier text in class',
        pattern: '^(?:.|\\n\\n)+[(?s:]$',
        severity: 'block',
      },
    ]);
    const evaluator = new SafetyEvaluator(port);

    const result = await evaluator.evaluate(createInput(''));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('limits inline dotAll rewriting to the modifier group scope', () => {
    const evaluator = new SafetyEvaluator(createMockGuardrailsPort()) as unknown as {
      hasUnsafeRegexShape(pattern: string): boolean;
    };

    expect(evaluator.hasUnsafeRegexShape('^(?s:a)(?:.|\\n)+!$')).toBe(false);
    expect(evaluator.hasUnsafeRegexShape('^(?s:(.|\\n\\n))+!$')).toBe(true);
  });

  it('rejects nullable and variable-quantified alternation bypass patterns', async () => {
    const port = createMockGuardrailsPort([
      {
        id: 'redos-empty-branch-alternation',
        description: 'empty branch alternation pattern',
        pattern: '^(a(?:|a))+$',
        severity: 'block',
      },
      {
        id: 'redos-variable-quantifier-alternation',
        description: 'variable quantifier alternation pattern',
        pattern: '^(?:aa|a?)+$',
        severity: 'block',
      },
      {
        id: 'redos-nullable-nested-alternation',
        description: 'nullable nested alternation pattern',
        pattern: '^(?:a(?:|a))+$',
        severity: 'block',
      },
      {
        id: 'redos-nondisambiguating-suffix',
        description: 'nondisambiguating suffix pattern',
        pattern: '^((a|aa)a)+$',
        severity: 'block',
      },
      {
        id: 'redos-nullable-prefix-alternation',
        description: 'nullable prefix alternation pattern',
        pattern: '^(?:a?b|b)+$',
        severity: 'block',
      },
      {
        id: 'redos-star-prefix-alternation',
        description: 'star prefix alternation pattern',
        pattern: '^(?:a*b|b)+$',
        severity: 'block',
      },
      {
        id: 'redos-lookahead-branch-alternation',
        description: 'lookahead branch alternation pattern',
        pattern: '^(?:(?!b)a|aa)+$',
        severity: 'block',
      },
      {
        id: 'redos-lookbehind-branch-alternation',
        description: 'lookbehind branch alternation pattern',
        pattern: '^(?:(?<!b)a|aa)+$',
        severity: 'block',
      },
      {
        id: 'redos-control-escape-alternation',
        description: 'control escape alternation pattern',
        pattern: '^(?:\\cJ|\\n\\n)+$',
        severity: 'block',
      },
      {
        id: 'redos-nul-escape-alternation',
        description: 'nul escape alternation pattern',
        pattern: '^(?:\\0|\\x00\\x00)+$',
        severity: 'block',
      },
      {
        id: 'redos-dotall-alternation',
        description: 'dotall alternation pattern',
        pattern: '^(?s:(.|\\n\\n))+!$',
        severity: 'block',
      },
      {
        id: 'redos-unicode-space-alternation',
        description: 'unicode space alternation pattern',
        pattern: '^(?:\\s|\\u1680\\u1680)+$',
        severity: 'block',
      },
      {
        id: 'redos-combined-dotall-alternation',
        description: 'combined dotall alternation pattern',
        pattern: '^(?is:(.|\\n\\n))+!$',
        severity: 'block',
      },
      {
        id: 'redos-disjoint-quantified-branch',
        description: 'disjoint quantified branch pattern',
        pattern: '^(?:a+|\\d)+$',
        severity: 'block',
      },
    ]);
    const evaluator = new SafetyEvaluator(port);

    const result = await evaluator.evaluate(createInput('safe content'));

    expect(result.verdict).toBe('fail');
    expect(result.score).toBe(0);
    expect(result.findings).toHaveLength(14);
    expect(result.findings).toEqual(
      Array.from({ length: 14 }, () =>
        expect.objectContaining({ message: expect.stringContaining('Unsafe') }),
      ),
    );
  });
});
