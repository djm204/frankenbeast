import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { createDashboardStaticResponse, resolveDashboardOperatorToken, startDashboardStaticServer } from '../../../src/http/dashboard-static-server.js';
import { createSecretStore } from '../../../src/network/secret-store.js';

import { testCredential } from '../../support/test-credentials.js';

const TEST_OPERATOR_TOKEN = testCredential('TEST_OPERATOR_TOKEN');
async function createDashboardDist(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'franken-dashboard-dist-'));
  await mkdir(join(dir, 'assets'), { recursive: true });
  await writeFile(join(dir, 'index.html'), '<!doctype html><div id="root"></div>', 'utf-8');
  await writeFile(join(dir, 'assets', 'app.js'), 'console.log("dashboard")', 'utf-8');
  return dir;
}

describe('dashboard static server', () => {
  let dirs: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalCwd = process.cwd();
  const originalConfigFile = process.env.FRANKENBEAST_CONFIG_FILE;
  const originalConfigPath = process.env.FRANKENBEAST_CONFIG_PATH;
  const originalPassphrase = process.env.FRANKENBEAST_PASSPHRASE;

  afterEach(async () => {
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
    dirs = [];
    globalThis.fetch = originalFetch;
    process.chdir(originalCwd);
    if (originalConfigFile === undefined) delete process.env.FRANKENBEAST_CONFIG_FILE;
    else process.env.FRANKENBEAST_CONFIG_FILE = originalConfigFile;
    if (originalConfigPath === undefined) delete process.env.FRANKENBEAST_CONFIG_PATH;
    else process.env.FRANKENBEAST_CONFIG_PATH = originalConfigPath;
    if (originalPassphrase === undefined) delete process.env.FRANKENBEAST_PASSPHRASE;
    else process.env.FRANKENBEAST_PASSPHRASE = originalPassphrase;
    vi.restoreAllMocks();
  });

  it('serves the built dashboard index and assets without the Vite dev server', async () => {
    const staticDir = await createDashboardDist();
    dirs.push(staticDir);

    const index = await createDashboardStaticResponse(new Request('http://dashboard.local/'), staticDir);
    const asset = await createDashboardStaticResponse(new Request('http://dashboard.local/assets/app.js'), staticDir);

    await expect(index.text()).resolves.toContain('<div id="root"></div>');
    expect(index.headers.get('content-type')).toContain('text/html');
    await expect(asset.text()).resolves.toContain('console.log("dashboard")');
    expect(asset.headers.get('content-type')).toContain('text/javascript');
  });

  it('falls back to index.html for dashboard client routes but not API routes', async () => {
    const staticDir = await createDashboardDist();
    dirs.push(staticDir);

    const clientRoute = await createDashboardStaticResponse(new Request('http://dashboard.local/beasts'), staticDir);
    const apiRoute = await createDashboardStaticResponse(new Request('http://dashboard.local/api/dashboard'), staticDir);
    const health = await createDashboardStaticResponse(new Request('http://dashboard.local/health'), staticDir);

    await expect(clientRoute.text()).resolves.toContain('<div id="root"></div>');
    expect(apiRoute.status).toBe(404);
    expect(health.status).toBe(200);
  });

  it('fails health when the dashboard build is missing', async () => {
    const staticDir = await mkdtemp(join(tmpdir(), 'franken-dashboard-empty-'));
    dirs.push(staticDir);

    const health = await createDashboardStaticResponse(new Request('http://dashboard.local/health'), staticDir);

    expect(health.status).toBe(503);
    await expect(health.json()).resolves.toMatchObject({ ok: false, reason: 'dashboard-build-missing' });
  });

  it('proxies backend routes with the server-side operator token', async () => {
    const staticDir = await createDashboardDist();
    dirs.push(staticDir);
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    globalThis.fetch = fetchMock;

    const proxied = await createDashboardStaticResponse(
      new Request('http://dashboard.local/api/dashboard?fresh=1', {
        headers: { origin: 'http://dashboard.local' },
      }),
      staticDir,
      { apiTarget: 'http://127.0.0.1:4242/base/', operatorToken: TEST_OPERATOR_TOKEN },
    );

    expect(proxied.status).toBe(200);
    const [targetUrl, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(targetUrl.toString()).toBe('http://127.0.0.1:4242/base/api/dashboard?fresh=1');
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${TEST_OPERATOR_TOKEN}`);
  });

  it('loads dashboard operator token from network config even when provider trust metadata is unapproved', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'franken-dashboard-config-'));
    dirs.push(projectRoot);
    process.chdir(projectRoot);
    process.env.FRANKENBEAST_PASSPHRASE = 'dashboard-token-test-passphrase';
    const configFile = join(projectRoot, 'frankenbeast.json');
    process.env.FRANKENBEAST_CONFIG_FILE = configFile;
    delete process.env.FRANKENBEAST_CONFIG_PATH;
    const store = createSecretStore('local-encrypted', { projectRoot, passphrase: process.env.FRANKENBEAST_PASSPHRASE });
    await store.store('dashboard-token', 'from-secret-store');
    await writeFile(configFile, JSON.stringify({
      network: {
        secureBackend: 'local-encrypted',
        operatorTokenRef: 'dashboard-token',
      },
      providers: {
        overrides: {
          custom: {
            command: '/usr/local/bin/custom-provider',
            trustCommandOverride: true,
          },
        },
      },
    }), 'utf8');

    await expect(resolveDashboardOperatorToken()).resolves.toBe('from-secret-store');
  });

  it('rejects cross-site proxy requests when an operator token is configured', async () => {
    const staticDir = await createDashboardDist();
    dirs.push(staticDir);
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const response = await createDashboardStaticResponse(
      new Request('http://dashboard.local/api/dashboard', {
        headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
      }),
      staticDir,
      { apiTarget: 'http://127.0.0.1:4242', operatorToken: TEST_OPERATOR_TOKEN },
    );

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects headerless proxy requests when an operator token is configured', async () => {
    const staticDir = await createDashboardDist();
    dirs.push(staticDir);
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const response = await createDashboardStaticResponse(
      new Request('http://dashboard.local/api/dashboard'),
      staticDir,
      { apiTarget: 'http://127.0.0.1:4242', operatorToken: TEST_OPERATOR_TOKEN },
    );

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows public webhook routes to reach backend signature checks without browser origin headers', async () => {
    const staticDir = await createDashboardDist();
    dirs.push(staticDir);
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
    globalThis.fetch = fetchMock;

    const response = await createDashboardStaticResponse(
      new Request('http://dashboard.local/webhooks/telegram', { method: 'POST', body: '{}' }),
      staticDir,
      { apiTarget: 'http://127.0.0.1:4242', operatorToken: TEST_OPERATOR_TOKEN },
    );

    expect(response.status).toBe(200);
    const [targetUrl] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(targetUrl.toString()).toBe('http://127.0.0.1:4242/webhooks/telegram');
  });

  it('forwards non-GET request bodies through the HTTP static proxy', async () => {
    const staticDir = await createDashboardDist();
    dirs.push(staticDir);
    let receivedBody = '';
    const backend = createServer((req, res) => {
      req.on('data', (chunk) => {
        receivedBody += chunk.toString();
      });
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
      });
    });
    await new Promise<void>((resolveListen) => backend.listen(0, '127.0.0.1', resolveListen));
    const backendAddress = backend.address();
    if (!backendAddress || typeof backendAddress === 'string') throw new Error('backend listen failed');

    const dashboard = await startDashboardStaticServer({
      host: '127.0.0.1',
      port: 0,
      staticDir,
      apiTarget: `http://127.0.0.1:${backendAddress.port}`,
      operatorToken: TEST_OPERATOR_TOKEN,
    });
    const dashboardAddress = dashboard.address();
    if (!dashboardAddress || typeof dashboardAddress === 'string') throw new Error('dashboard listen failed');

    try {
      const response = await fetch(`http://127.0.0.1:${dashboardAddress.port}/api/session`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          origin: `https://127.0.0.1:${dashboardAddress.port}`,
          'x-forwarded-proto': 'https',
        },
        body: JSON.stringify({ hello: 'world' }),
      });

      expect(response.status).toBe(200);
      expect(receivedBody).toBe('{"hello":"world"}');
    } finally {
      await new Promise<void>((resolveClose) => dashboard.close(() => resolveClose()));
      await new Promise<void>((resolveClose) => backend.close(() => resolveClose()));
    }
  });

  it('streams proxied event responses without buffering until the backend closes', async () => {
    const staticDir = await createDashboardDist();
    dirs.push(staticDir);
    const backend = createServer((_req, res) => {
      res.setHeader('content-type', 'text/event-stream');
      res.write('data: ready\\n\\n');
      setTimeout(() => res.end(), 25);
    });
    await new Promise<void>((resolveListen) => backend.listen(0, '127.0.0.1', resolveListen));
    const backendAddress = backend.address();
    if (!backendAddress || typeof backendAddress === 'string') throw new Error('backend listen failed');

    const dashboard = await startDashboardStaticServer({
      host: '127.0.0.1',
      port: 0,
      staticDir,
      apiTarget: `http://127.0.0.1:${backendAddress.port}`,
    });
    const dashboardAddress = dashboard.address();
    if (!dashboardAddress || typeof dashboardAddress === 'string') throw new Error('dashboard listen failed');

    try {
      const response = await fetch(`http://127.0.0.1:${dashboardAddress.port}/api/dashboard/events`, {
        headers: { origin: `http://127.0.0.1:${dashboardAddress.port}` },
      });
      const body = await response.text();

      expect(body).toContain('data: ready');
    } finally {
      await new Promise<void>((resolveClose) => dashboard.close(() => resolveClose()));
      await new Promise<void>((resolveClose) => backend.close(() => resolveClose()));
    }
  });

  it('strips decoded compression headers from HTTP proxy responses', async () => {
    const staticDir = await createDashboardDist();
    dirs.push(staticDir);
    const compressed = gzipSync('decoded response');
    const backend = createServer((_req, res) => {
      res.setHeader('content-encoding', 'gzip');
      res.setHeader('content-length', String(compressed.byteLength));
      res.end(compressed);
    });
    await new Promise<void>((resolveListen) => backend.listen(0, '127.0.0.1', resolveListen));
    const backendAddress = backend.address();
    if (!backendAddress || typeof backendAddress === 'string') throw new Error('backend listen failed');

    const dashboard = await startDashboardStaticServer({
      host: '127.0.0.1',
      port: 0,
      staticDir,
      apiTarget: `http://127.0.0.1:${backendAddress.port}`,
    });
    const dashboardAddress = dashboard.address();
    if (!dashboardAddress || typeof dashboardAddress === 'string') throw new Error('dashboard listen failed');

    try {
      const response = await fetch(`http://127.0.0.1:${dashboardAddress.port}/api/compressed`, {
        headers: { origin: `http://127.0.0.1:${dashboardAddress.port}` },
      });

      await expect(response.text()).resolves.toBe('decoded response');
      expect(response.headers.get('content-encoding')).toBeNull();
      expect(response.headers.get('content-length')).toBeNull();
    } finally {
      await new Promise<void>((resolveClose) => dashboard.close(() => resolveClose()));
      await new Promise<void>((resolveClose) => backend.close(() => resolveClose()));
    }
  });
});
