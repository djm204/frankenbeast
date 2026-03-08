import type { ApprovalChannel } from '../gateway/approval-channel.js';
import type { ApprovalRequest, ApprovalResponse, ResponseCode } from '../core/types.js';
export interface HttpClient {
    post(url: string, body: unknown): Promise<{
        ok: boolean;
        body?: unknown;
    }>;
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
export declare class SlackChannel implements ApprovalChannel {
    readonly channelId = "slack";
    private readonly webhookUrl;
    private readonly httpClient;
    private readonly callbackServer;
    constructor(deps: SlackChannelDeps);
    requestApproval(request: ApprovalRequest): Promise<ApprovalResponse>;
    private sendWebhook;
    private formatMessage;
}
//# sourceMappingURL=slack-channel.d.ts.map