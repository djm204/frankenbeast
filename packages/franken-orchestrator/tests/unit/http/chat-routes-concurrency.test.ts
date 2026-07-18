import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createChatApp } from '../../../src/http/chat-app.js';
import { ChatMutationAdmission } from '../../../src/http/chat-rate-limit.js';
import { FileSessionStore } from '../../../src/chat/session-store.js';
import { InMemoryRateLimiter } from '../../../src/beasts/http/beast-rate-limit.js';
import type { ChatRuntimeState } from '../../../src/chat/runtime.js';
import type { TranscriptMessage } from '../../../src/chat/types.js';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('ChatMutationAdmission concurrency', () => {
  it('queues mutations for the same session instead of rejecting overlap', async () => {
    const admission = new ChatMutationAdmission(new InMemoryRateLimiter({ windowMs: 60_000, max: 10 }));
    const firstRunStarted = deferred();
    const releaseFirstRun = deferred();
    const order: string[] = [];

    const first = admission.runExclusive('session-1', async () => {
      order.push('first:start');
      firstRunStarted.resolve();
      await releaseFirstRun.promise;
      order.push('first:end');
      return 'first';
    });
    await firstRunStarted.promise;

    const second = admission.runExclusive('session-1', async () => {
      order.push('second:start');
      order.push('second:end');
      return 'second';
    });

    await Promise.resolve();
    expect(order).toEqual(['first:start']);
    expect(admission.begin('session-1')).toBe(false);

    releaseFirstRun.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('waits for begin/end guarded turns before running queued mutations', async () => {
    const admission = new ChatMutationAdmission(new InMemoryRateLimiter({ windowMs: 60_000, max: 10 }));
    const order: string[] = [];

    expect(admission.begin('session-1')).toBe(true);
    const queued = admission.runExclusive('session-1', async () => {
      order.push('queued');
      return 'queued';
    });

    await Promise.resolve();
    expect(order).toEqual([]);

    admission.end('session-1');
    await expect(queued).resolves.toBe('queued');
    expect(order).toEqual(['queued']);
  });
});

describe('chat message route concurrency', () => {
  let sessionStoreDir: string;
  let sessionStore: FileSessionStore;

  beforeEach(() => {
    sessionStoreDir = mkdtempSync(join(tmpdir(), 'franken-chat-message-concurrency-'));
    sessionStore = new FileSessionStore(sessionStoreDir);
  });

  afterEach(() => {
    rmSync(sessionStoreDir, { recursive: true, force: true });
  });

  it('serializes concurrent submissions for the same session instead of losing a write', async () => {
    const firstRunStarted = deferred();
    const releaseFirstRun = deferred();
    const runtime = {
      run: vi.fn(async (input: string, state: ChatRuntimeState) => {
        if (input === 'first') {
          firstRunStarted.resolve();
          await releaseFirstRun.promise;
        }

        const now = new Date().toISOString();
        const transcript: TranscriptMessage[] = [
          ...state.transcript,
          { role: 'user', content: input, timestamp: now },
          { role: 'assistant', content: `reply to ${input}`, timestamp: now, modelTier: 'cheap' },
        ];

        return {
          displayMessages: [{ kind: 'reply' as const, content: `reply to ${input}` }],
          events: [],
          pendingApproval: false,
          state: 'active',
          tier: 'cheap',
          transcript,
          beastContext: null,
        };
      }),
    };
    const app = createChatApp({
      sessionStore,
      engine: {} as never,
      runtime: runtime as never,
      turnRunner: {} as never,
      chatRateLimit: { windowMs: 60_000, max: 10 },
    });
    const session = sessionStore.create('project-1');

    const firstResponsePromise = app.request(`/v1/chat/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'first' }),
    });
    await firstRunStarted.promise;

    const secondResponsePromise = app.request(`/v1/chat/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'second' }),
    });

    releaseFirstRun.resolve();
    const [firstResponse, secondResponse] = await Promise.all([firstResponsePromise, secondResponsePromise]);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(runtime.run).toHaveBeenCalledTimes(2);
    expect(runtime.run.mock.calls[1]?.[1].transcript.map((message: TranscriptMessage) => message.content)).toEqual([
      'first',
      'reply to first',
    ]);
    expect(sessionStore.get(session.id)?.transcript.map((message) => message.content)).toEqual([
      'first',
      'reply to first',
      'second',
      'reply to second',
    ]);
  });
});
