import type { ApprovalChannel } from '../gateway/approval-channel.js';
import type { ApprovalRequest, ApprovalResponse } from '../core/types.js';
export interface ReadlineAdapter {
    question(prompt: string): Promise<string>;
}
export interface CliChannelDeps {
    readonly readline: ReadlineAdapter;
    readonly operatorName: string;
}
export declare class CliChannel implements ApprovalChannel {
    readonly channelId = "cli";
    private readonly readline;
    private readonly operatorName;
    constructor(deps: CliChannelDeps);
    requestApproval(request: ApprovalRequest): Promise<ApprovalResponse>;
    private promptForDecision;
    private formatPrompt;
}
//# sourceMappingURL=cli-channel.d.ts.map