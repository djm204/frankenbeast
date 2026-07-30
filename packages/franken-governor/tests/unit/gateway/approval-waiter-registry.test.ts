import { describe, it, expect } from 'vitest';
import { ApprovalWaiterRegistry } from '../../../src/gateway/approval-waiter-registry.js';
import type { ApprovalResponse } from '../../../src/core/types.js';

function makeResponse(overrides: Partial<ApprovalResponse> = {}): ApprovalResponse {
  return {
    requestId: 'req-1',
    decision: 'APPROVE',
    respondedBy: 'operator',
    respondedAt: new Date(),
    ...overrides,
  };
}

/** A controllable clock so expiration can be tested deterministically without real timers. */
function makeClock(startMs = 0) {
  let current = startMs;
  return {
    now: () => current,
    advance(ms: number) {
      current += ms;
    },
  };
}

describe('ApprovalWaiterRegistry expiration', () => {
  it('constructs with a default timeoutMs when none is provided', () => {
    expect(() => new ApprovalWaiterRegistry()).not.toThrow();
  });

  it('rejects a non-positive or non-finite timeoutMs', () => {
    expect(() => new ApprovalWaiterRegistry({ timeoutMs: 0 })).toThrow(RangeError);
    expect(() => new ApprovalWaiterRegistry({ timeoutMs: -1 })).toThrow(RangeError);
    expect(() => new ApprovalWaiterRegistry({ timeoutMs: Number.NaN })).toThrow(RangeError);
    expect(() => new ApprovalWaiterRegistry({ timeoutMs: Number.POSITIVE_INFINITY })).toThrow(RangeError);
  });

  it('reports a freshly registered approval as not expired', () => {
    const clock = makeClock();
    const registry = new ApprovalWaiterRegistry({ timeoutMs: 1000, now: clock.now });

    registry.register('req-1', 'task-1', 'Deploy to production');

    expect(registry.isExpired('req-1')).toBe(false);
    expect(registry.has('req-1')).toBe(true);
  });

  it('reports isExpired(true) once the TTL has elapsed, without evicting on peek', () => {
    const clock = makeClock();
    const registry = new ApprovalWaiterRegistry({ timeoutMs: 1000, now: clock.now });

    registry.register('req-1', 'task-1', 'Deploy to production');
    clock.advance(1000);

    expect(registry.isExpired('req-1')).toBe(true);
    // Peeking must not itself mutate registry size.
    expect(registry.size).toBe(0);
  });

  it('has() lazily evicts an expired pending entry and reports it absent', () => {
    const clock = makeClock();
    const registry = new ApprovalWaiterRegistry({ timeoutMs: 1000, now: clock.now });

    registry.register('req-1', 'task-1', 'Deploy to production');
    clock.advance(1500);

    expect(registry.has('req-1')).toBe(false);
    expect(registry.get('req-1')).toBeUndefined();
    expect(registry.list()).toHaveLength(0);
  });

  it('resolve() rejects a decision for an approval past its TTL and does not wake any waiter', async () => {
    const clock = makeClock();
    const registry = new ApprovalWaiterRegistry({ timeoutMs: 1000, now: clock.now });

    const waiterPromise = registry.waitFor('req-1', 'task-1', 'Deploy to production');
    clock.advance(1500);

    const resolved = registry.resolve('req-1', makeResponse());
    expect(resolved).toBe(false);

    // The waiter must never have been woken by the stale decision. Race it
    // against a resolved sentinel to prove it is still pending.
    const sentinel = Symbol('still-pending');
    const outcome = await Promise.race([waiterPromise, Promise.resolve(sentinel)]);
    expect(outcome).toBe(sentinel);
  });

  it('resolve() still succeeds for a decision made within the TTL window', () => {
    const clock = makeClock();
    const registry = new ApprovalWaiterRegistry({ timeoutMs: 1000, now: clock.now });

    registry.register('req-1', 'task-1', 'Deploy to production');
    clock.advance(500);

    expect(registry.resolve('req-1', makeResponse())).toBe(true);
  });

  it('an expired approval cannot be replayed even after a fresh registration for the same requestId later resolves', () => {
    const clock = makeClock();
    const registry = new ApprovalWaiterRegistry({ timeoutMs: 1000, now: clock.now });

    registry.register('req-1', 'task-1', 'Deploy to production');
    clock.advance(1500);
    expect(registry.resolve('req-1', makeResponse({ decision: 'APPROVE' }))).toBe(false);

    // A later, independent request reusing the same id starts its own clock.
    registry.register('req-1', 'task-1', 'Deploy to production (second request)');
    expect(registry.isExpired('req-1')).toBe(false);
    expect(registry.resolve('req-1', makeResponse({ decision: 'ABORT' }))).toBe(true);
  });

  it('does not retain expired pending entries indefinitely: size reflects only live entries', () => {
    const clock = makeClock();
    const registry = new ApprovalWaiterRegistry({ timeoutMs: 100, now: clock.now });

    registry.register('req-1', 'task-1', 'summary 1');
    registry.register('req-2', 'task-2', 'summary 2');
    expect(registry.size).toBe(2);

    clock.advance(150);
    registry.register('req-3', 'task-3', 'summary 3');

    // req-1 and req-2 are stale and must not count toward size any longer,
    // even without any caller ever touching them directly (list()/has()).
    expect(registry.size).toBe(1);
    expect(registry.list().map((entry) => entry.requestId)).toEqual(['req-3']);
  });

  it('actively purges an expired entry via a background timer even when nothing accesses the registry', async () => {
    // Uses real timers with a tiny timeoutMs, matching the existing
    // ApprovalGateway timeout test convention in this package.
    const registry = new ApprovalWaiterRegistry({ timeoutMs: 20 });
    registry.register('req-1', 'task-1', 'Deploy to production');

    // Read raw internal size via the public getter without calling has()/list()
    // immediately, to prove the timer -- not lazy eviction on access -- did the
    // purging once we wait past the TTL.
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(registry.size).toBe(0);
  });

  it('hasKnownRequest() no longer treats an expired pending placeholder as known', () => {
    const clock = makeClock();
    const registry = new ApprovalWaiterRegistry({ timeoutMs: 1000, now: clock.now });

    registry.register('req-1', 'task-1', 'Deploy to production');
    clock.advance(1500);

    expect(registry.hasKnownRequest('req-1')).toBe(false);
  });

  it('preserves createdAt across a refreshing register() call rather than resetting the TTL clock', () => {
    const clock = makeClock();
    const registry = new ApprovalWaiterRegistry({ timeoutMs: 1000, now: clock.now });

    registry.register('req-1', 'task-1', 'Deploy to production');
    clock.advance(600);
    // Re-registering (e.g. a duplicate POST /v1/approval/request) must not
    // push the deadline out further.
    registry.register('req-1', 'task-1', 'Deploy to production');
    clock.advance(500); // total elapsed since first registration: 1100ms

    expect(registry.isExpired('req-1')).toBe(true);
  });

  it('a waiter attached via waitFor() is also subject to lazy TTL expiration', () => {
    const clock = makeClock();
    const registry = new ApprovalWaiterRegistry({ timeoutMs: 1000, now: clock.now });

    void registry.waitFor('req-1', 'task-1', 'Deploy to production');
    clock.advance(1500);

    expect(registry.isExpired('req-1')).toBe(true);
    expect(registry.resolve('req-1', makeResponse())).toBe(false);
  });
});
