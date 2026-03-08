import { ChannelUnavailableError } from '../errors/index.js';
export class SlackChannel {
    channelId = 'slack';
    webhookUrl;
    httpClient;
    callbackServer;
    constructor(deps) {
        this.webhookUrl = deps.webhookUrl;
        this.httpClient = deps.httpClient;
        this.callbackServer = deps.callbackServer;
    }
    async requestApproval(request) {
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
    async sendWebhook(request) {
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
        }
        catch {
            throw new ChannelUnavailableError('slack', `Failed to send webhook to ${this.webhookUrl}`);
        }
    }
    formatMessage(request) {
        return [
            `*HITL Approval Required*`,
            `*Task:* ${request.taskId}`,
            `*Trigger:* [${request.trigger.triggerId}] ${request.trigger.reason ?? 'No reason'}`,
            `*Summary:* ${request.summary}`,
            `*Request ID:* ${request.requestId}`,
        ].join('\n');
    }
}
//# sourceMappingURL=slack-channel.js.map