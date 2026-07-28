import { z } from 'zod';

const TimestampSchema = z.string().datetime({ offset: true });
const SafeMetadataValueSchema = z.union([z.string().max(4_096), z.number(), z.boolean(), z.null()]);
export const RuntimeMetadataSchema = z
  .record(z.string().min(1).max(256), SafeMetadataValueSchema)
  .superRefine((metadata, context) => {
    if (Object.keys(metadata).length > 64) {
      context.addIssue({ code: 'custom', message: 'Runtime metadata must contain at most 64 entries' });
    }
    if (JSON.stringify(metadata).length > 16_384) {
      context.addIssue({ code: 'custom', message: 'Runtime metadata exceeds the serialized size limit' });
    }
  });

const CorrelationIdSchema = z.string().uuid();
const IdempotencyKeySchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/u);
const RuntimeWorkspaceIdSchema = z.string().min(1);
const RuntimeTaskIdSchema = z.string().min(1);
const RuntimeApprovalIdSchema = z.string().min(1);
const RuntimeEventIdSchema = z.string().min(1).max(1_024);
const RuntimeEventCursorSchema = z.string().min(1).max(4_096);
const RuntimeActionWorkspaceIdSchema = RuntimeWorkspaceIdSchema;
const RuntimeActionTaskIdSchema = RuntimeTaskIdSchema;
const BoundedReasonSchema = z.string().trim().min(1).max(1000);
const RuntimeActionTypeSchema = z.enum([
  'approval.resolve',
  'blocker.add',
  'blocker.resolve',
  'task.pause',
  'task.resume',
  'task.cancel',
  'policy.apply',
]);

export const RuntimeActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('approval.resolve'),
    workspaceId: RuntimeActionWorkspaceIdSchema,
    approvalId: RuntimeApprovalIdSchema,
    decision: z.enum(['approve', 'reject']),
    reason: BoundedReasonSchema.optional(),
  }).strict(),
  z.object({
    type: z.literal('blocker.add'),
    workspaceId: RuntimeActionWorkspaceIdSchema,
    taskId: RuntimeActionTaskIdSchema,
    category: z.enum(['dependency', 'needs-input', 'capability', 'transient']),
    reason: BoundedReasonSchema,
  }).strict(),
  z.object({
    type: z.literal('blocker.resolve'),
    workspaceId: RuntimeActionWorkspaceIdSchema,
    taskId: RuntimeActionTaskIdSchema,
    reason: BoundedReasonSchema.optional(),
  }).strict(),
  z.object({
    type: z.enum(['task.pause', 'task.resume', 'task.cancel']),
    workspaceId: RuntimeActionWorkspaceIdSchema,
    taskId: RuntimeActionTaskIdSchema,
    reason: BoundedReasonSchema.optional(),
  }).strict(),
  z.object({
    type: z.literal('policy.apply'),
    workspaceId: RuntimeActionWorkspaceIdSchema,
    taskId: RuntimeActionTaskIdSchema,
    policy: z.literal('promote-task'),
    reason: BoundedReasonSchema,
  }).strict(),
]);

export const RuntimeActionRequestSchema = z.object({
  correlationId: CorrelationIdSchema,
  causationId: CorrelationIdSchema.optional(),
  idempotencyKey: IdempotencyKeySchema,
  action: RuntimeActionSchema,
}).strict();

export const RuntimeActionAuditSchema = z.object({
  requestedBy: z.literal('authenticated-operator'),
  actionType: RuntimeActionTypeSchema,
  targetId: z.string().min(1),
  outcome: z.enum(['applied', 'unsupported', 'rejected', 'failed']),
  previousState: z.string().max(100).optional(),
  currentState: z.string().max(100).optional(),
}).strict();

export const RuntimeActionResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('applied'),
    providerId: z.string().min(1),
    correlationId: CorrelationIdSchema,
    replayed: z.boolean().optional(),
    audit: RuntimeActionAuditSchema,
  }).strict(),
  z.object({
    status: z.literal('unsupported'),
    providerId: z.string().min(1),
    correlationId: CorrelationIdSchema,
    reason: z.string().min(1).max(1000),
    audit: RuntimeActionAuditSchema,
  }).strict(),
  z.object({
    status: z.literal('rejected'),
    providerId: z.string().min(1),
    correlationId: CorrelationIdSchema,
    reason: z.string().min(1).max(1000),
    audit: RuntimeActionAuditSchema,
  }).strict(),
  z.object({
    status: z.literal('failed'),
    providerId: z.string().min(1),
    correlationId: CorrelationIdSchema,
    reason: z.string().min(1).max(500),
    audit: RuntimeActionAuditSchema,
  }).strict(),
]);

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
  id: z.string().min(1).regex(/^(?!\.{1,2}$)[A-Za-z0-9._~-]+$/u, 'Provider id must be a route-safe path segment'),
  runtime: z.string().min(1),
  displayName: z.string().min(1),
  health: RuntimeHealthSchema,
  capabilities: RuntimeCapabilitiesSchema,
  metadata: RuntimeMetadataSchema.optional(),
}).strict();

export const RuntimeWorkspaceSchema = z.object({
  id: RuntimeWorkspaceIdSchema,
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
  id: RuntimeTaskIdSchema,
  workspaceId: RuntimeWorkspaceIdSchema,
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
  id: RuntimeEventIdSchema,
  cursor: RuntimeEventCursorSchema,
  workspaceId: RuntimeEventIdSchema,
  taskId: RuntimeEventIdSchema.nullable(),
  runId: RuntimeEventIdSchema.nullable(),
  type: z.enum(['lifecycle', 'comment', 'log', 'audit', 'blocker', 'approval', 'unknown']),
  occurredAt: TimestampSchema,
  summary: z.string().max(16_384),
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
  id: RuntimeApprovalIdSchema,
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
export type RuntimeAction = z.infer<typeof RuntimeActionSchema>;
export type RuntimeActionRequest = z.infer<typeof RuntimeActionRequestSchema>;
export type RuntimeActionResult = z.infer<typeof RuntimeActionResultSchema>;
export type RuntimeActionAudit = z.infer<typeof RuntimeActionAuditSchema>;
export type RuntimeSnapshot = z.infer<typeof RuntimeSnapshotSchema>;
export type RuntimeEvent = z.infer<typeof RuntimeEventSchema>;
export type RuntimeEventPage = z.infer<typeof RuntimeEventPageSchema>;
export type RuntimeWorkspace = z.infer<typeof RuntimeWorkspaceSchema>;
export type RuntimeAgent = z.infer<typeof RuntimeAgentSchema>;
export type RuntimeTask = z.infer<typeof RuntimeTaskSchema>;
export type RuntimeRun = z.infer<typeof RuntimeRunSchema>;
export type RuntimeBlocker = z.infer<typeof RuntimeBlockerSchema>;
export type RuntimeApproval = z.infer<typeof RuntimeApprovalSchema>;
