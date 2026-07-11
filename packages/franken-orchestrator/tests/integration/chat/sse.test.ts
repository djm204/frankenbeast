import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createChatApp } from '../../../src/http/chat-app.js';
import { TurnRunner, type TurnEvent } from '../../../src/chat/turn-runner.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TMP = join(__dirname, '__fixtures__/sse-chat');

describe('SSE Streaming', () => {
  let app: ReturnType<typeof createChatApp>;
  let turnRunner: TurnRunner;

  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
    const executor = {
      execute: vi.fn().mockResolvedValue({
        status: 'success' as const,
        summary: 'Done',
        filesChanged: [],
        testsRun: 0,
        errors: [],
      }),
    };
    turnRunner = new TurnRunner(executor);
    app = createChatApp({
      sessionStoreDir: TMP,
      llm: { complete: vi.fn().mockResolvedValue('Mock reply') },
      projectName: 'test-project',
      turnRunner,
    });
  });

  afterEach(() => {
    turnRunner.removeAllListeners();
    rmSync(TMP, { recursive: true, force: true });
  });

  async function createSession(): Promise<string> {
    const res = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj' }),
    });
    const { data } = (await res.json()) as { data: { id: string } };
    return data.id;
  }

  function emitAfterDelay(events: TurnEvent[], delayMs = 50): void {
    const runner = turnRunner; // snapshot to avoid closure-over-variable bug
    setTimeout(() => {
      for (const event of events) {
        runner.emit('event', event);
      }
    }, delayMs);
  }

  it('returns text/event-stream content type', async () => {
    const sessionId = await createSession();
    emitAfterDelay([{ type: 'complete', sessionId, data: { status: 'done' } }]);
    const res = await app.request(`/v1/chat/sessions/${sessionId}/stream`);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
  });

  it('returns 404 for unknown session', async () => {
    const res = await app.request('/v1/chat/sessions/nonexistent/stream');
    expect(res.status).toBe(404);
  });

  it('sends connected event with session ID', async () => {
    const sessionId = await createSession();
    emitAfterDelay([{ type: 'complete', sessionId, data: { status: 'done' } }]);
    const res = await app.request(`/v1/chat/sessions/${sessionId}/stream`);
    const text = await res.text();
    expect(text).toContain('event: connected');
    expect(text).toContain(sessionId);
  });

  it('emits SSE events as valid JSON data lines', async () => {
    const sessionId = await createSession();
    emitAfterDelay([
      { type: 'start', sessionId, data: { taskDescription: 'test task' } },
      { type: 'complete', sessionId, data: { status: 'success' } },
    ]);
    const res = await app.request(`/v1/chat/sessions/${sessionId}/stream`);
    const text = await res.text();

    const dataLines = text.split('\n').filter((l: string) => l.startsWith('data:'));
    expect(dataLines.length).toBeGreaterThan(0);
    for (const line of dataLines) {
      const json = line.slice('data:'.length).trim();
      if (json) {
        expect(() => JSON.parse(json)).not.toThrow();
      }
    }
  });

  it('forwards TurnRunner events as SSE messages', async () => {
    const sessionId = await createSession();
    emitAfterDelay([
      { type: 'start', sessionId, data: { taskDescription: 'test' } },
      { type: 'progress', sessionId, data: { step: 1 } },
      { type: 'tool_use', sessionId, data: { tool: 'grep' } },
      { type: 'complete', sessionId, data: { status: 'success' } },
    ]);
    const res = await app.request(`/v1/chat/sessions/${sessionId}/stream`);
    const text = await res.text();
    expect(text).toContain('event: start');
    expect(text).toContain('event: progress');
    expect(text).toContain('event: tool_use');
    expect(text).toContain('event: complete');
  });

  it('includes retry directive in SSE stream', async () => {
    const sessionId = await createSession();
    emitAfterDelay([{ type: 'complete', sessionId, data: {} }]);
    const res = await app.request(`/v1/chat/sessions/${sessionId}/stream`);
    const text = await res.text();
    expect(text).toContain('retry:');
  });

  it('closes stream after complete event', async () => {
    const sessionId = await createSession();
    emitAfterDelay([
      { type: 'start', sessionId, data: { taskDescription: 'test' } },
      { type: 'complete', sessionId, data: { status: 'success' } },
    ]);
    const res = await app.request(`/v1/chat/sessions/${sessionId}/stream`);
    const text = await res.text();

    // Stream should end — res.text() resolves (doesn't hang)
    // The last event line should be the complete event
    const eventLines = text.split('\n').filter((l: string) => l.startsWith('event:'));
    expect(eventLines[eventLines.length - 1]).toContain('complete');
  });

  it('closes approval-request streams after the terminal event without leaking TurnRunner listeners', async () => {
    const sessionId = await createSession();
    emitAfterDelay([
      { type: 'approval_request', sessionId, data: { taskDescription: 'needs approval' } },
      { type: 'complete', sessionId, data: { status: 'pending_approval' } },
    ]);

    const res = await app.request(`/v1/chat/sessions/${sessionId}/stream`);
    const textPromise = res.text();

    await expect(Promise.race([
      textPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('SSE stream did not close')), 500)),
    ])).resolves.toContain('event: complete');

    expect(await textPromise).toContain('event: approval_request');
    expect(turnRunner.listenerCount('event')).toBe(0);
  });

  it('only forwards events for the requested session when two streams are open', async () => {
    const firstSessionId = await createSession();
    const secondSessionId = await createSession();

    const firstResponsePromise = app.request(`/v1/chat/sessions/${firstSessionId}/stream`);
    const secondResponsePromise = app.request(`/v1/chat/sessions/${secondSessionId}/stream`);

    emitAfterDelay([
      { type: 'start', sessionId: firstSessionId, data: { marker: 'first-start' } },
      { type: 'start', sessionId: secondSessionId, data: { marker: 'second-start' } },
      { type: 'progress', sessionId: firstSessionId, data: { marker: 'first-progress' } },
      { type: 'progress', sessionId: secondSessionId, data: { marker: 'second-progress' } },
      { type: 'complete', sessionId: firstSessionId, data: { marker: 'first-complete' } },
      { type: 'complete', sessionId: secondSessionId, data: { marker: 'second-complete' } },
    ]);

    const [firstResponse, secondResponse] = await Promise.all([firstResponsePromise, secondResponsePromise]);
    const [firstText, secondText] = await Promise.all([firstResponse.text(), secondResponse.text()]);

    expect(firstText).toContain(firstSessionId);
    expect(firstText).toContain('first-start');
    expect(firstText).toContain('first-progress');
    expect(firstText).toContain('first-complete');
    expect(firstText).not.toContain(secondSessionId);
    expect(firstText).not.toContain('second-start');
    expect(firstText).not.toContain('second-progress');
    expect(firstText).not.toContain('second-complete');

    expect(secondText).toContain(secondSessionId);
    expect(secondText).toContain('second-start');
    expect(secondText).toContain('second-progress');
    expect(secondText).toContain('second-complete');
    expect(secondText).not.toContain(firstSessionId);
    expect(secondText).not.toContain('first-start');
    expect(secondText).not.toContain('first-progress');
    expect(secondText).not.toContain('first-complete');
  });
});
