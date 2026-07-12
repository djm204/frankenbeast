import { z } from 'zod';

export interface ApiDataEnvelope<T> {
  data: T;
}

export interface ApiErrorEnvelope {
  error: { code: string; message: string; details?: unknown };
}

export const PendingApprovalSchema = z.object({
  description: z.string(),
  requestedAt: z.string(),
  tool: z.string().optional(),
  command: z.string().optional(),
  risk: z.string().optional(),
  affectedFiles: z.array(z.string()).optional(),
  sessionId: z.string().optional(),
});
export type PendingApproval = z.infer<typeof PendingApprovalSchema>;

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
export type TokenTotals = z.infer<typeof TokenTotalsSchema>;

export const ChatBeastContextSchema = z.object({
  agentId: z.string().min(1).optional(),
  definitionId: z.string().min(1),
  interviewSessionId: z.string().min(1),
  executionMode: z.enum(['process', 'container']).optional(),
  status: z.enum(['interviewing']),
});
export type ChatBeastContext = z.infer<typeof ChatBeastContextSchema>;

export const ChatSessionResponseSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  transcript: z.array(TranscriptMessageSchema),
  state: z.string(),
  pendingApproval: PendingApprovalSchema.nullable().optional(),
  beastContext: ChatBeastContextSchema.nullable().optional(),
  routingMetadata: z.record(z.unknown()).optional(),
  tokenTotals: TokenTotalsSchema,
  costUsd: z.number().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ChatSessionResponse = z.infer<typeof ChatSessionResponseSchema>;

export const ChatSocketTicketResponseSchema = z.object({
  ticket: z.string(),
});
export type ChatSocketTicketResponse = z.infer<typeof ChatSocketTicketResponseSchema>;

export const ChatSessionSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  state: z.string(),
  messageCount: z.number().int().nonnegative(),
  preview: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ChatSessionSummary = z.infer<typeof ChatSessionSummarySchema>;

export const TurnOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('reply'), content: z.string(), modelTier: z.string() }),
  z.object({ kind: z.literal('clarify'), question: z.string(), options: z.array(z.string()) }),
  z.object({ kind: z.literal('plan'), planSummary: z.string(), chunkCount: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('execute'), taskDescription: z.string(), approvalRequired: z.boolean() }),
]);
export type TurnOutcome = z.infer<typeof TurnOutcomeSchema>;

export const MessageResultSchema = z.object({
  outcome: TurnOutcomeSchema,
  tier: z.string(),
  state: z.string(),
});
export type MessageResult = z.infer<typeof MessageResultSchema>;

export const ApproveResultSchema = z.object({
  id: z.string(),
  approved: z.boolean(),
  state: z.string(),
  pendingApproval: PendingApprovalSchema.nullable(),
  outcome: TurnOutcomeSchema.optional(),
  tier: z.string().optional(),
  displayMessages: z.array(z.unknown()).optional(),
  events: z.array(z.unknown()).optional(),
});
export type ApproveResult = z.infer<typeof ApproveResultSchema>;

export interface BeastInterviewPrompt {
  key: string;
  prompt: string;
  kind: 'string' | 'boolean' | 'file' | 'directory';
  required?: boolean;
  options?: readonly string[];
}

export type BeastExecutionMode = 'process' | 'container';

export interface BeastContainerRuntimeStatus {
  available: boolean;
  reason?: string;
}

export interface BeastCatalogEntry {
  id: string;
  version?: number;
  label: string;
  description: string;
  executionModeDefault: BeastExecutionMode;
  containerRuntime?: BeastContainerRuntimeStatus;
  interviewPrompts: readonly BeastInterviewPrompt[];
}

export interface BeastRunSummary {
  id: string;
  trackedAgentId?: string;
  definitionId: string;
  definitionVersion?: number;
  status: string;
  executionMode: BeastExecutionMode;
  configSnapshot?: Readonly<Record<string, unknown>>;
  dispatchedBy: string;
  dispatchedByUser: string;
  attemptCount: number;
  currentAttemptId?: string;
  stopReason?: string;
  latestExitCode?: number;
  containerId?: unknown;
  containerName?: unknown;
  containerRuntime?: unknown;
  image?: unknown;
  containerImage?: unknown;
  containerNetwork?: unknown;
  resourceSnapshot?: unknown;
  resources?: unknown;
  workspaceHostPath?: unknown;
  workspaceContainerPath?: unknown;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  lastHeartbeatAt?: string;
}

export interface BeastRunEvent {
  id: string;
  runId: string;
  attemptId?: string;
  sequence: number;
  type: string;
  payload: Readonly<Record<string, unknown>>;
  createdAt: string;
}

export interface BeastRunAttempt {
  id: string;
  runId: string;
  attemptNumber: number;
  status: string;
  pid?: number;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  stopReason?: string;
  executorMetadata?: Readonly<Record<string, unknown>>;
}

export interface BeastRunDetail {
  run: BeastRunSummary;
  attempts: BeastRunAttempt[];
  events: BeastRunEvent[];
  logs: string[];
}

export interface BeastSseSnapshot {
  agents?: Array<Partial<TrackedAgentSummary> & { id: string }>;
}

export const TRACKED_AGENT_STATUSES = [
  'initializing',
  'awaiting_approval',
  'dispatching',
  'running',
  'completed',
  'failed',
  'stopped',
  'deleted',
] as const;

export type TrackedAgentStatus = (typeof TRACKED_AGENT_STATUSES)[number];

export interface BeastSseAgentStatusEvent {
  agentId: string;
  status: string;
  updatedAt?: string;
}

export interface BeastSseAgentEvent {
  agentId: string;
  event: Omit<TrackedAgentEvent, 'id' | 'agentId' | 'sequence'> & Partial<TrackedAgentEvent>;
}

export interface BeastSseRunStatusEvent {
  runId: string;
  status: string;
  updatedAt?: string;
}

export interface BeastSseRunLogEvent {
  eventId?: string;
  runId: string;
  attemptId?: string;
  stream?: 'stdout' | 'stderr';
  line: string;
  createdAt?: string;
}

export interface BeastSseRunEvent {
  runId: string;
  event: Record<string, unknown>;
}

export interface BeastEventHandlers {
  snapshot?: (snapshot: BeastSseSnapshot) => void;
  agentStatus?: (event: BeastSseAgentStatusEvent) => void;
  agentEvent?: (event: BeastSseAgentEvent) => void;
  runStatus?: (event: BeastSseRunStatusEvent) => void;
  runLog?: (event: BeastSseRunLogEvent) => void;
  runEvent?: (event: BeastSseRunEvent) => void;
  error?: (error: Error) => void;
}

export interface TrackedAgentInitAction {
  kind: 'design-interview' | 'chunk-plan' | 'martin-loop';
  command: string;
  config: Readonly<Record<string, unknown>>;
  chatSessionId?: string;
}

export interface ModuleConfig {
  firewall?: boolean;
  skills?: boolean;
  memory?: boolean;
  planner?: boolean;
  critique?: boolean;
  governor?: boolean;
  heartbeat?: boolean;
}

export const MODULE_CONFIG_KEYS: readonly (keyof ModuleConfig)[] = [
  'firewall', 'skills', 'memory', 'planner', 'critique', 'governor', 'heartbeat',
] as const;

export interface TrackedAgentSummary {
  id: string;
  name?: string;
  definitionId: string;
  status: string;
  source: string;
  createdByUser: string;
  initAction: TrackedAgentInitAction;
  initConfig: Readonly<Record<string, unknown>>;
  moduleConfig?: ModuleConfig;
  executionMode?: BeastExecutionMode;
  chatSessionId?: string;
  dispatchRunId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrackedAgentEvent {
  id: string;
  agentId: string;
  sequence: number;
  level: 'info' | 'warning' | 'error';
  type: string;
  message: string;
  payload: Readonly<Record<string, unknown>>;
  createdAt: string;
}

export interface TrackedAgentDetail {
  agent: TrackedAgentSummary;
  events: TrackedAgentEvent[];
}

export interface AgentLlmConfig {
  default?: { provider: string; model: string };
  overrides?: Record<string, { provider: string; model: string }>;
}

export interface AgentGitConfig {
  preset: 'one-shot' | 'feature-branch' | 'feature-branch-worktree' | 'yolo-main' | 'custom';
  baseBranch: string;
  branchPattern: string;
  prCreation: boolean;
  prTemplate?: string;
  commitConvention: 'conventional' | 'freeform';
  mergeStrategy: 'merge' | 'squash' | 'rebase';
}

export interface AgentDeepModuleConfig {
  firewall?: { ruleSet?: string; customRules?: string };
  memory?: { backend?: string; retentionPolicy?: string };
  planner?: { maxDagDepth?: number; parallelTaskLimit?: number };
  critique?: { maxIterations?: number; severityThreshold?: string };
  governor?: { approvalMode?: string; escalationRules?: string };
  heartbeat?: { reflectionInterval?: number; llmOverride?: { provider: string; model: string } };
}

export interface ExtendedAgentCreateInput {
  name: string;
  description?: string;
  definitionId: string;
  initAction: TrackedAgentInitAction;
  moduleConfig?: ModuleConfig;
  deepModuleConfig?: AgentDeepModuleConfig;
  llmConfig?: AgentLlmConfig;
  gitConfig?: AgentGitConfig;
  skills?: string[];
  promptText?: string;
  promptFiles?: Array<{ name: string; content: string; tokens: number }>;
}

export interface NetworkServiceStatus {
  id: string;
  status: string;
  explanation?: string;
  url?: string;
  inProcess?: boolean;
  hostServiceId?: string;
  channels?: Record<string, boolean>;
}

export interface NetworkStatusResponse {
  mode?: string;
  secureBackend?: string;
  services: NetworkServiceStatus[];
}

export interface NetworkConfigResponse {
  network: { mode: string; secureBackend?: string };
  chat: { model: string; enabled: boolean; host?: string; port?: number };
  dashboard?: { enabled?: boolean; host?: string; port?: number; apiUrl?: string };
  comms?: { enabled?: boolean };
}
