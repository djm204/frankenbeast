import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCodexAppServerRequest } from '../../../src/runtime/codex/codex-app-server-client.js';
import { CodexRuntimeAdapter } from '../../../src/runtime/codex/codex-runtime-adapter.js';

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('CodexRuntimeAdapter', () => {
  it('uses the documented initialized app-server request sequence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codex-app-server-'));
    tempPaths.push(directory);
    const command = join(directory, 'codex-protocol.cjs');
    await writeFile(command, `#!/usr/bin/env node
const readline = require('node:readline');
const input = readline.createInterface({ input: process.stdin });
let initialized = false;
input.on('line', (line) => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') {
    process.stdout.write(JSON.stringify({ id: message.id, result: {
      codexHome: '/isolated/codex', platformFamily: 'unix', platformOs: 'linux', userAgent: 'test'
    } }) + '\\n');
  } else if (message.method === 'initialized') {
    initialized = true;
  } else if (message.method === 'thread/list' && initialized) {
    process.stdout.write(JSON.stringify({ id: message.id, result: { data: [], nextCursor: null } }) + '\\n');
  } else if (message.id !== undefined) {
    process.stdout.write(JSON.stringify({ id: message.id, error: { code: -32000, message: 'not initialized' } }) + '\\n');
  }
});
`);
    await chmod(command, 0o700);

    const request = createCodexAppServerRequest({ command, env: { PATH: process.env['PATH'] ?? '' } });

    await expect(request('thread/list', { limit: 1 }, { timeoutMs: 2_000 })).resolves.toEqual({
      data: [],
      nextCursor: null,
    });
  });

  it('cancels an in-flight app-server read through AbortSignal', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codex-app-server-hang-'));
    tempPaths.push(directory);
    const command = join(directory, 'codex-hang.cjs');
    await writeFile(command, '#!/usr/bin/env node\nsetInterval(() => {}, 1000);\n');
    await chmod(command, 0o700);
    const request = createCodexAppServerRequest({ command, env: { PATH: process.env['PATH'] ?? '' } });
    const controller = new AbortController();

    const pending = request('thread/list', { limit: 1 }, {
      signal: controller.signal,
      timeoutMs: 100,
    });
    controller.abort(new Error('operator cancelled'));

    await expect(pending).rejects.toThrow('operator cancelled');
  });

  it('propagates snapshot cancellation instead of misreporting provider health', async () => {
    const controller = new AbortController();
    const adapter = new CodexRuntimeAdapter({
      request: async (_method, _params, options) => await new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
      }),
    });

    const pending = adapter.getSnapshot({ signal: controller.signal });
    controller.abort(new Error('snapshot cancelled'));

    await expect(pending).rejects.toThrow('snapshot cancelled');
  });

  it('reports unavailable health and only observable read capabilities when Codex cannot be reached', async () => {
    const request = vi.fn(async () => {
      throw new Error('spawn /home/alice/bin/codex ENOENT token=secret-value');
    });
    const adapter = new CodexRuntimeAdapter({
      now: () => new Date('2026-07-26T12:00:00.000Z'),
      request,
    });

    await expect(adapter.describe()).resolves.toEqual({
      id: 'codex',
      runtime: 'codex',
      displayName: 'Codex',
      health: {
        state: 'unavailable',
        checkedAt: '2026-07-26T12:00:00.000Z',
        message: 'Codex app-server is unavailable',
      },
      capabilities: {
        snapshot: { status: 'supported' },
        streaming: { status: 'supported' },
        logs: { status: 'unsupported', reason: 'Codex thread metadata does not expose bounded canonical logs' },
        blockers: { status: 'unsupported', reason: 'Codex thread metadata has no canonical blocker topology' },
        approvals: { status: 'unsupported', reason: 'The Codex adapter does not observe durable approval state' },
        pause: { status: 'unsupported', reason: 'The Codex adapter is read-only' },
        resume: { status: 'unsupported', reason: 'The Codex adapter is read-only' },
        cancellation: { status: 'unsupported', reason: 'The Codex adapter is read-only' },
        policyActions: { status: 'unsupported', reason: 'The Codex adapter is read-only' },
      },
    });
    expect(request).toHaveBeenCalledWith(
      'thread/list',
      expect.objectContaining({ limit: 1, useStateDbOnly: true }),
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
  });

  it('distinguishes incompatible app-server responses from connection failures', async () => {
    const adapter = new CodexRuntimeAdapter({
      now: () => new Date('2026-07-26T12:00:00.000Z'),
      request: async () => ({ data: 'not-an-array' }),
    });

    await expect(adapter.describe()).resolves.toEqual(expect.objectContaining({
      health: {
        state: 'schema-incompatible',
        checkedAt: '2026-07-26T12:00:00.000Z',
        message: 'Codex app-server returned incompatible thread metadata',
      },
    }));
    await expect(adapter.getSnapshot()).resolves.toEqual(expect.objectContaining({
      state: 'schema-incompatible',
      message: 'Codex app-server returned incompatible thread metadata',
    }));
  });

  it('degrades safely when individual thread metadata is outside the documented schema', async () => {
    const adapter = new CodexRuntimeAdapter({
      request: async () => ({
        data: [{
          id: 'thread-unknown-status', sessionId: 'session-1', cliVersion: '0.145.0',
          createdAt: 1_785_081_400, updatedAt: 1_785_081_660,
          cwd: '/workspace/project', ephemeral: false, modelProvider: 'openai',
          status: { type: 'secret-status-value' },
        }],
      }),
    });

    const snapshot = await adapter.getSnapshot();

    expect(snapshot.state).toBe('degraded');
    expect(snapshot.message).toBe('Some Codex thread metadata was incompatible');
    expect(snapshot.agents).toEqual({ status: 'available', data: [] });
    expect(JSON.stringify(snapshot)).not.toContain('secret-status-value');
  });

  it('maps bounded thread metadata without exposing prompts, host paths, or fabricated task semantics', async () => {
    const request = vi.fn(async () => ({
      data: [{
        id: '0198-thread-0001',
        sessionId: '0198-session-0001',
        cliVersion: '0.145.0',
        createdAt: 1_785_081_600,
        updatedAt: 1_785_081_660,
        cwd: '/home/alice/private-repo',
        ephemeral: false,
        modelProvider: 'openai',
        preview: 'Authorization: Bearer super-secret raw prompt',
        name: 'API_KEY=top-secret private task',
        source: 'cli',
        status: { type: 'active', activeFlags: [] },
        turns: [],
      }],
      nextCursor: null,
    }));
    const controller = new AbortController();
    const adapter = new CodexRuntimeAdapter({
      now: () => new Date('2026-07-26T12:00:00.000Z'),
      request,
    });

    const snapshot = await adapter.getSnapshot({ activityLimit: 25, signal: controller.signal });

    expect(snapshot.state).toBe('ready');
    expect(snapshot.workspaces).toEqual({
      status: 'available',
      data: [expect.objectContaining({
        id: expect.stringMatching(/^codex:workspace:[a-f0-9]{16}$/),
        name: expect.stringMatching(/^Codex workspace [a-f0-9]{8}$/),
        kind: 'project',
        state: 'available',
      })],
    });
    if (snapshot.workspaces.status !== 'available') throw new Error('Expected workspaces');
    const workspaceId = snapshot.workspaces.data[0]!.id;
    expect(snapshot.agents).toEqual({
      status: 'available',
      data: [expect.objectContaining({
        id: 'codex:thread:0198-thread-0001',
        workspaceId,
        displayName: 'Codex thread 0001',
        state: 'running',
        lastActiveAt: '2026-07-26T16:01:00.000Z',
        metadata: {
          cliVersion: '0.145.0',
          ephemeral: false,
          modelProvider: 'openai',
          sessionId: '0198-session-0001',
        },
      })],
    });
    expect(snapshot.tasks).toEqual({
      status: 'unsupported',
      reason: 'Codex threads do not expose a canonical task graph',
    });
    expect(snapshot.runs).toEqual({
      status: 'unsupported',
      reason: 'Codex thread metadata does not expose canonical task-linked runs',
    });
    expect(snapshot.blockers.status).toBe('unsupported');
    expect(snapshot.approvals.status).toBe('unsupported');
    expect(JSON.stringify(snapshot)).not.toContain('/home/alice');
    expect(JSON.stringify(snapshot)).not.toContain('super-secret');
    expect(JSON.stringify(snapshot)).not.toContain('top-secret');
    expect(request).toHaveBeenCalledWith(
      'thread/list',
      expect.objectContaining({
        limit: 25,
        sortKey: 'updated_at',
        sortDirection: 'desc',
        useStateDbOnly: true,
      }),
      expect.objectContaining({ signal: controller.signal, timeoutMs: expect.any(Number) }),
    );
  });

  it('provides stable bounded event polling and rejects malformed cursors', async () => {
    const threads = [
      {
        id: 'thread-b', sessionId: 'session-b', cliVersion: '0.145.0',
        createdAt: 1_785_081_500, updatedAt: 1_785_081_660,
        cwd: '/workspace/project', ephemeral: false, modelProvider: 'openai',
        preview: '', source: 'cli', status: { type: 'idle' }, turns: [],
      },
      {
        id: 'thread-a', sessionId: 'session-a', cliVersion: '0.145.0',
        createdAt: 1_785_081_400, updatedAt: 1_785_081_660,
        cwd: '/workspace/project', ephemeral: false, modelProvider: 'openai',
        preview: '', source: 'cli', status: { type: 'active', activeFlags: [] }, turns: [],
      },
    ];
    const request = vi.fn(async () => ({ data: threads, nextCursor: null }));
    const adapter = new CodexRuntimeAdapter({ request });

    await expect(adapter.getEvents({ cursor: 'malformed' })).rejects.toMatchObject({
      code: 'INVALID_CURSOR',
    });
    expect(request).not.toHaveBeenCalled();

    const first = await adapter.getEvents({ limit: 1 });
    expect(first.events.map((event) => event.id)).toEqual([
      'codex:thread:thread-a:1785081660',
    ]);
    expect(first.nextCursor).toBe(first.events[0]!.cursor);

    const second = await adapter.getEvents({ cursor: first.nextCursor!, limit: 1 });
    expect(second.events.map((event) => event.id)).toEqual([
      'codex:thread:thread-b:1785081660',
    ]);
    expect(second.nextCursor).toBe(second.events[0]!.cursor);
    expect(request).toHaveBeenLastCalledWith(
      'thread/list',
      expect.objectContaining({ limit: 500, useStateDbOnly: true }),
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
  });
});
