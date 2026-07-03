import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBeastServices } from '../../../src/beasts/create-beast-services.js';
import { createBeastDaemonApp } from '../../../src/http/beast-daemon-app.js';
import { startBeastDaemon } from '../../../src/http/beast-daemon-server.js';

const operatorToken = 'daemon-operator-token';

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
});
