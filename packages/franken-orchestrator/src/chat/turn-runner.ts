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

export type TurnEvent =
  | { type: 'start'; data?: unknown }
  | { type: 'progress'; data?: unknown }
  | { type: 'tool_use'; data?: unknown }
  | { type: 'approval_request'; data?: unknown }
  | { type: 'complete'; data?: unknown };

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

  async run(outcome: ExecuteOutcome | PlanOutcome): Promise<TurnRunResult> {
    const events: TurnEvent[] = [];

    if (outcome.kind === 'plan') {
      const summary = `Plan created: ${outcome.planSummary} (${outcome.chunkCount} chunks)`;
      return { status: 'completed', summary, events };
    }

    if (outcome.approvalRequired) {
      const event: TurnEvent = { type: 'approval_request', data: { taskDescription: outcome.taskDescription } };
      events.push(event);
      this.emit('event', event);
      return {
        status: 'pending_approval',
        summary: `Approval required: ${outcome.taskDescription}`,
        events,
      };
    }

    const startEvent: TurnEvent = { type: 'start', data: { taskDescription: outcome.taskDescription } };
    events.push(startEvent);
    this.emit('event', startEvent);

    const executionResult = await this.executor.execute({ userInput: outcome.taskDescription });

    const summary = TurnSummarizer.summarize(executionResult);
    const status: TurnRunResult['status'] = executionResult.status === 'success' ? 'completed' : 'failed';

    const completeEvent: TurnEvent = { type: 'complete', data: { status: executionResult.status } };
    events.push(completeEvent);
    this.emit('event', completeEvent);

    return { status, summary, events };
  }
}
