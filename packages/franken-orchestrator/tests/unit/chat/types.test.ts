import { describe, it, expect } from 'vitest';
import {
  ModelTier,
  IntentClass,
  type TurnOutcome,
  type ReplyOutcome,
  type ClarifyOutcome,
  type PlanOutcome,
  type ExecuteOutcome,
  TranscriptMessageSchema,
  ChatSessionSchema,
} from '../../../src/chat/types.js';

describe('ModelTier', () => {
  it('has exactly 3 values', () => {
    expect(Object.values(ModelTier)).toHaveLength(3);
    expect(ModelTier.Cheap).toBe('cheap');
    expect(ModelTier.PremiumReasoning).toBe('premium_reasoning');
    expect(ModelTier.PremiumExecution).toBe('premium_execution');
  });
});

describe('IntentClass', () => {
  it('has exactly 5 values', () => {
    expect(Object.values(IntentClass)).toHaveLength(5);
  });
});

describe('TurnOutcome discriminated union', () => {
  it('narrows to ReplyOutcome on kind=reply', () => {
    const outcome: TurnOutcome = { kind: 'reply', content: 'Hello!', modelTier: ModelTier.Cheap };
    if (outcome.kind === 'reply') {
      const reply: ReplyOutcome = outcome;
      expect(reply.content).toBe('Hello!');
    }
  });

  it('narrows to ClarifyOutcome on kind=clarify', () => {
    const outcome: TurnOutcome = { kind: 'clarify', question: 'Which file?', options: ['a.ts', 'b.ts'] };
    if (outcome.kind === 'clarify') {
      const clarify: ClarifyOutcome = outcome;
      expect(clarify.options).toHaveLength(2);
    }
  });

  it('narrows to PlanOutcome on kind=plan', () => {
    const outcome: TurnOutcome = { kind: 'plan', planSummary: 'Add auth', chunkCount: 3 };
    if (outcome.kind === 'plan') {
      const plan: PlanOutcome = outcome;
      expect(plan.chunkCount).toBe(3);
    }
  });

  it('narrows to ExecuteOutcome on kind=execute', () => {
    const outcome: TurnOutcome = { kind: 'execute', taskDescription: 'Fix bug', approvalRequired: true };
    if (outcome.kind === 'execute') {
      const exec: ExecuteOutcome = outcome;
      expect(exec.approvalRequired).toBe(true);
    }
  });
});

describe('TranscriptMessageSchema', () => {
  it('validates a well-formed message', () => {
    const msg = { role: 'user', content: 'Hello', timestamp: new Date().toISOString() };
    expect(TranscriptMessageSchema.parse(msg)).toEqual(msg);
  });

  it('accepts optional modelTier and tokens', () => {
    const msg = { role: 'assistant', content: 'Hi', timestamp: new Date().toISOString(), modelTier: 'cheap', tokens: 10 };
    expect(() => TranscriptMessageSchema.parse(msg)).not.toThrow();
  });

  it('rejects invalid role', () => {
    expect(() => TranscriptMessageSchema.parse({ role: 'bot', content: '', timestamp: '' })).toThrow();
  });
});

describe('ChatSessionSchema', () => {
  it('validates a minimal session', () => {
    const session = {
      id: 'sess-1',
      projectId: 'proj-1',
      transcript: [],
      state: 'active',
      tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(() => ChatSessionSchema.parse(session)).not.toThrow();
  });

  it('rejects negative cost', () => {
    const session = {
      id: 'sess-1', projectId: 'proj-1', transcript: [], state: 'active',
      tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: -1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    expect(() => ChatSessionSchema.parse(session)).toThrow();
  });
});
