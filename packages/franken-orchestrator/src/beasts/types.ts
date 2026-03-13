import type { ZodType } from 'zod';

export type {
  TrackedAgent,
  TrackedAgentEvent,
  TrackedAgentInitAction,
  TrackedAgentInitActionKind,
  TrackedAgentStatus,
} from './agent-types.js';

export type BeastDispatchSource = 'cli' | 'dashboard' | 'chat' | 'api';

export type BeastExecutionMode = 'process' | 'container';

export type BeastRunStatus =
  | 'queued'
  | 'interviewing'
  | 'running'
  | 'pending_approval'
  | 'completed'
  | 'failed'
  | 'stopped';

export interface BeastInterviewPrompt {
  readonly key: string;
  readonly prompt: string;
  readonly kind: 'string' | 'boolean' | 'file' | 'directory';
  readonly required?: boolean | undefined;
  readonly options?: readonly string[] | undefined;
}

export interface BeastProcessSpec {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string | undefined;
  readonly env?: Readonly<Record<string, string>> | undefined;
}

export interface BeastDefinition {
  readonly id: string;
  readonly version: number;
  readonly label: string;
  readonly description: string;
  readonly executionModeDefault: BeastExecutionMode;
  readonly configSchema: ZodType<Readonly<Record<string, unknown>>>;
  readonly interviewPrompts: readonly BeastInterviewPrompt[];
  buildProcessSpec(config: Readonly<Record<string, unknown>>): BeastProcessSpec;
  readonly telemetryLabels: Readonly<Record<string, string>>;
}

export interface BeastRun {
  readonly id: string;
  readonly trackedAgentId?: string | undefined;
  readonly definitionId: string;
  readonly definitionVersion: number;
  readonly status: BeastRunStatus;
  readonly executionMode: BeastExecutionMode;
  readonly configSnapshot: Readonly<Record<string, unknown>>;
  readonly dispatchedBy: BeastDispatchSource;
  readonly dispatchedByUser: string;
  readonly createdAt: string;
  readonly startedAt?: string | undefined;
  readonly finishedAt?: string | undefined;
  readonly currentAttemptId?: string | undefined;
  readonly attemptCount: number;
  readonly lastHeartbeatAt?: string | undefined;
  readonly stopReason?: string | undefined;
  readonly latestExitCode?: number | undefined;
}

export interface BeastRunAttempt {
  readonly id: string;
  readonly runId: string;
  readonly attemptNumber: number;
  readonly status: BeastRunStatus;
  readonly pid?: number | undefined;
  readonly startedAt?: string | undefined;
  readonly finishedAt?: string | undefined;
  readonly exitCode?: number | undefined;
  readonly stopReason?: string | undefined;
  readonly executorMetadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface BeastRunEvent {
  readonly id: string;
  readonly runId: string;
  readonly attemptId?: string | undefined;
  readonly sequence: number;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface BeastInterviewSession {
  readonly id: string;
  readonly definitionId: string;
  readonly status: 'active' | 'completed' | 'aborted';
  readonly answers: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ModuleConfig {
  readonly firewall?: boolean | undefined;
  readonly skills?: boolean | undefined;
  readonly memory?: boolean | undefined;
  readonly planner?: boolean | undefined;
  readonly critique?: boolean | undefined;
  readonly governor?: boolean | undefined;
  readonly heartbeat?: boolean | undefined;
}
