import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ConversationEngine } from '../../../src/chat/conversation-engine.js';
import { TurnRunner } from '../../../src/chat/turn-runner.js';
import { FileSessionStore } from '../../../src/chat/session-store.js';
import { createChatApp } from '../../../src/http/chat-app.js';
import type { Hono } from 'hono';

const TMP = join(__dirname, '__fixtures__/e2e-chat');

describe('Chat E2E', () => {
  let store: FileSessionStore;
  let engine: ConversationEngine;
  let runner: TurnRunner;

  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
    store = new FileSessionStore(TMP);
    engine = new ConversationEngine({
      llm: { complete: vi.fn().mockResolvedValue('Hello! How can I help?') },
      projectName: 'test',
    });
    runner = new TurnRunner({
      execute: vi.fn().mockResolvedValue({
        status: 'success',
        summary: 'Fixed',
        filesChanged: ['src/a.ts'],
        testsRun: 3,
        errors: [],
      }),
    });
  });

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('simple cheap chat round-trip — user sends greeting, gets cheap-model reply', async () => {
    const session = store.create('test-project');
    const result = await engine.processTurn('hello', session.transcript);

    expect(result.outcome.kind).toBe('reply');
    expect(result.tier).toBe('cheap');
    if (result.outcome.kind === 'reply') {
      expect(result.outcome.content).toBe('Hello! How can I help?');
    }
    expect(result.newMessages).toHaveLength(2); // user + assistant
  });

  it('code explanation without execution — technical question answered without file changes', async () => {
    const explainLlm = {
      complete: vi
        .fn()
        .mockResolvedValue(
          'A closure captures variables from its enclosing scope.',
        ),
    };
    const explainEngine = new ConversationEngine({
      llm: explainLlm,
      projectName: 'test',
    });

    const result = await explainEngine.processTurn(
      'What is a closure in JavaScript?',
      [],
    );

    // Technical questions may route to reply or clarify, not execute
    if (result.outcome.kind === 'reply') {
      expect(result.outcome.content).toContain('closure');
    }
    // No execution should happen for explanation requests
    expect(result.outcome.kind).not.toBe('execute');
  });

  it('fix failing test escalates to premium execution', async () => {
    const result = await engine.processTurn('fix the failing test in auth.ts', []);

    // Code fix requests should escalate to execute
    expect(result.outcome.kind).toBe('execute');
    expect(result.tier).toBe('premium_execution');
  });

  it('approval gate on destructive request — repo_action triggers approvalRequired', async () => {
    const result = await engine.processTurn('push to main', []);

    if (result.outcome.kind === 'execute') {
      expect(result.outcome.approvalRequired).toBe(true);

      const runResult = await runner.run(result.outcome);
      expect(runResult.status).toBe('pending_approval');
    } else {
      // If not execute, it should at least not silently proceed
      expect(['clarify', 'reply']).toContain(result.outcome.kind);
    }
  });

  it('CLI session resume after process restart — session persists to disk', async () => {
    const session = store.create('test-project');
    const sessionId = session.id;

    // Add transcript
    session.transcript.push({
      role: 'user',
      content: 'Hello',
      timestamp: new Date().toISOString(),
    });
    session.transcript.push({
      role: 'assistant',
      content: 'Hi there!',
      timestamp: new Date().toISOString(),
      modelTier: 'cheap',
    });
    store.save(session);

    // "Restart" — create new store from same directory, reload from disk
    const newStore = new FileSessionStore(TMP);
    const resumed = newStore.get(sessionId);
    expect(resumed).toBeDefined();
    expect(resumed!.transcript).toHaveLength(2);
    expect(resumed!.transcript[0]!.content).toBe('Hello');
    expect(resumed!.transcript[1]!.content).toBe('Hi there!');
    expect(resumed!.projectId).toBe('test-project');
  });

  it('web session resume after backend restart — session reloads via API', async () => {
    const sessionStoreDir = join(TMP, 'web-resume');
    mkdirSync(sessionStoreDir, { recursive: true });

    const app: Hono = createChatApp({
      sessionStoreDir,
      llm: { complete: vi.fn().mockResolvedValue('Backend reply') },
      projectName: 'test',
    });

    // Create session via API
    const createRes = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'test' }),
    });
    const { data: session } = (await createRes.json()) as {
      data: { id: string };
    };

    // Send a message to populate transcript
    await app.request(`/v1/chat/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'hello from web' }),
    });

    // "Restart" — create entirely new app from same store directory
    const newApp: Hono = createChatApp({
      sessionStoreDir,
      llm: { complete: vi.fn().mockResolvedValue('New backend reply') },
      projectName: 'test',
    });

    // Session should still be available
    const getRes = await newApp.request(
      `/v1/chat/sessions/${session.id}`,
    );
    expect(getRes.status).toBe(200);
    const { data: resumed } = (await getRes.json()) as {
      data: { transcript: Array<{ content: string }> };
    };
    expect(resumed.transcript.length).toBeGreaterThanOrEqual(1);
  });
});
