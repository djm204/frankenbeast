import { EventEmitter } from 'node:events';
import type { ExecuteOutcome, PlanOutcome } from './types.js';
import { TurnSummarizer } from './turn-summarizer.js';

export interface ExecutionResult {
  status: 'success' | 'failed';
  summary: string;
  filesChanged: string[];
  testsRun: number;
  errors: string[];
}

export interface ITaskExecutor {
  execute(input: { userInput: string }): Promise<ExecutionResult>;
}

interface TurnEventBase {
  sessionId: string;
  data?: unknown;
}

export type TurnEvent =
  | (TurnEventBase & { type: 'start' })
  | (TurnEventBase & { type: 'progress' })
  | (TurnEventBase & { type: 'tool_use' })
  | (TurnEventBase & { type: 'approval_request' })
  | (TurnEventBase & { type: 'complete' });

export interface TurnRunOptions {
  sessionId: string;
}

export interface TurnRunResult {
  status: 'completed' | 'pending_approval' | 'failed';
  summary: string;
  events: TurnEvent[];
}

export class TurnRunner extends EventEmitter {
  private executor: ITaskExecutor;

  constructor(executor: ITaskExecutor) {
    super();
    this.executor = executor;
  }

  async run(outcome: ExecuteOutcome | PlanOutcome, options?: TurnRunOptions): Promise<TurnRunResult> {
    const events: TurnEvent[] = [];
    const sessionId = options?.sessionId ?? 'unknown-session';

    if (outcome.kind === 'plan') {
      const summary = `Plan created: ${outcome.planSummary} (${outcome.chunkCount} chunks)`;
      return { status: 'completed', summary, events };
    }

    if (outcome.approvalRequired) {
      const event: TurnEvent = { type: 'approval_request', sessionId, data: { taskDescription: outcome.taskDescription } };
      events.push(event);
      this.emit('event', event);
      return {
        status: 'pending_approval',
        summary: `Approval required: ${outcome.taskDescription}`,
        events,
      };
    }

    const startEvent: TurnEvent = { type: 'start', sessionId, data: { taskDescription: outcome.taskDescription } };
    events.push(startEvent);
    this.emit('event', startEvent);

    const executionResult = await this.executor.execute({ userInput: outcome.taskDescription });

    const summary = TurnSummarizer.summarize(executionResult);
    const status: TurnRunResult['status'] = executionResult.status === 'success' ? 'completed' : 'failed';

    const completeEvent: TurnEvent = { type: 'complete', sessionId, data: { status: executionResult.status } };
    events.push(completeEvent);
    this.emit('event', completeEvent);

    return { status, summary, events };
  }
}
