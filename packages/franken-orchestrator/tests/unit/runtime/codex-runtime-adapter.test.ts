import { createHash } from 'node:crypto';
import { spawn as spawnProcess } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCodexAppServerRequest } from '../../../src/runtime/codex/codex-app-server-client.js';
import { CodexRuntimeAdapter } from '../../../src/runtime/codex/codex-runtime-adapter.js';
import { createDefaultRuntimeAdapterRegistry } from '../../../src/runtime/runtime-defaults.js';

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('CodexRuntimeAdapter', () => {
  it('uses the documented initialized app-server request sequence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codex-app-server-'));
    tempPaths.push(directory);
    const command = join(directory, 'codex-protocol.cjs');
    const startFile = join(directory, 'starts.txt');
    await writeFile(command, `#!/usr/bin/env node
const fs = require('node:fs');
const readline = require('node:readline');
if (process.env.SHARED_ENV !== 'expected') process.exit(23);
fs.appendFileSync(process.env.START_FILE, '1');
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
    const payload = Buffer.from(JSON.stringify({ id: message.id, result: {
      data: [{ id: 'unicode', sessionId: 'session-unicode', cliVersion: 'test', createdAt: 1,
        updatedAt: 2, cwd: '/tmp/project', ephemeral: false, modelProvider: '模型', status: { type: 'idle' } }],
      nextCursor: null
    } }) + '\\n');
    const marker = Buffer.from('模型');
    const split = payload.indexOf(marker) + 1;
    process.stdout.write(payload.subarray(0, split));
    setTimeout(() => process.stdout.write(payload.subarray(split)), 5);
  } else if (message.id !== undefined) {
    process.stdout.write(JSON.stringify({ id: message.id, error: { code: -32000, message: 'not initialized' } }) + '\\n');
  }
});
`);
    await chmod(command, 0o700);

    const sharedEnv = {
      PATH: process.env['PATH'] ?? '',
      SHARED_ENV: 'expected',
      START_FILE: startFile,
    };
    const request = createCodexAppServerRequest({ command, env: sharedEnv });

    await expect(request('thread/list', { limit: 1 }, { timeoutMs: 2_000 })).resolves.toEqual({
      data: [expect.objectContaining({ modelProvider: '模型' })],
      nextCursor: null,
    });
    await expect(request('thread/list', { limit: 1 }, { timeoutMs: 2_000 })).resolves.toEqual({
      data: [expect.objectContaining({ modelProvider: '模型' })],
      nextCursor: null,
    });
    await expect(request('unsupported/method', {}, { timeoutMs: 2_000 })).rejects.toMatchObject({
      name: 'CodexProtocolError',
      code: -32000,
    });
    expect(await readFile(startFile, 'utf8')).toBe('1');
    await expect(createDefaultRuntimeAdapterRegistry({
      env: sharedEnv,
      codex: { command, requestTimeoutMs: 2_000 },
    }).list()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'codex', health: expect.objectContaining({ state: 'connected' }) }),
    ]));
  });

  it('does not keep a short-lived consumer alive through app-server pipe handles', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codex-app-server-unref-'));
    tempPaths.push(directory);
    const command = join(directory, 'codex-fast.cjs');
    const runner = join(directory, 'request-once.ts');
    await writeFile(command, `#!/usr/bin/env node
const readline = require('node:readline');
const input = readline.createInterface({ input: process.stdin });
let initialized = false;
input.on('line', (line) => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') {
    process.stdout.write(JSON.stringify({ id: message.id, result: {} }) + '\\n');
  } else if (message.method === 'initialized') {
    initialized = true;
  } else if (message.method === 'thread/list' && initialized) {
    process.stdout.write(JSON.stringify({ id: message.id, result: { data: [], nextCursor: null } }) + '\\n');
  }
});
`);
    await chmod(command, 0o700);
    const clientModule = join(process.cwd(), 'src/runtime/codex/codex-app-server-client.ts');
    await writeFile(runner, `
import { createCodexAppServerRequest } from ${JSON.stringify(clientModule)};
const request = createCodexAppServerRequest({
  command: ${JSON.stringify(command)},
  env: { PATH: process.env.PATH ?? '' },
});
async function main() {
  await request('thread/list', {}, { timeoutMs: 1000 });
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`);
    const tsx = join(process.cwd(), '..', '..', 'node_modules', '.bin', 'tsx');
    const consumer = spawnProcess(tsx, [runner], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    consumer.stderr.setEncoding('utf8');
    consumer.stderr.on('data', (chunk: string) => { stderr += chunk; });

    await expect(new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        consumer.kill('SIGKILL');
        reject(new Error(`short-lived Codex consumer stayed alive: ${stderr}`));
      }, 3_000);
      consumer.once('exit', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`short-lived Codex consumer exited with ${String(code)}: ${stderr}`));
      });
    })).resolves.toBeUndefined();
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

  it('ignores late output from an app-server process replaced after timeout', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codex-app-server-replace-'));
    tempPaths.push(directory);
    const command = join(directory, 'codex-replace.cjs');
    const startFile = join(directory, 'starts.txt');
    await writeFile(command, `#!/usr/bin/env node
const fs = require('node:fs');
const readline = require('node:readline');
fs.appendFileSync(process.env.START_FILE, '1');
const instance = fs.readFileSync(process.env.START_FILE, 'utf8').length;
process.on('SIGTERM', () => setTimeout(() => process.stdout.write('{'), 10));
const input = readline.createInterface({ input: process.stdin });
let initialized = false;
input.on('line', (line) => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') {
    const respond = () => process.stdout.write(JSON.stringify({ id: message.id, result: {} }) + '\\n');
    if (instance === 1) respond(); else setTimeout(respond, 40);
  } else if (message.method === 'initialized') {
    initialized = true;
  } else if (message.method === 'thread/list' && initialized && instance > 1) {
    process.stdout.write(JSON.stringify({ id: message.id, result: { data: [], nextCursor: null } }) + '\\n');
  }
});
`);
    await chmod(command, 0o700);
    const request = createCodexAppServerRequest({
      command,
      env: { PATH: process.env['PATH'] ?? '', START_FILE: startFile },
    });

    await expect(request('thread/list', {}, { timeoutMs: 200 })).rejects.toThrow('timed out');
    await expect(request('thread/list', {}, { timeoutMs: 1_000 })).resolves.toEqual({
      data: [],
      nextCursor: null,
    });
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

    const methodMismatch = new CodexRuntimeAdapter({
      now: () => new Date('2026-07-26T12:00:00.000Z'),
      request: async () => {
        throw Object.assign(new Error('server details must not escape'), {
          name: 'CodexProtocolError',
          code: -32601,
        });
      },
    });
    await expect(methodMismatch.describe()).resolves.toEqual(expect.objectContaining({
      health: expect.objectContaining({ state: 'schema-incompatible' }),
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

    await expect(adapter.describe()).resolves.toEqual(expect.objectContaining({
      health: expect.objectContaining({ state: 'degraded' }),
    }));
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
        sourceKinds: [
          'cli', 'vscode', 'exec', 'appServer', 'subAgent',
          'subAgentReview', 'subAgentCompact', 'subAgentThreadSpawn', 'subAgentOther', 'unknown',
        ],
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

    expect(() => adapter.validateEventCursor?.('malformed')).toThrow(expect.objectContaining({
      code: 'INVALID_CURSOR',
    }));
    await expect(adapter.getEvents({ cursor: 'malformed' })).rejects.toMatchObject({
      code: 'INVALID_CURSOR',
    });
    expect(request).not.toHaveBeenCalled();

    const first = await adapter.getEvents({ limit: 1 });
    expect(first.events.map((event) => event.id)).toEqual([
      'codex:thread:thread-b:1785081660:idle',
    ]);
    expect(first.nextCursor).toBe(first.events[0]!.cursor);

    const second = await adapter.getEvents({ cursor: first.nextCursor!, limit: 1 });
    expect(second.events.map((event) => event.id)).toEqual([
      'codex:thread:thread-a:1785081660:active',
    ]);
    expect(second.nextCursor).toBe(second.events[0]!.cursor);
    expect(request).toHaveBeenLastCalledWith(
      'thread/list',
      expect.objectContaining({ limit: 500, useStateDbOnly: true }),
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
  });

  it('emits a distinct event when thread status changes within the same timestamp', async () => {
    let status = 'active';
    const request = vi.fn(async () => ({
      data: [{
        id: 'thread-a', sessionId: 'session-a', cliVersion: '0.145.0',
        createdAt: 100, updatedAt: 200, cwd: '/workspace/project',
        ephemeral: false, modelProvider: 'openai', status: { type: status },
      }],
      nextCursor: null,
    }));
    const adapter = new CodexRuntimeAdapter({ request });

    const first = await adapter.getEvents({ limit: 1 });
    status = 'idle';
    const second = await adapter.getEvents({ cursor: first.nextCursor!, limit: 1 });

    expect(second.events).toEqual([
      expect.objectContaining({ summary: 'Codex thread is idle' }),
    ]);
    expect(second.events[0]!.id).not.toBe(first.events[0]!.id);
    expect(second.nextCursor).not.toBe(first.nextCursor);
  });

  it('preserves a lower-id thread status change behind a same-second cursor', async () => {
    let lowerStatus = 'active';
    const request = vi.fn(async () => ({
      data: [
        {
          id: 'thread-b', sessionId: 'session-b', cliVersion: '0.145.0',
          createdAt: 100, updatedAt: 200, cwd: '/workspace/project',
          ephemeral: false, modelProvider: 'openai', status: { type: 'idle' },
        },
        {
          id: 'thread-a', sessionId: 'session-a', cliVersion: '0.145.0',
          createdAt: 100, updatedAt: 200, cwd: '/workspace/project',
          ephemeral: false, modelProvider: 'openai', status: { type: lowerStatus },
        },
      ],
      nextCursor: null,
    }));
    const adapter = new CodexRuntimeAdapter({ request });

    const first = await adapter.getEvents({ limit: 2 });
    lowerStatus = 'idle';
    const second = await adapter.getEvents({ cursor: first.nextCursor!, limit: 2 });

    expect(second.events.map((event) => event.id)).toEqual([
      'codex:thread:thread-a:200:idle',
    ]);
  });

  it('returns the newest matching events on an initial poll', async () => {
    const thread = (id: string, updatedAt: number) => ({
      id, sessionId: `session-${id}`, cliVersion: '0.145.0',
      createdAt: 100, updatedAt, cwd: '/workspace/project',
      ephemeral: false, modelProvider: 'openai', status: { type: 'idle' },
    });
    const request = vi.fn(async () => ({
      data: [thread('newest', 300), thread('older', 200)],
      nextCursor: null,
    }));
    const adapter = new CodexRuntimeAdapter({ request });

    const page = await adapter.getEvents({ limit: 1 });

    expect(page.events.map((event) => event.id)).toEqual([
      'codex:thread:newest:300:idle',
    ]);
  });

  it('paginates thread metadata until event cursor continuity is preserved', async () => {
    const thread = (id: string, updatedAt: number) => ({
      id, sessionId: `session-${id}`, cliVersion: '0.145.0',
      createdAt: updatedAt - 1, updatedAt,
      cwd: '/workspace/project', ephemeral: false, modelProvider: 'openai',
      status: { type: 'idle' },
    });
    const request = vi.fn(async (_method: string, params: Record<string, unknown>) => (
      params['cursor'] === 'page-2'
        ? { data: [thread('older-after-cursor', 200)], nextCursor: null }
        : { data: [thread('newest', 300)], nextCursor: 'page-2' }
    ));
    const adapter = new CodexRuntimeAdapter({ request });
    const cursor = Buffer.from(JSON.stringify({
      occurredAt: '1970-01-01T00:01:40.000Z',
      threadId: 'baseline',
    })).toString('base64url');

    const page = await adapter.getEvents({ cursor, limit: 10 });

    expect(page.events.map((event) => event.id)).toEqual([
      'codex:thread:older-after-cursor:200:idle',
      'codex:thread:newest:300:idle',
    ]);
    expect(request).toHaveBeenNthCalledWith(2, 'thread/list', expect.objectContaining({
      cursor: 'page-2',
    }), expect.any(Object));
  });

  it('paginates initial event reads before applying a workspace filter', async () => {
    const thread = (id: string, cwd: string) => ({
      id, sessionId: `session-${id}`, cliVersion: '0.145.0',
      createdAt: 100, updatedAt: 200,
      cwd, ephemeral: false, modelProvider: 'openai', status: { type: 'idle' },
    });
    const request = vi.fn(async (_method: string, params: Record<string, unknown>) => (
      params['cursor'] === 'page-2'
        ? { data: [thread('target', '/workspace/target')], nextCursor: null }
        : { data: [thread('other', '/workspace/other')], nextCursor: 'page-2' }
    ));
    const adapter = new CodexRuntimeAdapter({ request });
    const workspaceId = `codex:workspace:${createHash('sha256')
      .update('/workspace/target').digest('hex').slice(0, 16)}`;

    const page = await adapter.getEvents({ workspaceId, limit: 1 });

    expect(page.events).toEqual([
      expect.objectContaining({ id: 'codex:thread:target:200:idle', workspaceId }),
    ]);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('paginates before applying a bounded workspace snapshot filter', async () => {
    const thread = (id: string, cwd: string) => ({
      id, sessionId: `session-${id}`, cliVersion: '0.145.0',
      createdAt: 100, updatedAt: 200,
      cwd, ephemeral: false, modelProvider: 'openai', status: { type: 'idle' },
    });
    const request = vi.fn(async (_method: string, params: Record<string, unknown>) => (
      params['cursor'] === 'page-2'
        ? {
            data: [thread('target-1', '/workspace/target'), thread('target-2', '/workspace/target')],
            nextCursor: null,
          }
        : { data: [thread('other', '/workspace/other')], nextCursor: 'page-2' }
    ));
    const adapter = new CodexRuntimeAdapter({ request });
    const workspaceId = `codex:workspace:${createHash('sha256')
      .update('/workspace/target').digest('hex').slice(0, 16)}`;

    const snapshot = await adapter.getSnapshot({ workspaceId, activityLimit: 1 });

    expect(snapshot.agents).toEqual({
      status: 'available',
      data: [expect.objectContaining({ id: 'codex:thread:target-1', workspaceId })],
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('returns a degraded partial workspace snapshot at the pagination safety bound', async () => {
    const target = {
      id: 'target', sessionId: 'session-target', cliVersion: '0.145.0',
      createdAt: 100, updatedAt: 200, cwd: '/workspace/target',
      ephemeral: false, modelProvider: 'openai', status: { type: 'idle' },
    };
    const request = vi.fn(async (_method: string, params: Record<string, unknown>) => ({
      data: params['cursor'] === undefined ? [target] : [],
      nextCursor: `page-${request.mock.calls.length + 1}`,
    }));
    const adapter = new CodexRuntimeAdapter({ request });
    const workspaceId = `codex:workspace:${createHash('sha256')
      .update('/workspace/target').digest('hex').slice(0, 16)}`;

    const snapshot = await adapter.getSnapshot({ workspaceId, activityLimit: 2 });

    expect(snapshot.state).toBe('degraded');
    expect(snapshot.message).toContain('bounded');
    expect(snapshot.agents).toEqual({
      status: 'available',
      data: [expect.objectContaining({ id: 'codex:thread:target', workspaceId })],
    });
    expect(request).toHaveBeenCalledTimes(100);
  });
});
