import { afterEach, describe, expect, it } from 'vitest';
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

  afterEach(async () => {
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
    dirs = [];
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
});
