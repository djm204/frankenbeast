# Chunk 2.1: Brain Interfaces + Types

**Phase:** 2 — Rewrite franken-brain
**Depends on:** Phase 1 (clean monorepo)
**Estimated size:** Small (~100 lines of types + Zod schemas)

---

## Purpose

Define the brain interfaces and `BrainSnapshot` type in `franken-types` so that both `franken-brain` (implementation) and `franken-orchestrator` (consumer) can depend on the contract without depending on each other.

## Interfaces

Add to `packages/franken-types/src/brain.ts` (new file or modify existing):

```typescript
import { z } from 'zod';

// --- Core Interfaces ---

export interface IBrain {
  readonly working: IWorkingMemory;
  readonly episodic: IEpisodicMemory;
  readonly recovery: IRecoveryMemory;
  serialize(): BrainSnapshot;
}

export interface IWorkingMemory {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(key: string): boolean;
  has(key: string): boolean;
  keys(): string[];
  snapshot(): Record<string, unknown>;
  restore(snapshot: Record<string, unknown>): void;
  clear(): void;
}

export interface IEpisodicMemory {
  record(event: EpisodicEvent): void;
  recall(query: string, limit?: number): EpisodicEvent[];
  recentFailures(n?: number): EpisodicEvent[];
  recent(n?: number): EpisodicEvent[];
  count(): number;
}

export interface IRecoveryMemory {
  checkpoint(state: ExecutionState): { id: string };  // returns checkpoint ID
  lastCheckpoint(): ExecutionState | null;
  listCheckpoints(): Array<{ id: string; timestamp: string }>;
  clearCheckpoints(): void;
}

// --- Data Types ---

export type EpisodicEventType = 'success' | 'failure' | 'decision' | 'observation';

export interface EpisodicEvent {
  id?: number;                  // assigned by SQLite on insert
  type: EpisodicEventType;
  step?: string;                // which execution step
  summary: string;              // human-readable description
  details?: Record<string, unknown>;  // structured data
  createdAt: string;            // ISO 8601
}

export interface ExecutionState {
  runId: string;
  phase: string;
  step: number;
  context: Record<string, unknown>;
  timestamp: string;            // ISO 8601
}

// --- BrainSnapshot (cross-provider handoff) ---

export interface BrainSnapshot {
  version: 1;
  timestamp: string;            // ISO 8601
  working: Record<string, unknown>;
  episodic: EpisodicEvent[];
  checkpoint: ExecutionState | null;
  metadata: {
    lastProvider: string;
    switchReason: string;
    totalTokensUsed: number;
  };
}

// --- Zod Schemas ---

export const EpisodicEventSchema = z.object({
  id: z.number().optional(),
  type: z.enum(['success', 'failure', 'decision', 'observation']),
  step: z.string().optional(),
  summary: z.string().min(1),
  details: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime(),
});

export const ExecutionStateSchema = z.object({
  runId: z.string().min(1),
  phase: z.string().min(1),
  step: z.number().int().nonneg(),
  context: z.record(z.unknown()),
  timestamp: z.string().datetime(),
});

export const BrainSnapshotSchema = z.object({
  version: z.literal(1),
  timestamp: z.string().datetime(),
  working: z.record(z.unknown()),
  episodic: z.array(EpisodicEventSchema),
  checkpoint: ExecutionStateSchema.nullable(),
  metadata: z.object({
    lastProvider: z.string(),
    switchReason: z.string(),
    totalTokensUsed: z.number().nonneg(),
  }),
});
```

## What to Do

### 1. Create or update `packages/franken-types/src/brain.ts`

If the file already exists (from the current brain), replace its contents with the interfaces above. If not, create it.

### 2. Export from package index

Ensure `packages/franken-types/src/index.ts` re-exports everything from `brain.ts`:
```typescript
export * from './brain.js';
```

### 3. Write type-level tests

```typescript
// packages/franken-types/tests/brain.test.ts
import { BrainSnapshotSchema, type BrainSnapshot, type IBrain } from '@frankenbeast/types';

describe('BrainSnapshot schema', () => {
  it('validates a well-formed snapshot', () => {
    const snapshot: BrainSnapshot = {
      version: 1,
      timestamp: new Date().toISOString(),
      working: { currentTask: 'fix auth bug', progress: 0.5 },
      episodic: [{
        type: 'failure',
        step: 'build',
        summary: 'TypeScript compilation failed due to missing import',
        createdAt: new Date().toISOString(),
      }],
      checkpoint: null,
      metadata: {
        lastProvider: 'claude-cli',
        switchReason: 'rate-limit',
        totalTokensUsed: 15000,
      },
    };
    expect(BrainSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it('rejects snapshot with wrong version', () => {
    expect(() => BrainSnapshotSchema.parse({ version: 2 })).toThrow();
  });

  it('rejects snapshot with missing metadata', () => {
    expect(() => BrainSnapshotSchema.parse({
      version: 1,
      timestamp: new Date().toISOString(),
      working: {},
      episodic: [],
      checkpoint: null,
      // missing metadata
    })).toThrow();
  });
});
```

## Files

- **Add/Modify:** `packages/franken-types/src/brain.ts`
- **Modify:** `packages/franken-types/src/index.ts` — re-export brain types
- **Add:** `packages/franken-types/tests/brain.test.ts`

## Exit Criteria

- `IBrain`, `IWorkingMemory`, `IEpisodicMemory`, `IRecoveryMemory` interfaces are exported from `@frankenbeast/types`
- `BrainSnapshot`, `EpisodicEvent`, `ExecutionState` types are exported
- `BrainSnapshotSchema`, `EpisodicEventSchema`, `ExecutionStateSchema` Zod schemas are exported
- Type-level tests pass
- `npm run build && npm run typecheck` succeeds for `franken-types`
