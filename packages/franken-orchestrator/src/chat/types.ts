import { z } from 'zod';

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

export interface ReplyOutcome {
  kind: 'reply';
  content: string;
  modelTier: string;
}

export interface ClarifyOutcome {
  kind: 'clarify';
  question: string;
  options: string[];
}

export interface PlanOutcome {
  kind: 'plan';
  planSummary: string;
  chunkCount: number;
}

export interface ExecuteOutcome {
  kind: 'execute';
  taskDescription: string;
  approvalRequired: boolean;
}

export type TurnOutcome = ReplyOutcome | ClarifyOutcome | PlanOutcome | ExecuteOutcome;

// --- Zod schemas ---

export const TranscriptMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  timestamp: z.string(),
  modelTier: z.string().optional(),
  tokens: z.number().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
});
export type TranscriptMessage = z.infer<typeof TranscriptMessageSchema>;

export const TokenTotalsSchema = z.object({
  cheap: z.number().nonnegative(),
  premiumReasoning: z.number().nonnegative(),
  premiumExecution: z.number().nonnegative(),
});

export const ChatSessionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  transcript: z.array(TranscriptMessageSchema),
  state: z.string(),
  pendingApproval: z.object({
    description: z.string(),
    requestedAt: z.string(),
  }).nullable().optional(),
  tokenTotals: TokenTotalsSchema,
  costUsd: z.number().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ChatSession = z.infer<typeof ChatSessionSchema>;
