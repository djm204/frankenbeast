import { GovernorError } from './governor-error.js';

export class ChannelUnavailableError extends GovernorError {
  constructor(
    public readonly channelId: string,
    reason: string,
    options?: ErrorOptions,
  ) {
    super(`Channel '${channelId}' unavailable: ${reason}`, options);
    this.name = 'ChannelUnavailableError';
    Object.setPrototypeOf(this, ChannelUnavailableError.prototype);
  }
}
