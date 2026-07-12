import type { ApprovalResponse } from '../core/types.js';

interface PendingApproval {
  readonly taskId: string;
  readonly summary: string;
  readonly hasRealWaiter: boolean;
  resolve: (response: ApprovalResponse) => void;
}

/**
 * Shared in-memory registry of pending HITL approvals for the standalone
 * governor HTTP server.
 *
 * It bridges two independent entry points into the same waiter state:
 *
 *  - `waitFor` / `register`: an in-process caller (typically an
 *    `HttpApprovalChannel` driven by `ApprovalGateway.requestApproval`)
 *    registers a real promise resolver for a `requestId`.
 *  - `resolve`: an inbound HTTP callback (`POST /v1/approval/respond` or the
 *    Slack webhook) wakes that resolver with the operator's decision.
 *
 * Before this registry existed, `createGovernorApp` stored a
 * `resolve: () => {}` placeholder for every pending approval, so HTTP
 * responses were accepted and reported as "resolved" without ever waking an
 * in-process waiter (see issue #411).
 */
export class ApprovalWaiterRegistry {
  private readonly pending = new Map<string, PendingApproval>();

  get size(): number {
    return this.pending.size;
  }

  has(requestId: string): boolean {
    return this.pending.has(requestId);
  }

  get(requestId: string): { taskId: string; summary: string } | undefined {
    const entry = this.pending.get(requestId);
    return entry ? { taskId: entry.taskId, summary: entry.summary } : undefined;
  }

  /**
   * Record that an approval request exists, without attaching a real
   * waiter. Used by `POST /v1/approval/request` so the request is visible
   * (e.g. via `GET /health`) even when nothing in-process is awaiting it.
   * If a real waiter is already registered for this `requestId` (via
   * `waitFor`), its resolver is preserved rather than overwritten.
   */
  register(requestId: string, taskId: string, summary: string): void {
    const existing = this.pending.get(requestId);
    this.pending.set(requestId, {
      taskId,
      summary,
      hasRealWaiter: existing?.hasRealWaiter ?? false,
      resolve: existing?.resolve ?? (() => {}),
    });
  }

  /**
   * Register a real waiter and return a promise that resolves when
   * `resolve(requestId, response)` is called for this `requestId`.
   */
  waitFor(requestId: string, taskId: string, summary: string): Promise<ApprovalResponse> {
    const existing = this.pending.get(requestId);
    if (existing?.hasRealWaiter) {
      return Promise.reject(new Error(`Approval waiter already registered for requestId ${requestId}`));
    }

    return new Promise<ApprovalResponse>((resolvePromise) => {
      this.pending.set(requestId, { taskId, summary, hasRealWaiter: true, resolve: resolvePromise });
    });
  }

  /**
   * Resolve the pending approval, waking whatever waiter (real or
   * placeholder) is registered for it. Returns `false` without effect if no
   * pending approval exists for `requestId`.
   */
  resolve(requestId: string, response: ApprovalResponse): boolean {
    const pending = this.pending.get(requestId);
    if (!pending) return false;
    this.pending.delete(requestId);
    pending.resolve(response);
    return true;
  }

  delete(requestId: string): boolean {
    return this.pending.delete(requestId);
  }
}
