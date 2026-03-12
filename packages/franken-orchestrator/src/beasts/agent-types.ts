import type { BeastDispatchSource } from './types.js';

export const TRACKED_AGENT_STATUSES = [
  'initializing',
  'awaiting_approval',
  'dispatching',
  'running',
  'completed',
  'failed',
  'stopped',
] as const;

export type TrackedAgentStatus = (typeof TRACKED_AGENT_STATUSES)[number];

export const TRACKED_AGENT_INIT_ACTION_KINDS = [
  'design-interview',
  'chunk-plan',
  'martin-loop',
] as const;

export type TrackedAgentInitActionKind = (typeof TRACKED_AGENT_INIT_ACTION_KINDS)[number];

export interface TrackedAgentInitAction {
  readonly kind: TrackedAgentInitActionKind;
  readonly command: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly chatSessionId?: string | undefined;
}

export interface TrackedAgent {
  readonly id: string;
  readonly definitionId: string;
  readonly source: BeastDispatchSource;
  readonly status: TrackedAgentStatus;
  readonly createdByUser: string;
  readonly initAction: TrackedAgentInitAction;
  readonly initConfig: Readonly<Record<string, unknown>>;
  readonly chatSessionId?: string | undefined;
  readonly dispatchRunId?: string | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TrackedAgentEvent {
  readonly id: string;
  readonly agentId: string;
  readonly sequence: number;
  readonly level: 'info' | 'warning' | 'error';
  readonly type: string;
  readonly message: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}
