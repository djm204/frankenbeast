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
  checkpoint(state: ExecutionState): { id: string };
  lastCheckpoint(): ExecutionState | null;
  listCheckpoints(): Array<{ id: string; timestamp: string }>;
  clearCheckpoints(): void;
}

// --- Data Types ---

export type EpisodicEventType = 'success' | 'failure' | 'decision' | 'observation';

export interface EpisodicEvent {
  id?: number;
  type: EpisodicEventType;
  step?: string;
  summary: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface ExecutionState {
  runId: string;
  phase: string;
  step: number;
  context: Record<string, unknown>;
  timestamp: string;
}

// --- BrainSnapshot (cross-provider handoff) ---

export interface BrainSnapshot {
  version: 1;
  timestamp: string;
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
  step: z.number().int().nonnegative(),
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
    totalTokensUsed: z.number().nonnegative(),
  }),
});
