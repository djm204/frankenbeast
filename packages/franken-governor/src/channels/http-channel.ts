import type { ApprovalChannel } from '../gateway/approval-channel.js';
import type { ApprovalRequest, ApprovalResponse } from '../core/types.js';
import type { ApprovalWaiterRegistry } from '../gateway/approval-waiter-registry.js';

export interface HttpApprovalChannelDeps {
  readonly registry: ApprovalWaiterRegistry;
}

/**
 * Approval channel for the standalone governor HTTP server
 * (`createGovernorApp`). Registers a real waiter with the shared
 * `ApprovalWaiterRegistry` so that a caller awaiting
 * `ApprovalGateway.requestApproval()` is woken when an operator resolves the
 * request via `POST /v1/approval/respond` or the Slack webhook, instead of
 * the request silently hanging against a no-op resolver.
 *
 * The same `ApprovalWaiterRegistry` instance must be passed to
 * `createGovernorApp({ registry })` so the HTTP handlers and this channel
 * operate on shared state.
 */
export class HttpApprovalChannel implements ApprovalChannel {
  readonly channelId = 'http';
  private readonly registry: ApprovalWaiterRegistry;

  constructor(deps: HttpApprovalChannelDeps) {
    this.registry = deps.registry;
  }

  requestApproval(request: ApprovalRequest): Promise<ApprovalResponse> {
    return this.registry.waitFor(request.requestId, request.taskId, request.summary);
  }

  /**
   * Called by `ApprovalGateway` when it gives up waiting (e.g. on timeout).
   * Purges the registry entry so `GET /health` stops reporting an abandoned
   * request as pending, and so a late `POST /v1/approval/respond` or Slack
   * callback for it returns 404 instead of a misleading 200 for a decision
   * nobody is listening for anymore.
   */
  cancel(requestId: string): void {
    this.registry.delete(requestId);
  }
}
