import type { ApprovalRequest, ApprovalResponse } from '../core/types.js';

export interface ApprovalChannel {
  readonly channelId: string;
  requestApproval(request: ApprovalRequest): Promise<ApprovalResponse>;
  /**
   * Optional hook invoked by `ApprovalGateway` when it gives up waiting on
   * `requestId` (e.g. after `config.timeoutMs` elapses) so the channel can
   * release any resources tied to that request — for example a pending
   * waiter registration that would otherwise be reported as "pending"
   * forever and could still be resolved by a late, now-meaningless,
   * inbound callback. Channels without persistent per-request state may
   * omit this.
   */
  cancel?(requestId: string): void;
}
