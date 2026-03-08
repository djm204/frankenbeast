import type { ApprovalChannel } from '../gateway/approval-channel.js';
import type { ApprovalRequest, ApprovalResponse, ResponseCode } from '../core/types.js';
import { ChannelUnavailableError } from '../errors/index.js';

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
      respondedAt: new Date(),
    };

    return callback.feedback !== undefined
      ? { ...base, feedback: callback.feedback }
      : base;
  }

  private async sendWebhook(request: ApprovalRequest): Promise<void> {
    const payload = {
      text: this.formatMessage(request),
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: this.formatMessage(request),
          },
        },
      ],
    };

    try {
      await this.httpClient.post(this.webhookUrl, payload);
    } catch {
      throw new ChannelUnavailableError('slack', `Failed to send webhook to ${this.webhookUrl}`);
    }
  }

  private formatMessage(request: ApprovalRequest): string {
    return [
      `*HITL Approval Required*`,
      `*Task:* ${request.taskId}`,
      `*Trigger:* [${request.trigger.triggerId}] ${request.trigger.reason ?? 'No reason'}`,
      `*Summary:* ${request.summary}`,
      `*Request ID:* ${request.requestId}`,
    ].join('\n');
  }
}
