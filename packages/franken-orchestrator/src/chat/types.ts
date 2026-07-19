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
// Keep local aliases structural instead of using Extract<TurnOutcome, ...>.
// The generated zod declaration type can collapse Extract<> aliases to never
// under this package's compiler settings even though the runtime schema remains
// correctly discriminated.

export type ReplyOutcome = { kind: 'reply'; content: string; modelTier: string };
export type ClarifyOutcome = { kind: 'clarify'; question: string; options: string[] };
export type PlanOutcome = { kind: 'plan'; planSummary: string; chunkCount: number };
export type ExecuteOutcome = { kind: 'execute'; taskDescription: string; approvalRequired: boolean };
export type TurnOutcome = ReplyOutcome | ClarifyOutcome | PlanOutcome | ExecuteOutcome;
export type { ChatBeastContext, TranscriptMessage };

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
