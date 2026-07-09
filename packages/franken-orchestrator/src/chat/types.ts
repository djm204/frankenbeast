import {
  ChatBeastContextSchema,
  ChatSessionResponseSchema,
  TokenTotalsSchema,
  TranscriptMessageSchema,
} from '@franken/types';
import type {
  ChatBeastContext,
  ChatSessionResponse,
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

export const ChatSessionSchema = ChatSessionResponseSchema;
export type ChatSession = ChatSessionResponse;
