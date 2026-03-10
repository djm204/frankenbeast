import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  Result,
  Verdict,
  RationaleBlock,
  VerificationResult,
  ILlmClient,
  IResultLlmClient,
  TokenSpend,
  FrankenContext,
  Severity,
  CritiqueSeverity,
  TriggerSeverity,
  FlagSeverity,
  TaskId,
} from '../../src/index.js';

describe('Result type', () => {
  it('ok result has value', () => {
    const result: Result<string> = { ok: true, value: 'hello' };
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('hello');
    }
  });

  it('error result has error', () => {
    const result: Result<string> = { ok: false, error: new Error('fail') };
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('fail');
    }
  });
});

describe('Verdict type', () => {
  it('accepts pass and fail', () => {
    const v1: Verdict = 'pass';
    const v2: Verdict = 'fail';
    expect(v1).toBe('pass');
    expect(v2).toBe('fail');
  });
});

describe('Severity types', () => {
  it('CritiqueSeverity is a subset of Severity', () => {
    const s: CritiqueSeverity = 'critical';
    const general: Severity = s;
    expect(general).toBe('critical');
  });

  it('TriggerSeverity is a subset of Severity', () => {
    const s: TriggerSeverity = 'high';
    const general: Severity = s;
    expect(general).toBe('high');
  });

  it('FlagSeverity is a subset of Severity', () => {
    const s: FlagSeverity = 'medium';
    const general: Severity = s;
    expect(general).toBe('medium');
  });
});

describe('RationaleBlock type', () => {
  it('has correct shape', () => {
    expectTypeOf<RationaleBlock>().toHaveProperty('taskId');
    expectTypeOf<RationaleBlock>().toHaveProperty('reasoning');
    expectTypeOf<RationaleBlock>().toHaveProperty('expectedOutcome');
    expectTypeOf<RationaleBlock>().toHaveProperty('timestamp');
  });
});

describe('VerificationResult type', () => {
  it('approved variant', () => {
    const result: VerificationResult = { verdict: 'approved' };
    expect(result.verdict).toBe('approved');
  });

  it('rejected variant with reason', () => {
    const result: VerificationResult = { verdict: 'rejected', reason: 'unsafe' };
    expect(result.verdict).toBe('rejected');
    if (result.verdict === 'rejected') {
      expect(result.reason).toBe('unsafe');
    }
  });
});

describe('LLM client interfaces', () => {
  it('ILlmClient has complete returning Promise<string>', () => {
    expectTypeOf<ILlmClient>().toHaveProperty('complete');
  });

  it('IResultLlmClient has complete returning Promise<Result<string>>', () => {
    expectTypeOf<IResultLlmClient>().toHaveProperty('complete');
  });
});

describe('TokenSpend type', () => {
  it('has required fields', () => {
    const spend: TokenSpend = {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      estimatedCostUsd: 0.05,
    };
    expect(spend.totalTokens).toBe(150);
  });
});

describe('FrankenContext type', () => {
  it('has required fields', () => {
    const ctx: FrankenContext = {
      projectId: 'proj-001',
      sessionId: 'sess-001',
      userInput: 'test input',
      tokenSpend: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      audit: [],
      phase: 'ingestion',
    };
    expect(ctx.phase).toBe('ingestion');
    expect(ctx.audit).toEqual([]);
  });

  it('accepts all phase values', () => {
    const phases: FrankenContext['phase'][] = ['ingestion', 'planning', 'execution', 'closure'];
    expect(phases).toHaveLength(4);
  });
});
