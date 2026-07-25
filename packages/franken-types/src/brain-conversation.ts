import { z } from 'zod';

import {
  ChatBeastContextSchema,
  PendingApprovalSchema,
  ProviderContextSchema,
  TokenTotalsSchema,
  TranscriptMessageSchema,
} from './api-contracts.js';

export const CURRENT_BRAIN_CONVERSATION_SCHEMA_VERSION = 1 as const;

export const BrainConversationSupervisedAgentSchema = z.object({
  agentId: z.string().min(1),
  agentTypeId: z.string().min(1),
  runId: z.string().min(1).optional(),
  status: z.string().min(1),
  lastObservedAt: z.string().min(1),
});

export const BrainConversationPendingApprovalSchema = PendingApprovalSchema.extend({
  approvalToken: z.string().optional(),
  requester: z.string().optional(),
  workerId: z.string().optional(),
  workdir: z.string().optional(),
});

export const BrainConversationSchema = z.object({
  schemaVersion: z.literal(CURRENT_BRAIN_CONVERSATION_SCHEMA_VERSION),
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  subjectId: z.string().min(1),
  brainKey: z.string().min(1),
  facultyId: z.string().min(1).nullable(),
  transcript: z.array(TranscriptMessageSchema),
  state: z.string().min(1),
  pendingApproval: BrainConversationPendingApprovalSchema.nullable(),
  beastContext: ChatBeastContextSchema.nullable(),
  supervisedAgents: z.array(BrainConversationSupervisedAgentSchema),
  crossAgentSummary: z.string().nullable(),
  providerContext: ProviderContextSchema.nullable(),
  routingMetadata: z.record(z.string(), z.unknown()),
  tokenTotals: TokenTotalsSchema,
  costUsd: z.number().nonnegative(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).superRefine((conversation, context) => {
  if (conversation.brainKey !== `workspace-hive:${conversation.workspaceId}`) {
    context.addIssue({
      code: 'custom',
      path: ['brainKey'],
      message: 'brainKey must match the canonical workspace-hive namespace',
    });
  }
});

export type BrainConversationSupervisedAgent = z.infer<typeof BrainConversationSupervisedAgentSchema>;
export type BrainConversationPendingApproval = z.infer<typeof BrainConversationPendingApprovalSchema>;
export type BrainConversation = z.infer<typeof BrainConversationSchema>;
