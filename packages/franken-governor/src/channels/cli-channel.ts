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

  constructor(deps: CliChannelDeps) {
    this.readline = deps.readline;
    this.operatorName = deps.operatorName;
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalResponse> {
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
