import { GovernorError } from './governor-error.js';
export class ChannelUnavailableError extends GovernorError {
    channelId;
    constructor(channelId, reason) {
        super(`Channel '${channelId}' unavailable: ${reason}`);
        this.channelId = channelId;
        this.name = 'ChannelUnavailableError';
        Object.setPrototypeOf(this, ChannelUnavailableError.prototype);
    }
}
//# sourceMappingURL=channel-unavailable-error.js.map