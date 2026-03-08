import { z } from 'zod';
// ---------------------------------------------------------------------------
// MemoryStatus
// ---------------------------------------------------------------------------
export const MemoryStatusSchema = z.enum(['success', 'failure', 'pending', 'compressed']);
export function parseMemoryStatus(value) {
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
// ---------------------------------------------------------------------------
// SemanticChunk
// ---------------------------------------------------------------------------
export const SemanticChunkSchema = MemoryMetadataSchema.extend({
    type: z.literal('semantic'),
    source: z.string().min(1),
    content: z.string().min(1),
    embedding: z.array(z.number()).optional(),
});
// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------
export const MemoryEntrySchema = z.discriminatedUnion('type', [
    WorkingTurnSchema,
    EpisodicTraceSchema,
    SemanticChunkSchema,
]);
export function parseMemoryEntry(value) {
    return MemoryEntrySchema.parse(value);
}
//# sourceMappingURL=memory.js.map