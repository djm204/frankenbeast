import { wallClockNow } from '@franken/types';
import { MAX_TIMEOUT_MS } from '../core/config.js';
import type { ApprovalResponse } from '../core/types.js';

interface PendingApproval {
  readonly taskId: string;
  readonly summary: string;
  readonly approvalAnomalyNotice?: string;
  readonly hasRealWaiter: boolean;
  readonly createdAt: number;
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

export interface ApprovalWaiterRegistryOptions {
  /**
   * Maximum time (ms) a pending approval may remain unresolved before it is
   * treated as expired: rejected as stale if a decision arrives late, and
   * purged from memory even if no decision ever arrives. Defaults to
   * `300_000` (5 minutes), matching `GovernorConfig`'s default `timeoutMs`.
   * Callers that share a `GovernorConfig` with an `ApprovalGateway` should
   * pass the same `timeoutMs` here so both layers agree on approval
   * validity. Capped at `MAX_TIMEOUT_MS` (Node's `setTimeout` limit), same
   * as `GovernorConfig`: a larger value would silently truncate to a ~1ms
   * `setTimeout` delay, firing the purge timer almost immediately while the
   * entry is not yet logically expired, and never rescheduling.
   */
  readonly timeoutMs?: number;
  /**
   * Injectable clock, primarily so tests can control elapsed time without
   * real timers. Defaults to `wallClockNow` (real `Date.now()`) rather than
   * `@franken/types`'s deterministic `now()`: TTL math needs a clock that
   * genuinely advances with real elapsed time. When `FRANKENBEAST_SEED` is
   * set (as it is across this repo's CI matrix), the deterministic `now()`
   * returns a fixed value for the life of the process, which would make
   * every pending approval look permanently fresh -- defeating expiration
   * entirely under CI.
   */
  readonly now?: () => number;
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
 *
 * Every pending entry also carries a `createdAt` timestamp and is subject to
 * `timeoutMs` expiration (see #3736 / #3751): a decision arriving after an
 * entry's TTL has elapsed is rejected rather than honored (closing the
 * replay window), and entries are purged from memory once expired -- both
 * lazily on access (`has`, `get`, `list`, `size`, `resolve`,
 * `hasKnownRequest`) and actively via a per-entry background timer, so an
 * abandoned placeholder that nobody ever queries does not linger forever.
 * Once an entry is purged for having expired, a bounded "tombstone" record
 * is kept for `EXPIRED_TOMBSTONE_TTL_MS` so a late decision still gets a
 * distinct "expired" error instead of a generic "not found" one.
 */
export class ApprovalWaiterRegistry {
  private static readonly EARLY_RESPONSE_TTL_MS = 300_000;
  private static readonly EXPIRED_TOMBSTONE_TTL_MS = 300_000;
  static readonly DEFAULT_TIMEOUT_MS = 300_000;

  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly pending = new Map<string, PendingApproval>();
  /**
   * Responses accepted for placeholder-only registrations before the
   * in-process channel attaches its real waiter. Entries are one-shot: the
   * matching waiter consumes them, while cancellation removes them.
   */
  private readonly resolvedBeforeWaiter = new Map<string, EarlyApprovalResponse>();
  /** Background purge timers, keyed by requestId, for `pending` entries. */
  private readonly expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /**
   * `requestId`s that were purged for having expired, retained briefly so a
   * late decision or replay attempt is told "expired" rather than "not
   * found". Cleared once a fresh `register`/`waitFor` legitimately reuses
   * the id.
   */
  private readonly expiredTombstones = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options: ApprovalWaiterRegistryOptions = {}) {
    const timeoutMs = options.timeoutMs ?? ApprovalWaiterRegistry.DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError('ApprovalWaiterRegistry timeoutMs must be a positive finite number');
    }
    if (timeoutMs > MAX_TIMEOUT_MS) {
      throw new RangeError(`ApprovalWaiterRegistry timeoutMs must be less than or equal to ${MAX_TIMEOUT_MS}`);
    }
    this.timeoutMs = timeoutMs;
    this.now = options.now ?? wallClockNow;
  }

  get size(): number {
    this.pruneExpired();
    return this.pending.size;
  }

  has(requestId: string): boolean {
    return this.evictIfExpired(requestId) !== undefined;
  }

  hasKnownRequest(requestId: string): boolean {
    return this.evictIfExpired(requestId) !== undefined || this.resolvedBeforeWaiter.has(requestId);
  }

  /**
   * True if `requestId` currently has a pending entry that has exceeded
   * `timeoutMs`, or was recently purged for having done so (see
   * `expiredTombstones`). This is a non-mutating peek with respect to
   * `pending` (unlike `has`, `resolve`, etc., which evict expired entries as
   * a side effect) so callers can distinguish "expired" from "never
   * existed" for a clear, specific error before that lazy eviction happens.
   * It does record a tombstone the first time it observes a pending entry
   * has expired, so subsequent calls keep reporting "expired" for a bounded
   * grace period even after the entry itself is purged.
   */
  isExpired(requestId: string): boolean {
    const entry = this.pending.get(requestId);
    if (entry && this.isEntryExpired(entry)) {
      this.markExpired(requestId);
      return true;
    }
    return this.expiredTombstones.has(requestId);
  }

  get(requestId: string): { taskId: string; summary: string; approvalAnomalyNotice?: string } | undefined {
    const entry = this.evictIfExpired(requestId);
    return entry ? {
      taskId: entry.taskId,
      summary: entry.summary,
      ...(entry.approvalAnomalyNotice !== undefined ? { approvalAnomalyNotice: entry.approvalAnomalyNotice } : {}),
    } : undefined;
  }

  list(): PendingApprovalSnapshot[] {
    this.pruneExpired();
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

    const existing = this.evictIfExpired(requestId);
    // A fresh entry (nothing live under this id) legitimately supersedes
    // any earlier expiry tombstone -- this is a new approval request, not a
    // replay of the old one.
    if (!existing) this.clearTombstone(requestId);
    const effectiveApprovalAnomalyNotice = approvalAnomalyNotice ?? existing?.approvalAnomalyNotice;
    // Preserve the original creation time across a refreshing `register()`
    // call for the same requestId: re-registering must not push the TTL
    // deadline back out, or a client could keep an approval alive forever.
    const createdAt = existing?.createdAt ?? this.now();
    this.pending.set(requestId, {
      taskId,
      summary,
      ...(effectiveApprovalAnomalyNotice !== undefined
        ? { approvalAnomalyNotice: effectiveApprovalAnomalyNotice }
        : {}),
      hasRealWaiter: existing?.hasRealWaiter ?? false,
      resolve: existing?.resolve ?? (() => {}),
      createdAt,
    });
    this.scheduleExpiry(requestId, createdAt);
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
      this.clearTombstone(requestId);
      return new Promise<ApprovalResponse>((resolvePromise) => {
        const createdAt = this.now();
        this.pending.set(requestId, {
          taskId,
          summary,
          ...(approvalAnomalyNotice !== undefined ? { approvalAnomalyNotice } : {}),
          hasRealWaiter: true,
          resolve: resolvePromise,
          createdAt,
        });
        queueMicrotask(() => {
          const pending = this.pending.get(requestId);
          if (pending?.resolve === resolvePromise) {
            this.pending.delete(requestId);
            this.clearExpiryTimer(requestId);
            resolvePromise(earlyResponse.response);
          }
        });
      });
    }

    const existing = this.evictIfExpired(requestId);
    if (existing?.hasRealWaiter) {
      return Promise.reject(new Error(`Approval waiter already registered for requestId ${requestId}`));
    }
    if (!existing) this.clearTombstone(requestId);

    return new Promise<ApprovalResponse>((resolvePromise) => {
      const effectiveApprovalAnomalyNotice = approvalAnomalyNotice ?? existing?.approvalAnomalyNotice;
      const createdAt = existing?.createdAt ?? this.now();
      this.pending.set(requestId, {
        taskId,
        summary,
        ...(effectiveApprovalAnomalyNotice !== undefined
          ? { approvalAnomalyNotice: effectiveApprovalAnomalyNotice }
          : {}),
        hasRealWaiter: true,
        resolve: resolvePromise,
        createdAt,
      });
      this.scheduleExpiry(requestId, createdAt);
    });
  }

  /**
   * Resolve the pending approval, waking whatever waiter (real or
   * placeholder) is registered for it. Returns `false` without effect if no
   * pending approval exists for `requestId`, including when it existed but
   * has passed its `timeoutMs` deadline: an expired approval is invalidated
   * (purged) rather than honored, so a late or replayed decision can never
   * resolve it (see #3736). Callers MUST branch on the return value rather
   * than assuming success once `has()` was true, since expiry can be
   * crossed between that check and this call.
   */
  resolve(requestId: string, response: ApprovalResponse): boolean {
    const pending = this.pending.get(requestId);
    if (!pending) return false;
    if (this.isEntryExpired(pending)) {
      this.purgeExpiredEntry(requestId);
      return false;
    }
    this.pending.delete(requestId);
    this.clearExpiryTimer(requestId);
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
    this.clearExpiryTimer(requestId);
    const earlyResponse = this.resolvedBeforeWaiter.get(requestId);
    const deletedEarlyResponse = this.resolvedBeforeWaiter.delete(requestId);
    if (earlyResponse) clearTimeout(earlyResponse.expiry);
    return deletedPending || deletedEarlyResponse;
  }

  private isEntryExpired(entry: PendingApproval): boolean {
    return this.now() - entry.createdAt >= this.timeoutMs;
  }

  /** Looks up `requestId`, evicting (and returning `undefined`) if expired. */
  private evictIfExpired(requestId: string): PendingApproval | undefined {
    const entry = this.pending.get(requestId);
    if (!entry) return undefined;
    if (this.isEntryExpired(entry)) {
      this.purgeExpiredEntry(requestId);
      return undefined;
    }
    return entry;
  }

  /** Sweeps every pending entry, purging any that have passed their TTL. */
  private pruneExpired(): void {
    for (const [requestId, entry] of this.pending) {
      if (this.isEntryExpired(entry)) {
        this.purgeExpiredEntry(requestId);
      }
    }
  }

  /** Removes an expired `pending` entry and records its expiry tombstone. */
  private purgeExpiredEntry(requestId: string): void {
    this.pending.delete(requestId);
    this.clearExpiryTimer(requestId);
    this.markExpired(requestId);
  }

  private clearExpiryTimer(requestId: string): void {
    const timer = this.expiryTimers.get(requestId);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimers.delete(requestId);
    }
  }

  private markExpired(requestId: string): void {
    if (this.expiredTombstones.has(requestId)) return;
    const timer = setTimeout(() => {
      this.expiredTombstones.delete(requestId);
    }, ApprovalWaiterRegistry.EXPIRED_TOMBSTONE_TTL_MS);
    timer.unref?.();
    this.expiredTombstones.set(requestId, timer);
  }

  private clearTombstone(requestId: string): void {
    const timer = this.expiredTombstones.get(requestId);
    if (timer) {
      clearTimeout(timer);
      this.expiredTombstones.delete(requestId);
    }
  }

  /**
   * Actively purges an entry once its TTL elapses, even if nothing ever
   * accesses the registry again (closing the unbounded-growth gap in
   * #3751). Lazy eviction above (`has`, `get`, `resolve`, ...) covers the
   * case where an entry is *accessed* after expiry; this timer covers the
   * case where it never is.
   */
  private scheduleExpiry(requestId: string, createdAt: number): void {
    this.clearExpiryTimer(requestId);
    const remaining = Math.max(0, this.timeoutMs - (this.now() - createdAt));
    const timer = setTimeout(() => {
      this.expiryTimers.delete(requestId);
      const entry = this.pending.get(requestId);
      if (entry && this.isEntryExpired(entry)) {
        this.pending.delete(requestId);
        this.markExpired(requestId);
      }
    }, remaining);
    timer.unref?.();
    this.expiryTimers.set(requestId, timer);
  }
}
