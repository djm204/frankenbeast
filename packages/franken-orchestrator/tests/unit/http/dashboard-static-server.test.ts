import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDashboardStaticResponse } from '../../../src/http/dashboard-static-server.js';

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

  afterEach(async () => {
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
    dirs = [];
    globalThis.fetch = originalFetch;
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

    await expect(clientRoute.text()).resolves.toContain('<div id="root"></div>');
    expect(apiRoute.status).toBe(404);
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
      { apiTarget: 'http://127.0.0.1:4242/', operatorToken: 'operator-token' },
    );

    expect(proxied.status).toBe(200);
    const [targetUrl, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(targetUrl.toString()).toBe('http://127.0.0.1:4242/api/dashboard?fresh=1');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer operator-token');
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
      { apiTarget: 'http://127.0.0.1:4242', operatorToken: 'operator-token' },
    );

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
