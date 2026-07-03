import { describe, it, expect, afterEach } from 'vitest';
import { createAuditSink, createCentralOptions, DEFAULT_AUDIT_SESSION_ID } from './central-enforcement.js';
import type { ObserverAdapter, ObserverLogInput } from '../adapters/observer-adapter.js';

describe('createAuditSink', () => {
  const prev = process.env['FBEAST_SESSION_ID'];
  afterEach(() => {
    if (prev === undefined) delete process.env['FBEAST_SESSION_ID'];
    else process.env['FBEAST_SESSION_ID'] = prev;
  });

  it('logs a tool_call audit event through the observer', async () => {
    process.env['FBEAST_SESSION_ID'] = 'sess-123';
    const logged: ObserverLogInput[] = [];
    const observer: ObserverAdapter = {
      async log(input) { logged.push(input); return { id: 1, hash: 'h' }; },
      async logCost() {},
      async cost() { return { totalPromptTokens: 0, totalCompletionTokens: 0, totalCostUsd: 0, byModel: [] }; },
      async trail() { return []; },
    };

    const sink = createAuditSink(observer);
    await sink.record({ tool: 'fbeast_memory_forget', ok: false });

    expect(logged).toHaveLength(1);
    expect(logged[0]!.event).toBe('tool_call');
    expect(logged[0]!.sessionId).toBe('sess-123');
    expect(JSON.parse(logged[0]!.metadata)).toEqual({
      tool: 'fbeast_memory_forget',
      ok: false,
      source: 'central-dispatch',
    });
  });

  it('includes decision and args in the metadata when provided', async () => {
    process.env['FBEAST_SESSION_ID'] = 'sess-args';
    const logged: ObserverLogInput[] = [];
    const observer: ObserverAdapter = {
      async log(input) { logged.push(input); return { id: 1, hash: 'h' }; },
      async logCost() {},
      async cost() { return { totalPromptTokens: 0, totalCompletionTokens: 0, totalCostUsd: 0, byModel: [] }; },
      async trail() { return []; },
    };

    const sink = createAuditSink(observer);
    await sink.record({ tool: 'fbeast_memory_forget', ok: false, decision: 'denied', args: { key: 'prod-secret' } });

    expect(JSON.parse(logged[0]!.metadata)).toEqual({
      tool: 'fbeast_memory_forget',
      ok: false,
      source: 'central-dispatch',
      decision: 'denied',
      args: { key: 'prod-secret' },
    });
  });

  it('falls back to the retrievable constant session id when no env var is set', async () => {
    delete process.env['FBEAST_SESSION_ID'];
    delete process.env['CLAUDE_SESSION_ID'];
    const logged: ObserverLogInput[] = [];
    const observer: ObserverAdapter = {
      async log(input) { logged.push(input); return { id: 1, hash: 'h' }; },
      async logCost() {},
      async cost() { return { totalPromptTokens: 0, totalCompletionTokens: 0, totalCostUsd: 0, byModel: [] }; },
      async trail() { return []; },
    };

    const sink = createAuditSink(observer);
    await sink.record({ tool: 'a', ok: true });
    await sink.record({ tool: 'b', ok: true });

    expect(logged).toHaveLength(2);
    // Both records land under the same documented, queryable session id so
    // `fbeast_observer_trail` can retrieve the central trail.
    expect(logged[0]!.sessionId).toBe(DEFAULT_AUDIT_SESSION_ID);
    expect(logged[1]!.sessionId).toBe(DEFAULT_AUDIT_SESSION_ID);
  });

  it('does not open a database until first record (lazy from dbPath)', () => {
    expect(() => createAuditSink('/nonexistent/should/not/open.db')).not.toThrow();
  });
});

describe('createCentralOptions', () => {
  it('bundles a governance gate and an audit sink without opening a DB eagerly', () => {
    const opts = createCentralOptions('/nonexistent/should/not/open.db');
    expect(opts.governance).toBeDefined();
    expect(opts.audit).toBeDefined();
  });
});
