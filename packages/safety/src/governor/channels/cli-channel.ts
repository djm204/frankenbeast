import type { ApprovalChannel } from '../gateway/approval-channel.js';
import type { ApprovalRequest, ApprovalResponse, ResponseCode } from '../core/types.js';

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
      respondedAt: new Date(),
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
      `\n--- HITL Approval Required ---`,
      `Task: ${request.taskId}`,
      `Trigger: [${request.trigger.triggerId}] ${request.trigger.reason ?? 'No reason'}`,
      `Summary: ${request.summary}`,
      request.planDiff ? `Plan Diff:\n${request.planDiff}` : '',
      `\n[a]pprove  [r]egenerate  a[x]bort  [d]ebug\n> `,
    ].filter(Boolean);

    return lines.join('\n');
  }
}
