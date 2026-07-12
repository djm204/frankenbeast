import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBeastServices, type BeastServiceBundle } from '../../../src/beasts/create-beast-services.js';
import type { BeastRun, BeastRunStatus } from '../../../src/beasts/types.js';
import { createBeastDaemonApp } from '../../../src/http/beast-daemon-app.js';
import { BeastDaemonShutdownError, startBeastDaemon } from '../../../src/http/beast-daemon-server.js';

import { testCredential } from '../../support/test-credentials.js';

const TEST_DAEMON_OPERATOR_TOKEN = testCredential('TEST_DAEMON_OPERATOR_TOKEN');
const operatorToken = TEST_DAEMON_OPERATOR_TOKEN;

function makeRun(id: string, status: BeastRunStatus): BeastRun {
  return {
    id,
    definitionId: 'martin-loop',
    definitionVersion: 1,
    status,
    executionMode: 'process',
    configSnapshot: {},
    dispatchedBy: 'api',
    dispatchedByUser: 'test',
    createdAt: '2026-07-02T00:00:00.000Z',
    attemptCount: 1,
    currentAttemptId: `attempt-${id}`,
  };
}

function makeDaemonServices(runs: BeastRun[], options: {
  stop?: (runId: string) => Promise<BeastRun>;
  kill?: (runId: string) => Promise<BeastRun>;
} = {}): {
  services: BeastServiceBundle;
  stop: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  const stop = vi.fn(async (runId: string) => options.stop?.(runId) ?? makeRun(runId, 'stopped'));
  const kill = vi.fn(async (runId: string) => options.kill?.(runId) ?? makeRun(runId, 'stopped'));
  const dispose = vi.fn();
  const services = {
    agents: { listAgents: vi.fn(() => []) },
    catalog: {},
    dispatch: {},
    runs: {
      listRuns: vi.fn(() => runs),
      stop,
      kill,
    },
    interviews: {},
    metrics: {},
    eventBus: {},
    ticketStore: { destroy: vi.fn() },
    dispose,
  } as unknown as BeastServiceBundle;

  return { services, stop, kill, dispose };
}

describe('beast daemon', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  async function makePaths(): Promise<{ root: string; beastsDb: string; beastLogsDir: string; pidFile: string }> {
    const root = await mkdtemp(join(tmpdir(), 'fbeast-daemon-test-'));
    tempDirs.push(root);
    return {
      root,
      beastsDb: join(root, '.fbeast', 'beast.db'),
      beastLogsDir: join(root, '.fbeast', '.build', 'beasts', 'logs'),
      pidFile: join(root, '.frankenbeast', 'beasts-daemon.pid'),
    };
  }

  it('serves health without auth and beast routes with operator auth', async () => {
    const paths = await makePaths();
    const services = createBeastServices(paths);
    const app = createBeastDaemonApp({
      services,
      operatorToken,
      startedAt: '2026-07-02T00:00:00.000Z',
    });

    try {
      const health = await app.request('/health');
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({
        ok: true,
        service: 'beasts-daemon',
        startedAt: '2026-07-02T00:00:00.000Z',
      });

      const unauthenticated = await app.request('/v1/beasts/catalog');
      expect(unauthenticated.status).toBe(401);

      const catalog = await app.request('/v1/beasts/catalog', {
        headers: { authorization: `Bearer ${operatorToken}` },
      });
      expect(catalog.status).toBe(200);
      const body = await catalog.json() as { data: Array<{ id: string }> };
      expect(body.data.map((entry) => entry.id)).toContain('martin-loop');
    } finally {
      services.dispose();
    }
  });

  it('preserves chat attribution for daemon-created tracked runs', async () => {
    const paths = await makePaths();
    const services = createBeastServices(paths);
    const app = createBeastDaemonApp({
      services,
      operatorToken,
      startedAt: '2026-07-02T00:00:00.000Z',
    });

    try {
      const agentResponse = await app.request('/v1/beasts/agents', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${operatorToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          definitionId: 'martin-loop',
          initAction: {
            kind: 'martin-loop',
            command: 'martin-loop',
            config: {},
            chatSessionId: 'chat-1',
          },
          initConfig: {},
          chatSessionId: 'chat-1',
          autoDispatch: false,
        }),
      });
      expect(agentResponse.status).toBe(201);
      const agentBody = await agentResponse.json() as {
        data: { id: string; source: string; createdByUser: string; chatSessionId?: string };
      };
      expect(agentBody.data).toMatchObject({
        source: 'chat',
        createdByUser: 'chat-session:chat-1',
        chatSessionId: 'chat-1',
      });

      const runResponse = await app.request('/v1/beasts/runs', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${operatorToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          definitionId: 'martin-loop',
          config: { provider: 'codex', objective: 'Ship it', chunkDirectory: 'chunks' },
          trackedAgentId: agentBody.data.id,
          chatSessionId: 'chat-1',
          startNow: false,
        }),
      });
      expect(runResponse.status).toBe(201);
      const runBody = await runResponse.json() as {
        data: { dispatchedBy: string; dispatchedByUser: string; trackedAgentId?: string };
      };
      expect(runBody.data).toMatchObject({
        dispatchedBy: 'chat',
        dispatchedByUser: 'chat-session:chat-1',
        trackedAgentId: agentBody.data.id,
      });
    } finally {
      services.dispose();
    }
  });

  it('authenticates daemon beast payloads before applying bounded body limits', async () => {
    const paths = await makePaths();
    const services = createBeastServices(paths);
    const app = createBeastDaemonApp({ services, operatorToken });
    const oversizedRun = JSON.stringify({
      definitionId: 'martin-loop',
      config: { provider: 'codex', objective: 'x'.repeat(2 * 1024 * 1024), chunkDirectory: 'chunks' },
      startNow: false,
    });

    try {
      const unauthenticated = await app.request('/v1/beasts/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: oversizedRun,
      });
      expect(unauthenticated.status).toBe(401);

      const authorized = await app.request('/v1/beasts/runs', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${operatorToken}`,
          'content-type': 'application/json',
        },
        body: oversizedRun,
      });
      expect(authorized.status).toBe(413);
    } finally {
      services.dispose();
    }
  });

  it('claims and releases a pid file while serving HTTP', async () => {
    const paths = await makePaths();
    const daemon = await startBeastDaemon({
      ...paths,
      operatorToken,
      port: 0,
    });

    try {
      expect(await readFile(paths.pidFile, 'utf8')).toBe(`${process.pid}\n`);
      const response = await fetch(`${daemon.url}/health`);
      expect(response.status).toBe(200);
    } finally {
      await daemon.close();
    }

    expect(existsSync(paths.pidFile)).toBe(false);
  });

  it('stops live child runs before releasing the daemon pid file', async () => {
    const paths = await makePaths();
    const run = makeRun('run-stop', 'running');
    const { services, stop, kill, dispose } = makeDaemonServices([run]);
    const daemon = await startBeastDaemon({
      ...paths,
      operatorToken,
      port: 0,
      services,
    });

    await daemon.close();

    expect(stop).toHaveBeenCalledWith('run-stop', 'beasts-daemon-shutdown');
    expect(kill).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
    expect(existsSync(paths.pidFile)).toBe(false);
  });

  it('falls back to killing live child runs when graceful stop fails', async () => {
    const paths = await makePaths();
    const run = makeRun('run-kill', 'pending_approval');
    const { services, stop, kill, dispose } = makeDaemonServices([run], {
      stop: async () => { throw new Error('stop failed'); },
    });
    const daemon = await startBeastDaemon({
      ...paths,
      operatorToken,
      port: 0,
      services,
    });

    await daemon.close();

    expect(stop).toHaveBeenCalledWith('run-kill', 'beasts-daemon-shutdown');
    expect(kill).toHaveBeenCalledWith('run-kill', 'beasts-daemon-shutdown');
    expect(dispose).toHaveBeenCalledOnce();
    expect(existsSync(paths.pidFile)).toBe(false);
  });

  it('surfaces child run shutdown failures and keeps the daemon pid file claimed', async () => {
    const paths = await makePaths();
    const failedRun = makeRun('run-failed-shutdown', 'running');
    const stoppedRun = makeRun('run-terminal', 'stopped');
    const { services, stop, kill, dispose } = makeDaemonServices([failedRun, stoppedRun], {
      stop: async () => { throw new Error('stop failed'); },
      kill: async () => { throw new Error('kill failed'); },
    });
    const daemon = await startBeastDaemon({
      ...paths,
      operatorToken,
      port: 0,
      services,
    });

    let caught: unknown;
    try {
      await daemon.close();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BeastDaemonShutdownError);
    expect((caught as Error).message).toContain('stop failed');
    expect((caught as Error).message).toContain('kill failed');
    expect((caught as BeastDaemonShutdownError).failures).toMatchObject([
      { runId: 'run-failed-shutdown' },
    ]);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledWith('run-failed-shutdown', 'beasts-daemon-shutdown');
    expect(kill).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledWith('run-failed-shutdown', 'beasts-daemon-shutdown');
    expect(dispose).toHaveBeenCalledOnce();
    expect(existsSync(paths.pidFile)).toBe(true);
  });

  it('force-closes active SSE clients on shutdown', async () => {
    const paths = await makePaths();
    const daemon = await startBeastDaemon({
      ...paths,
      operatorToken,
      port: 0,
    });

    const ticketResponse = await fetch(`${daemon.url}/v1/beasts/events/ticket`, {
      method: 'POST',
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(ticketResponse.status).toBe(200);
    const ticketBody = await ticketResponse.json() as { ticket: string };
    const streamResponse = await fetch(`${daemon.url}/v1/beasts/events/stream?ticket=${ticketBody.ticket}`);
    expect(streamResponse.status).toBe(200);

    await expect(Promise.race([
      daemon.close().then(() => 'closed'),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 1_000)),
    ])).resolves.toBe('closed');
    expect(existsSync(paths.pidFile)).toBe(false);
  });

  it('rejects an already-running pid and removes stale pid files', async () => {
    const live = await makePaths();
    await mkdir(join(live.root, '.frankenbeast'), { recursive: true });
    await writeFile(live.pidFile, `${process.pid}\n`, { flag: 'wx' });
    await expect(startBeastDaemon({
      ...live,
      operatorToken,
      port: 0,
    })).rejects.toThrow(/already running/);

    const stale = await makePaths();
    await mkdir(join(stale.root, '.frankenbeast'), { recursive: true });
    await writeFile(stale.pidFile, '999999999\n', { flag: 'wx' });
    const daemon = await startBeastDaemon({
      ...stale,
      operatorToken,
      port: 0,
    });
    await daemon.close();
    expect(existsSync(stale.pidFile)).toBe(false);

    const corrupt = await makePaths();
    await mkdir(join(corrupt.root, '.frankenbeast'), { recursive: true });
    await writeFile(corrupt.pidFile, 'not-a-pid\n', { flag: 'wx' });
    const corruptDaemon = await startBeastDaemon({
      ...corrupt,
      operatorToken,
      port: 0,
    });
    await corruptDaemon.close();
    expect(existsSync(corrupt.pidFile)).toBe(false);
  });

  it('rejects partially numeric and otherwise malformed pid files before claiming', async () => {
    const malformedPidFileContents = [
      `${process.pid}abc\n`,
      `${process.pid}\n456`,
      '   \n',
      `-${process.pid}\n`,
      `${process.pid}.5\n`,
    ];

    for (const contents of malformedPidFileContents) {
      const paths = await makePaths();
      await mkdir(join(paths.root, '.frankenbeast'), { recursive: true });
      await writeFile(paths.pidFile, contents, { flag: 'wx' });

      const daemon = await startBeastDaemon({
        ...paths,
        operatorToken,
        port: 0,
      });

      expect(await readFile(paths.pidFile, 'utf8')).toBe(`${process.pid}\n`);
      await daemon.close();
      expect(existsSync(paths.pidFile)).toBe(false);
    }
  });

  it('removes malformed pid files during release checks', async () => {
    const paths = await makePaths();
    const daemon = await startBeastDaemon({
      ...paths,
      operatorToken,
      port: 0,
    });

    await writeFile(paths.pidFile, `${process.pid}abc\n`);
    await daemon.close();

    expect(existsSync(paths.pidFile)).toBe(false);
  });

  it('releases the pid file when service construction fails', async () => {
    const paths = await makePaths();
    const badDbParent = join(paths.root, 'not-a-directory');
    await writeFile(badDbParent, 'blocking file');

    await expect(startBeastDaemon({
      ...paths,
      beastsDb: join(badDbParent, 'beast.db'),
      operatorToken,
      port: 0,
    })).rejects.toThrow();

    expect(existsSync(paths.pidFile)).toBe(false);
  });

  it('rejects non-loopback hosts before claiming the pid file', async () => {
    const paths = await makePaths();

    await expect(startBeastDaemon({
      ...paths,
      host: '0.0.0.0',
      operatorToken,
      port: 0,
    })).rejects.toThrow(/non-loopback host/);

    expect(existsSync(paths.pidFile)).toBe(false);
  });
});
