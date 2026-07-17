import { describe, expect, it, vi } from 'vitest';

import { ConsoleLogger } from '../packages/franken-orchestrator/src/logger.js';
import { HttpError, errorHandler } from '../packages/franken-orchestrator/src/http/middleware.js';
import { createMemoryServer } from '../packages/franken-mcp-suite/src/servers/memory.js';
import type { BrainAdapter } from '../packages/franken-mcp-suite/src/adapters/brain-adapter.js';
import { TraceContext } from '../packages/franken-observer/src/core/TraceContext.js';
import { SpanLifecycle } from '../packages/franken-observer/src/core/SpanLifecycle.js';
import { InMemoryAdapter } from '../packages/franken-observer/src/export/InMemoryAdapter.js';

const githubToken = ['ghp', '_', 'A'.repeat(36)].join('');
const discordWebhook = [
  'https://',
  'discord.com',
  '/api/webhooks/',
  '1'.repeat(18),
  '/',
  'a'.repeat(68),
].join('');
const npmToken = ['npm', '_', 'b'.repeat(36)].join('');
const databaseUrl = ['postgres://agent:', 'c'.repeat(24), '@db.internal:5432/app'].join('');
const cookieHeader = ['Cookie: session=', 'd'.repeat(32), '; csrf=', 'e'.repeat(32)].join('');
const bearerToken = ['Bearer ', 'f'.repeat(48)].join('');

const fixtures = [
  { name: 'github-token', value: githubToken },
  { name: 'discord-webhook', value: discordWebhook },
  { name: 'npm-token', value: npmToken },
  { name: 'database-url', value: databaseUrl },
  { name: 'cookie-header', value: cookieHeader },
  { name: 'bearer-token', value: bearerToken },
] as const;

function assertNoFixtureLeak(surface: string, value: unknown): void {
  const rendered = typeof value === 'string' ? value : JSON.stringify(value);
  for (const fixture of fixtures) {
    if (rendered.includes(fixture.value)) {
      throw new Error(`${surface} leaked ${fixture.name}`);
    }
  }
}

function createBrainStub(overrides: Partial<BrainAdapter> = {}): BrainAdapter {
  return {
    query: vi.fn().mockResolvedValue([]),
    store: vi.fn().mockResolvedValue(undefined),
    frontload: vi.fn().mockResolvedValue([]),
    exportProjectMemory: vi.fn().mockResolvedValue({
      version: 1,
      exportedAt: '2026-07-17T00:00:00.000Z',
      scope: { readScope: 'all' },
      redaction: 'safe',
      counts: { working: 0, episodic: 0 },
      working: [],
      episodic: [],
    }),
    forget: vi.fn().mockResolvedValue(false),
    rightToForget: vi.fn().mockResolvedValue({
      selectorHash: 'selector-hash',
      dryRun: false,
      deleted: { working: 0, episodic: 0, derived: 0 },
      remainingReferences: 0,
    }),
    proposeMemory: vi.fn().mockResolvedValue({
      id: 'memcand_secret_fixture',
      targetStore: 'working',
      key: 'fixture-redaction-check',
      value: 'redacted by test helper',
      source: 'fbeast_memory_store:quarantine',
      confidence: 1,
      reason: 'Sensitive memory quarantined for operator review (value-shape-indicates-secret).',
      status: 'pending',
      createdAt: '2026-07-17T00:00:00.000Z',
      updatedAt: '2026-07-17T00:00:00.000Z',
    }),
    listMemoryReview: vi.fn().mockResolvedValue([]),
    memoryAttribution: vi.fn().mockResolvedValue([]),
    conflictsForMemoryReview: vi.fn().mockResolvedValue([]),
    decideMemoryReview: vi.fn(),
    ...overrides,
  };
}

describe('secret redaction regression harness', () => {
  it('redacts representative secret fixtures from structured and text logs', () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = new ConsoleLogger({ verbose: true });

    logger.debug(`runtime credentials ${cookieHeader} ${bearerToken}`, {
      githubToken,
      discordWebhook,
      npmToken,
      databaseUrl,
    });

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(output).toContain('<redacted>');
    assertNoFixtureLeak('logger', output);
  });

  it('quarantines representative secret fixtures before memory persistence or display', async () => {
    for (const fixture of fixtures) {
      const brain = createBrainStub();
      const server = createMemoryServer({ brain });

      const result = await server.callTool('fbeast_memory_store', {
        key: `redaction-fixture-${fixture.name}`,
        value: fixture.value,
        type: 'working',
      });

      expect(brain.store, fixture.name).not.toHaveBeenCalled();
      expect(brain.proposeMemory, fixture.name).toHaveBeenCalled();
      assertNoFixtureLeak(`memory ${fixture.name}`, result.content[0]?.text ?? '');
    }
  });

  it('redacts representative secret fixtures before trace persistence and query display', async () => {
    const adapter = new InMemoryAdapter();
    const trace = TraceContext.createTrace(`goal ${databaseUrl}`);
    const span = TraceContext.startSpan(trace, { name: 'redaction-check' });
    SpanLifecycle.setMetadata(span, {
      githubToken,
      discordWebhook,
      npmToken,
      databaseUrl,
      cookieHeader,
      bearerToken,
    });
    SpanLifecycle.addThoughtBlock(span, `thought ${discordWebhook} ${bearerToken}`);
    TraceContext.endSpan(span, { status: 'error', errorMessage: `failed with ${databaseUrl}` });
    TraceContext.endTrace(trace);

    await adapter.flush(trace);
    const persisted = await adapter.queryByTraceId(trace.id);

    expect(JSON.stringify(persisted)).toContain('<redacted>');
    assertNoFixtureLeak('trace persistence', persisted);
  });

  it('redacts representative secret fixtures from HTTP error responses and logs', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = vi.fn((payload: unknown, status: number) => ({ payload, status }));
    const context = { json: response };

    errorHandler(
      new HttpError(400, 'BAD_REQUEST', `bad input ${bearerToken}`, {
        callback: discordWebhook,
        databaseUrl,
        cookieHeader,
        githubToken,
        npmToken,
      }),
      context as never,
    );

    expect(response).toHaveBeenCalledTimes(1);
    const payload = response.mock.calls[0]?.[0];
    const logOutput = warnSpy.mock.calls.map(call => call.join(' ')).join('\n');
    assertNoFixtureLeak('http error response', payload);
    assertNoFixtureLeak('http error log', logOutput);
  });
});
