import { describe, it, expect } from 'vitest';
import {
  BrainSnapshotSchema,
  EpisodicEventSchema,
  ExecutionStateSchema,
  type BrainSnapshot,
  type EpisodicEvent,
  type ExecutionState,
  type EpisodicEventType,
  type IBrain,
  type IWorkingMemory,
  type IEpisodicMemory,
  type IRecoveryMemory,
} from '../src/index.js';

describe('BrainSnapshot schema', () => {
  const validSnapshot: BrainSnapshot = {
    version: 1,
    timestamp: new Date().toISOString(),
    working: { currentTask: 'fix auth bug', progress: 0.5 },
    episodic: [
      {
        type: 'failure',
        step: 'build',
        summary: 'TypeScript compilation failed due to missing import',
        createdAt: new Date().toISOString(),
      },
    ],
    checkpoint: null,
    metadata: {
      lastProvider: 'claude-cli',
      switchReason: 'rate-limit',
      totalTokensUsed: 15000,
    },
  };

  it('validates a well-formed snapshot', () => {
    expect(BrainSnapshotSchema.parse(validSnapshot)).toEqual(validSnapshot);
  });

  it('rejects snapshot with wrong version', () => {
    expect(() => BrainSnapshotSchema.parse({ version: 2 })).toThrow();
  });

  it('rejects snapshot with missing metadata', () => {
    expect(() =>
      BrainSnapshotSchema.parse({
        version: 1,
        timestamp: new Date().toISOString(),
        working: {},
        episodic: [],
        checkpoint: null,
      }),
    ).toThrow();
  });

  it('accepts snapshot with full checkpoint', () => {
    const withCheckpoint: BrainSnapshot = {
      ...validSnapshot,
      checkpoint: {
        runId: 'run-123',
        phase: 'execution',
        step: 3,
        context: { files: ['auth.ts'] },
        timestamp: new Date().toISOString(),
      },
    };
    expect(BrainSnapshotSchema.parse(withCheckpoint)).toEqual(withCheckpoint);
  });

  it('rejects negative totalTokensUsed', () => {
    const bad = {
      ...validSnapshot,
      metadata: { ...validSnapshot.metadata, totalTokensUsed: -1 },
    };
    expect(() => BrainSnapshotSchema.parse(bad)).toThrow();
  });
});

describe('EpisodicEvent schema', () => {
  it('validates a minimal event', () => {
    const event: EpisodicEvent = {
      type: 'success',
      summary: 'Tests passed',
      createdAt: new Date().toISOString(),
    };
    expect(EpisodicEventSchema.parse(event)).toEqual(event);
  });

  it('validates event with all optional fields', () => {
    const event: EpisodicEvent = {
      id: 42,
      type: 'failure',
      step: 'build',
      summary: 'Build failed',
      details: { file: 'auth.ts', line: 10 },
      createdAt: new Date().toISOString(),
    };
    expect(EpisodicEventSchema.parse(event)).toEqual(event);
  });

  it('rejects empty summary', () => {
    expect(() =>
      EpisodicEventSchema.parse({
        type: 'success',
        summary: '',
        createdAt: new Date().toISOString(),
      }),
    ).toThrow();
  });

  it('rejects invalid event type', () => {
    expect(() =>
      EpisodicEventSchema.parse({
        type: 'unknown',
        summary: 'something',
        createdAt: new Date().toISOString(),
      }),
    ).toThrow();
  });

  it('validates all four event types', () => {
    const types: EpisodicEventType[] = ['success', 'failure', 'decision', 'observation'];
    for (const type of types) {
      expect(() =>
        EpisodicEventSchema.parse({
          type,
          summary: `Event of type ${type}`,
          createdAt: new Date().toISOString(),
        }),
      ).not.toThrow();
    }
  });
});

describe('ExecutionState schema', () => {
  it('validates a well-formed state', () => {
    const state: ExecutionState = {
      runId: 'run-1',
      phase: 'execution',
      step: 3,
      context: { files: ['auth.ts'] },
      timestamp: new Date().toISOString(),
    };
    expect(ExecutionStateSchema.parse(state)).toEqual(state);
  });

  it('rejects empty runId', () => {
    expect(() =>
      ExecutionStateSchema.parse({
        runId: '',
        phase: 'execution',
        step: 0,
        context: {},
        timestamp: new Date().toISOString(),
      }),
    ).toThrow();
  });

  it('rejects negative step', () => {
    expect(() =>
      ExecutionStateSchema.parse({
        runId: 'run-1',
        phase: 'execution',
        step: -1,
        context: {},
        timestamp: new Date().toISOString(),
      }),
    ).toThrow();
  });

  it('rejects non-integer step', () => {
    expect(() =>
      ExecutionStateSchema.parse({
        runId: 'run-1',
        phase: 'execution',
        step: 1.5,
        context: {},
        timestamp: new Date().toISOString(),
      }),
    ).toThrow();
  });
});

describe('Brain interfaces (type-level)', () => {
  it('IBrain has required shape', () => {
    const brain: IBrain = {
      working: {} as IWorkingMemory,
      episodic: {} as IEpisodicMemory,
      recovery: {} as IRecoveryMemory,
      serialize: () => ({}) as BrainSnapshot,
    };
    expect(brain).toBeDefined();
  });

  it('IWorkingMemory has required methods', () => {
    const wm: IWorkingMemory = {
      get: (_key: string) => undefined as unknown,
      set: (_key: string, _value: unknown) => {},
      delete: (_key: string) => true,
      has: (_key: string) => true,
      keys: () => [],
      snapshot: () => ({}),
      restore: (_snapshot: Record<string, unknown>) => {},
      clear: () => {},
    };
    expect(wm).toBeDefined();
  });

  it('IEpisodicMemory has required methods', () => {
    const em: IEpisodicMemory = {
      record: (_event: EpisodicEvent) => {},
      recall: (_query: string, _limit?: number) => [],
      recentFailures: (_n?: number) => [],
      recent: (_n?: number) => [],
      count: () => 0,
    };
    expect(em).toBeDefined();
  });

  it('IRecoveryMemory has required methods', () => {
    const rm: IRecoveryMemory = {
      checkpoint: (_state: ExecutionState) => ({ id: 'cp-1' }),
      lastCheckpoint: () => null,
      listCheckpoints: () => [],
      clearCheckpoints: () => {},
    };
    expect(rm).toBeDefined();
  });
});
