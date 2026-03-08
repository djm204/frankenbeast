import { z } from 'zod';

// ---------------------------------------------------------------------------
// MemoryStatus
// ---------------------------------------------------------------------------

export const MemoryStatusSchema = z.enum(['success', 'failure', 'pending', 'compressed']);
export type MemoryStatus = z.infer<typeof MemoryStatusSchema>;

export function parseMemoryStatus(value: unknown): MemoryStatus {
  return MemoryStatusSchema.parse(value);
}

// ---------------------------------------------------------------------------
// Shared metadata base
// ---------------------------------------------------------------------------

const MemoryMetadataSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  status: MemoryStatusSchema,
  createdAt: z.number().int(),
  tags: z.array(z.string()).optional(),
});

export type MemoryMetadata = z.infer<typeof MemoryMetadataSchema>;

// ---------------------------------------------------------------------------
// WorkingTurn
// ---------------------------------------------------------------------------

export const WorkingTurnSchema = MemoryMetadataSchema.extend({
  type: z.literal('working'),
  role: z.enum(['user', 'assistant', 'tool']),
  content: z.string(),
  tokenCount: z.number().int().nonnegative(),
  pinned: z.boolean().optional(),
});

export type WorkingTurn = z.infer<typeof WorkingTurnSchema>;

// ---------------------------------------------------------------------------
// EpisodicTrace
// ---------------------------------------------------------------------------

export const EpisodicTraceSchema = MemoryMetadataSchema.extend({
  type: z.literal('episodic'),
  taskId: z.string().min(1),
  toolName: z.string().optional(),
  input: z.unknown(),
  output: z.unknown(),
});

export type EpisodicTrace = z.infer<typeof EpisodicTraceSchema>;

// ---------------------------------------------------------------------------
// SemanticChunk
// ---------------------------------------------------------------------------

export const SemanticChunkSchema = MemoryMetadataSchema.extend({
  type: z.literal('semantic'),
  source: z.string().min(1),
  content: z.string().min(1),
  embedding: z.array(z.number()).optional(),
});

export type SemanticChunk = z.infer<typeof SemanticChunkSchema>;

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export const MemoryEntrySchema = z.discriminatedUnion('type', [
  WorkingTurnSchema,
  EpisodicTraceSchema,
  SemanticChunkSchema,
]);

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

export function parseMemoryEntry(value: unknown): MemoryEntry {
  return MemoryEntrySchema.parse(value);
}
