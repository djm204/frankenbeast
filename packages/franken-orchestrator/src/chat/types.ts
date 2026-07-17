import {
  ChatBeastContextSchema,
  ChatSessionResponseSchema,
  PendingApprovalSchema,
  TokenTotalsSchema,
  TranscriptMessageSchema,
} from '@franken/types';
import type {
  ChatBeastContext,
  ChatSessionResponse,
  PendingApproval,
  TranscriptMessage,
  TurnOutcome,
} from '@franken/types';

// --- Const enums ---

export const ModelTier = {
  Cheap: 'cheap',
  PremiumReasoning: 'premium_reasoning',
  PremiumExecution: 'premium_execution',
} as const;
export type ModelTierValue = (typeof ModelTier)[keyof typeof ModelTier];

export const IntentClass = {
  ChatSimple: 'chat_simple',
  ChatTechnical: 'chat_technical',
  CodeRequest: 'code_request',
  RepoAction: 'repo_action',
  Ambiguous: 'ambiguous',
} as const;
export type IntentClassValue = (typeof IntentClass)[keyof typeof IntentClass];

// --- TurnOutcome discriminated union (kind discriminant) ---

export type ReplyOutcome = Extract<TurnOutcome, { kind: 'reply' }>;
export type ClarifyOutcome = Extract<TurnOutcome, { kind: 'clarify' }>;
export type PlanOutcome = Extract<TurnOutcome, { kind: 'plan' }>;
export type ExecuteOutcome = Extract<TurnOutcome, { kind: 'execute' }>;
export type { ChatBeastContext, TranscriptMessage, TurnOutcome };

// --- Zod schemas ---

export { ChatBeastContextSchema, TranscriptMessageSchema, TokenTotalsSchema };

export const ChatSessionSchema = ChatSessionResponseSchema.extend({
  pendingApproval: PendingApprovalSchema.extend({
    approvalToken: PendingApprovalSchema.shape.description.optional(),
    requester: PendingApprovalSchema.shape.description.optional(),
    workerId: PendingApprovalSchema.shape.description.optional(),
    workdir: PendingApprovalSchema.shape.description.optional(),
  }).nullable().optional(),
});
export type ExtendedPendingApproval = PendingApproval & {
  approvalToken?: string | undefined;
  requester?: string | undefined;
  workerId?: string | undefined;
  workdir?: string | undefined;
};

export type ChatSession = Omit<ChatSessionResponse, 'pendingApproval'> & {
  pendingApproval?: ExtendedPendingApproval | null | undefined;
};
