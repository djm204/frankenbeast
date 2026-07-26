import { z } from 'zod';

const TimestampSchema = z.string().datetime({ offset: true });
const SafeMetadataValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const RuntimeMetadataSchema = z.record(z.string(), SafeMetadataValueSchema);

export const RuntimeCapabilitySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('supported') }).strict(),
  z.object({ status: z.literal('unsupported'), reason: z.string().min(1) }).strict(),
]);

export const RuntimeCapabilitiesSchema = z.object({
  snapshot: RuntimeCapabilitySchema,
  streaming: RuntimeCapabilitySchema,
  logs: RuntimeCapabilitySchema,
  blockers: RuntimeCapabilitySchema,
  approvals: RuntimeCapabilitySchema,
  pause: RuntimeCapabilitySchema,
  resume: RuntimeCapabilitySchema,
  cancellation: RuntimeCapabilitySchema,
  policyActions: RuntimeCapabilitySchema,
}).strict();

export const RuntimeHealthSchema = z.object({
  state: z.enum(['loading', 'connected', 'degraded', 'unavailable', 'schema-incompatible']),
  checkedAt: TimestampSchema,
  message: z.string().min(1).optional(),
}).strict();

export const RuntimeProviderSchema = z.object({
  id: z.string().min(1),
  runtime: z.string().min(1),
  displayName: z.string().min(1),
  health: RuntimeHealthSchema,
  capabilities: RuntimeCapabilitiesSchema,
  metadata: RuntimeMetadataSchema.optional(),
}).strict();

export const RuntimeWorkspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['workspace', 'board', 'project']),
  state: z.enum(['available', 'degraded', 'unavailable', 'schema-incompatible']),
  metadata: RuntimeMetadataSchema.optional(),
}).strict();

export const RuntimeAgentSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  displayName: z.string().min(1),
  state: z.enum(['idle', 'running', 'blocked', 'offline', 'unknown']),
  lastActiveAt: TimestampSchema.nullable(),
  metadata: RuntimeMetadataSchema.optional(),
}).strict();

export const RuntimeTaskSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  title: z.string(),
  state: z.enum(['queued', 'ready', 'running', 'blocked', 'succeeded', 'failed', 'cancelled', 'archived', 'unknown']),
  parentIds: z.array(z.string().min(1)),
  dependencyIds: z.array(z.string().min(1)),
  ownerIds: z.array(z.string().min(1)),
  priority: z.number().int().nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema.nullable(),
  metadata: RuntimeMetadataSchema.optional(),
}).strict();

export const RuntimeRunSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  taskId: z.string().min(1),
  agentId: z.string().min(1).nullable(),
  sessionId: z.string().min(1).nullable(),
  state: z.enum(['queued', 'running', 'blocked', 'succeeded', 'failed', 'cancelled', 'unknown']),
  startedAt: TimestampSchema,
  finishedAt: TimestampSchema.nullable(),
  lastActiveAt: TimestampSchema.nullable(),
  summary: z.string().nullable(),
  metadata: RuntimeMetadataSchema.optional(),
}).strict();

export const RuntimeEventSchema = z.object({
  id: z.string().min(1),
  cursor: z.string().min(1),
  workspaceId: z.string().min(1),
  taskId: z.string().min(1).nullable(),
  runId: z.string().min(1).nullable(),
  type: z.enum(['lifecycle', 'comment', 'log', 'audit', 'blocker', 'approval', 'unknown']),
  occurredAt: TimestampSchema,
  summary: z.string(),
  metadata: RuntimeMetadataSchema.optional(),
}).strict();

export const RuntimeBlockerSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  taskId: z.string().min(1),
  category: z.enum(['dependency', 'needs-input', 'capability', 'transient', 'unknown']),
  summary: z.string(),
  createdAt: TimestampSchema,
  metadata: RuntimeMetadataSchema.optional(),
}).strict();

export const RuntimeApprovalSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  taskId: z.string().min(1).nullable(),
  state: z.enum(['pending', 'approved', 'rejected', 'expired', 'unknown']),
  summary: z.string(),
  createdAt: TimestampSchema,
  resolvedAt: TimestampSchema.nullable(),
  metadata: RuntimeMetadataSchema.optional(),
}).strict();

function sectionSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion('status', [
    z.object({ status: z.literal('available'), data }).strict(),
    z.object({ status: z.literal('unsupported'), reason: z.string().min(1) }).strict(),
  ]);
}

export const RuntimeSnapshotSchema = z.object({
  providerId: z.string().min(1),
  state: z.enum(['loading', 'ready', 'empty', 'degraded', 'unavailable', 'schema-incompatible']),
  capturedAt: TimestampSchema,
  message: z.string().min(1).optional(),
  workspaces: sectionSchema(z.array(RuntimeWorkspaceSchema)),
  agents: sectionSchema(z.array(RuntimeAgentSchema)),
  tasks: sectionSchema(z.array(RuntimeTaskSchema)),
  runs: sectionSchema(z.array(RuntimeRunSchema)),
  events: sectionSchema(z.array(RuntimeEventSchema)),
  blockers: sectionSchema(z.array(RuntimeBlockerSchema)),
  approvals: sectionSchema(z.array(RuntimeApprovalSchema)),
}).strict();

export const RuntimeEventPageSchema = z.object({
  events: z.array(RuntimeEventSchema),
  nextCursor: z.string().min(1).nullable(),
}).strict();

export type RuntimeProvider = z.infer<typeof RuntimeProviderSchema>;
export type RuntimeSnapshot = z.infer<typeof RuntimeSnapshotSchema>;
export type RuntimeEvent = z.infer<typeof RuntimeEventSchema>;
export type RuntimeEventPage = z.infer<typeof RuntimeEventPageSchema>;
export type RuntimeWorkspace = z.infer<typeof RuntimeWorkspaceSchema>;
export type RuntimeAgent = z.infer<typeof RuntimeAgentSchema>;
export type RuntimeTask = z.infer<typeof RuntimeTaskSchema>;
export type RuntimeRun = z.infer<typeof RuntimeRunSchema>;
export type RuntimeBlocker = z.infer<typeof RuntimeBlockerSchema>;
