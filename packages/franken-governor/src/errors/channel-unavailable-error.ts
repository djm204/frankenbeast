import { GovernorError } from './governor-error.js';

export class ChannelUnavailableError extends GovernorError {
  constructor(
    public readonly channelId: string,
    reason: string,
  ) {
    super(`Channel '${channelId}' unavailable: ${reason}`);
    this.name = 'ChannelUnavailableError';
    Object.setPrototypeOf(this, ChannelUnavailableError.prototype);
  }
}
