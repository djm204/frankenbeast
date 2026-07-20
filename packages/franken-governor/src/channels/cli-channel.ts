import type { ApprovalChannel } from '../gateway/approval-channel.js';
import type { ApprovalRequest, ApprovalResponse, ResponseCode } from '../core/types.js';
import { now as deterministicNow } from '@franken/types';
import { formatApprovalPromptWithBoundaries } from '../gateway/approval-prompt-markers.js';

export interface ReadlineAdapter {
  question(prompt: string): Promise<string>;
  cancel?(): void;
}

export interface CliChannelDeps {
  readonly readline: ReadlineAdapter;
  readonly operatorName: string;
}

const INPUT_MAP: Record<string, ResponseCode> = {
  a: 'APPROVE',
  approve: 'APPROVE',
  y: 'APPROVE',
  yes: 'APPROVE',
  r: 'REGEN',
  regenerate: 'REGEN',
  x: 'ABORT',
  abort: 'ABORT',
  n: 'ABORT',
  no: 'ABORT',
  d: 'DEBUG',
  debug: 'DEBUG',
};

const INVALID_INPUT_HELP =
  'Please answer a/approve/y/yes, r/regenerate, x/abort/n/no, or d/debug.';

export class CliChannel implements ApprovalChannel {
  readonly channelId = 'cli';
  private readonly readline: ReadlineAdapter;
  private readonly operatorName: string;
  private approvalQueue: Promise<void> = Promise.resolve();
  private activeRequestId: string | undefined;
  private readonly pendingRequestIds = new Set<string>();
  private readonly cancelledRequestIds = new Set<string>();

  constructor(deps: CliChannelDeps) {
    this.readline = deps.readline;
    this.operatorName = deps.operatorName;
  }

  cancel(requestId: string): void {
    if (!this.pendingRequestIds.has(requestId)) return;
    this.cancelledRequestIds.add(requestId);
    if (this.activeRequestId === requestId) this.readline.cancel?.();
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalResponse> {
    this.pendingRequestIds.add(request.requestId);
    const previous = this.approvalQueue;
    let release!: () => void;
    this.approvalQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;

    try {
      if (this.cancelledRequestIds.has(request.requestId)) throw this.cancelledError();
      this.activeRequestId = request.requestId;
      const { decision, feedback: inlineFeedback } = await this.promptForDecision(request);
      const base = {
        requestId: request.requestId,
        decision,
        respondedBy: this.operatorName,
        respondedAt: new Date(deterministicNow()),
      };

      if (inlineFeedback !== undefined) {
        return { ...base, feedback: inlineFeedback };
      }

      if (decision === 'REGEN') {
        const feedback = await this.readline.question('Feedback: ');
        return { ...base, feedback };
      }

      return base;
    } finally {
      if (this.activeRequestId === request.requestId) this.activeRequestId = undefined;
      this.pendingRequestIds.delete(request.requestId);
      this.cancelledRequestIds.delete(request.requestId);
      release();
    }
  }

  private cancelledError(): Error {
    const error = new Error('Approval prompt cancelled');
    error.name = 'AbortError';
    return error;
  }

  private async promptForDecision(request: ApprovalRequest): Promise<{
    readonly decision: ResponseCode;
    readonly feedback?: string;
  }> {
    const basePrompt = this.formatPrompt(request);
    let prompt = basePrompt;

    while (true) {
      const input = await this.readline.question(`${prompt}\n> `);
      const trimmed = input.trim();
      const [command = '', ...feedbackParts] = trimmed.split(/\s+/u);
      const decision = INPUT_MAP[command.toLowerCase()];

      if (decision === undefined) {
        prompt = `${basePrompt}\n\n${trimmed ? `"${trimmed}" is not recognized. ` : ''}${INVALID_INPUT_HELP}`;
        continue;
      }

      const feedback = feedbackParts.join(' ').trim();
      return feedback.length > 0 ? { decision, feedback } : { decision };
    }
  }


  private formatPrompt(request: ApprovalRequest): string {
    const lines = [
      '',
      formatApprovalPromptWithBoundaries(request, { includePlanDiff: true }),
      `[a]pprove  [r]egenerate  a[x]bort  [d]ebug`,
      'Append an acknowledgement token after the decision when a SECURITY NOTICE requires one.',
    ].filter(Boolean);

    return lines.join('\n');
  }
}
