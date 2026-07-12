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
  onEvent?: ((event: TurnEvent) => void) | undefined;
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
    const emitTurnEvent = (event: TurnEvent): void => {
      events.push(event);
      this.emit('event', event);
      options?.onEvent?.(event);
    };

    if (outcome.kind === 'plan') {
      const summary = `Plan created: ${outcome.planSummary} (${outcome.chunkCount} chunks)`;
      emitTurnEvent({ type: 'complete', sessionId, data: { status: 'completed' } });
      return { status: 'completed', summary, events };
    }

    if (outcome.approvalRequired) {
      emitTurnEvent({ type: 'approval_request', sessionId, data: { taskDescription: outcome.taskDescription } });
      emitTurnEvent({ type: 'complete', sessionId, data: { status: 'pending_approval' } });
      return {
        status: 'pending_approval',
        summary: `Approval required: ${outcome.taskDescription}`,
        events,
      };
    }

    emitTurnEvent({ type: 'start', sessionId, data: { taskDescription: outcome.taskDescription } });

    let executionResult: ExecutionResult;
    try {
      executionResult = await this.executor.execute({ userInput: outcome.taskDescription });
    } catch (error) {
      emitTurnEvent({
        type: 'complete',
        sessionId,
        data: { status: 'failed', error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }

    const summary = TurnSummarizer.summarize(executionResult);
    const status: TurnRunResult['status'] = executionResult.status === 'success' ? 'completed' : 'failed';

    emitTurnEvent({ type: 'complete', sessionId, data: { status: executionResult.status } });

    return { status, summary, events };
  }
}
