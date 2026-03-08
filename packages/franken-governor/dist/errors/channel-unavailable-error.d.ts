import { GovernorError } from './governor-error.js';
export declare class ChannelUnavailableError extends GovernorError {
    readonly channelId: string;
    constructor(channelId: string, reason: string);
}
//# sourceMappingURL=channel-unavailable-error.d.ts.map