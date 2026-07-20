import type { ApprovalResponse } from '../core/types.js';

interface PendingApproval {
  readonly taskId: string;
  readonly summary: string;
  readonly approvalAnomalyNotice?: string;
  readonly hasRealWaiter: boolean;
  resolve: (response: ApprovalResponse) => void;
}

interface EarlyApprovalResponse {
  readonly response: ApprovalResponse;
  readonly expiry: ReturnType<typeof setTimeout>;
}

export interface PendingApprovalSnapshot {
  readonly requestId: string;
  readonly taskId: string;
  readonly summary: string;
  readonly approvalAnomalyNotice?: string;
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
  private static readonly EARLY_RESPONSE_TTL_MS = 300_000;
  private readonly pending = new Map<string, PendingApproval>();
  /**
   * Responses accepted for placeholder-only registrations before the
   * in-process channel attaches its real waiter. Entries are one-shot: the
   * matching waiter consumes them, while cancellation removes them.
   */
  private readonly resolvedBeforeWaiter = new Map<string, EarlyApprovalResponse>();

  get size(): number {
    return this.pending.size;
  }

  has(requestId: string): boolean {
    return this.pending.has(requestId);
  }

  hasKnownRequest(requestId: string): boolean {
    return this.pending.has(requestId) || this.resolvedBeforeWaiter.has(requestId);
  }

  get(requestId: string): { taskId: string; summary: string; approvalAnomalyNotice?: string } | undefined {
    const entry = this.pending.get(requestId);
    return entry ? {
      taskId: entry.taskId,
      summary: entry.summary,
      ...(entry.approvalAnomalyNotice !== undefined ? { approvalAnomalyNotice: entry.approvalAnomalyNotice } : {}),
    } : undefined;
  }

  list(): PendingApprovalSnapshot[] {
    return [...this.pending.entries()].map(([requestId, entry]) => ({
      requestId,
      taskId: entry.taskId,
      summary: entry.summary,
      ...(entry.approvalAnomalyNotice !== undefined ? { approvalAnomalyNotice: entry.approvalAnomalyNotice } : {}),
    }));
  }

  /**
   * Record that an approval request exists, without attaching a real
   * waiter. Used by `POST /v1/approval/request` so the request is visible
   * (e.g. via `GET /health`) even when nothing in-process is awaiting it.
   * If a real waiter is already registered for this `requestId` (via
   * `waitFor`), its resolver is preserved rather than overwritten.
   */
  register(requestId: string, taskId: string, summary: string, approvalAnomalyNotice?: string): void {
    // A response can race ahead of a later placeholder refresh. Preserve the
    // completed decision for the real waiter rather than making it pending
    // again and hanging that waiter.
    if (this.resolvedBeforeWaiter.has(requestId)) return;

    const existing = this.pending.get(requestId);
    const effectiveApprovalAnomalyNotice = approvalAnomalyNotice ?? existing?.approvalAnomalyNotice;
    this.pending.set(requestId, {
      taskId,
      summary,
      ...(effectiveApprovalAnomalyNotice !== undefined
        ? { approvalAnomalyNotice: effectiveApprovalAnomalyNotice }
        : {}),
      hasRealWaiter: existing?.hasRealWaiter ?? false,
      resolve: existing?.resolve ?? (() => {}),
    });
  }

  /**
   * Register a real waiter and return a promise that resolves when
   * `resolve(requestId, response)` is called for this `requestId`.
   */
  waitFor(
    requestId: string,
    taskId: string,
    summary: string,
    approvalAnomalyNotice?: string,
  ): Promise<ApprovalResponse> {
    const earlyResponse = this.resolvedBeforeWaiter.get(requestId);
    if (earlyResponse) {
      this.resolvedBeforeWaiter.delete(requestId);
      clearTimeout(earlyResponse.expiry);
      return new Promise<ApprovalResponse>((resolvePromise) => {
        this.pending.set(requestId, {
          taskId,
          summary,
          ...(approvalAnomalyNotice !== undefined ? { approvalAnomalyNotice } : {}),
          hasRealWaiter: true,
          resolve: resolvePromise,
        });
        queueMicrotask(() => {
          const pending = this.pending.get(requestId);
          if (pending?.resolve === resolvePromise) {
            this.pending.delete(requestId);
            resolvePromise(earlyResponse.response);
          }
        });
      });
    }

    const existing = this.pending.get(requestId);
    if (existing?.hasRealWaiter) {
      return Promise.reject(new Error(`Approval waiter already registered for requestId ${requestId}`));
    }

    return new Promise<ApprovalResponse>((resolvePromise) => {
      const effectiveApprovalAnomalyNotice = approvalAnomalyNotice ?? existing?.approvalAnomalyNotice;
      this.pending.set(requestId, {
        taskId,
        summary,
        ...(effectiveApprovalAnomalyNotice !== undefined
          ? { approvalAnomalyNotice: effectiveApprovalAnomalyNotice }
          : {}),
        hasRealWaiter: true,
        resolve: resolvePromise,
      });
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
    if (pending.hasRealWaiter) {
      pending.resolve(response);
    } else {
      const expiry = setTimeout(() => {
        const cached = this.resolvedBeforeWaiter.get(requestId);
        if (cached?.expiry === expiry) {
          this.resolvedBeforeWaiter.delete(requestId);
        }
      }, ApprovalWaiterRegistry.EARLY_RESPONSE_TTL_MS);
      expiry.unref?.();
      this.resolvedBeforeWaiter.set(requestId, { response, expiry });
    }
    return true;
  }

  delete(requestId: string): boolean {
    const deletedPending = this.pending.delete(requestId);
    const earlyResponse = this.resolvedBeforeWaiter.get(requestId);
    const deletedEarlyResponse = this.resolvedBeforeWaiter.delete(requestId);
    if (earlyResponse) clearTimeout(earlyResponse.expiry);
    return deletedPending || deletedEarlyResponse;
  }
}
