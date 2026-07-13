import type { ApprovalChannel } from '../gateway/approval-channel.js';
import type { ApprovalRequest, ApprovalResponse, ResponseCode } from '../core/types.js';
import { now as deterministicNow } from '@franken/types';
import { formatApprovalPromptWithBoundaries } from '../gateway/approval-prompt-markers.js';

export interface ReadlineAdapter {
  question(prompt: string): Promise<string>;
}

export interface CliChannelDeps {
  readonly readline: ReadlineAdapter;
  readonly operatorName: string;
}

const INPUT_MAP: Record<string, ResponseCode> = {
  a: 'APPROVE',
  r: 'REGEN',
  x: 'ABORT',
  d: 'DEBUG',
};

export class CliChannel implements ApprovalChannel {
  readonly channelId = 'cli';
  private readonly readline: ReadlineAdapter;
  private readonly operatorName: string;

  constructor(deps: CliChannelDeps) {
    this.readline = deps.readline;
    this.operatorName = deps.operatorName;
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalResponse> {
    const decision = await this.promptForDecision(request);
    const base = {
      requestId: request.requestId,
      decision,
      respondedBy: this.operatorName,
      respondedAt: new Date(deterministicNow()),
    };

    if (decision === 'REGEN') {
      const feedback = await this.readline.question('Feedback: ');
      return { ...base, feedback };
    }

    return base;
  }

  private async promptForDecision(request: ApprovalRequest): Promise<ResponseCode> {
    const prompt = this.formatPrompt(request);

    while (true) {
      const input = await this.readline.question(prompt);
      const decision = INPUT_MAP[input.trim().toLowerCase()];
      if (decision !== undefined) return decision;
    }
  }

  private formatPrompt(request: ApprovalRequest): string {
    const lines = [
      '',
      formatApprovalPromptWithBoundaries(request, { includePlanDiff: true }),
      `\n[a]pprove  [r]egenerate  a[x]bort  [d]ebug\n> `,
    ].filter(Boolean);

    return lines.join('\n');
  }
}
