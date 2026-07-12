import type { ApprovalChannel } from '../gateway/approval-channel.js';
import type { ApprovalRequest, ApprovalResponse, ResponseCode } from '../core/types.js';
import { ChannelUnavailableError } from '../errors/index.js';
import { now as deterministicNow } from '@franken/types';
import {
  approvalPromptBoundary,
  formatApprovalPromptWithBoundaries,
} from '../gateway/approval-prompt-markers.js';

export interface HttpClient {
  post(url: string, body: unknown): Promise<{ ok: boolean; body?: unknown }>;
}

export interface SlackCallbackServer {
  waitForCallback(requestId: string): Promise<{
    decision: ResponseCode;
    respondedBy: string;
    feedback?: string;
  }>;
}

export interface SlackChannelDeps {
  readonly webhookUrl: string;
  readonly httpClient: HttpClient;
  readonly callbackServer: SlackCallbackServer;
}

const SLACK_SECTION_TEXT_LIMIT = 3000;

function truncateForSlackSection(text: string, requestId: string): string {
  if (text.length <= SLACK_SECTION_TEXT_LIMIT) {
    return text;
  }

  const endBoundary = approvalPromptBoundary(requestId, 'END');
  const suffix = `\n> … untrusted approval details truncated to fit Slack section limits; use CLI or logs for the full payload.\n${endBoundary}`;
  return `${text.slice(0, SLACK_SECTION_TEXT_LIMIT - suffix.length).trimEnd()}${suffix}`;
}

export class SlackChannel implements ApprovalChannel {
  readonly channelId = 'slack';
  private readonly webhookUrl: string;
  private readonly httpClient: HttpClient;
  private readonly callbackServer: SlackCallbackServer;

  constructor(deps: SlackChannelDeps) {
    this.webhookUrl = deps.webhookUrl;
    this.httpClient = deps.httpClient;
    this.callbackServer = deps.callbackServer;
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalResponse> {
    await this.sendWebhook(request);
    const callback = await this.callbackServer.waitForCallback(request.requestId);

    const base = {
      requestId: request.requestId,
      decision: callback.decision,
      respondedBy: callback.respondedBy,
      respondedAt: new Date(deterministicNow()),
    };

    return callback.feedback !== undefined
      ? { ...base, feedback: callback.feedback }
      : base;
  }

  private async sendWebhook(request: ApprovalRequest): Promise<void> {
    const message = this.formatMessage(request);
    const blockText = truncateForSlackSection(message, request.requestId);
    const payload = {
      text: message,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: blockText,
          },
        },
      ],
    };

    try {
      await this.httpClient.post(this.webhookUrl, payload);
    } catch (cause) {
      throw new ChannelUnavailableError('slack', `Failed to send webhook to ${this.webhookUrl}`, { cause });
    }
  }

  private formatMessage(request: ApprovalRequest): string {
    return formatApprovalPromptWithBoundaries(request, { untrustedPrefix: '> ' });
  }
}
