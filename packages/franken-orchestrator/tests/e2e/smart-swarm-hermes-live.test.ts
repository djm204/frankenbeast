import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';
import { chromium, expect as expectBrowser, type Browser, type BrowserContext } from '@playwright/test';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { describe, expect, it } from 'vitest';
import { startChatServer, type ChatServerHandle } from '../../src/http/chat-server.js';
import { HermesRuntimeAdapter, RuntimeAdapterRegistry } from '../../src/runtime/index.js';

const execFileAsync = promisify(execFile);
const enabled = process.env['LIVE_SMART_SWARM_E2E'] === '1';
const repoRoot = resolve(import.meta.dirname, '../../../..');
const webRoot = join(repoRoot, 'packages/franken-web');
const hermesCommand = process.env['HERMES_COMMAND'] ?? 'hermes';
const ambientHermesEnvKeys = [
  'HERMES_DELEGATED_CHILD_CONTEXT',
  'HERMES_KANBAN_BOARD',
  'HERMES_KANBAN_BRANCH',
  'HERMES_KANBAN_TASK',
  'HERMES_KANBAN_WORKSPACE',
  'HERMES_SESSION_ID',
  'HERMES_TENANT',
] as const;

interface HermesTask {
  id: string;
  status: string;
}

async function runHermes(
  hermesHome: string,
  args: string[],
  options: { board?: string; databasePath?: string } = {},
): Promise<string> {
  const boardArgs = options.board ? ['--board', options.board] : [];
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const key of ambientHermesEnvKeys) delete childEnv[key];
  const { stdout } = await execFileAsync(
    hermesCommand,
    ['kanban', ...boardArgs, ...args],
    {
      cwd: repoRoot,
      env: {
        ...childEnv,
        HERMES_HOME: hermesHome,
        HERMES_KANBAN_DB: options.databasePath ?? join(hermesHome, 'kanban.db'),
        HERMES_PROFILE: 'default',
      },
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    },
  );
  return stdout;
}

async function createTask(
  hermesHome: string,
  title: string,
  extraArgs: string[] = [],
): Promise<HermesTask> {
  return JSON.parse(await runHermes(hermesHome, [
    'create', title,
    '--assignee', 'default',
    '--workspace', 'scratch',
    ...extraArgs,
    '--json',
  ])) as HermesTask;
}

async function readTask(hermesHome: string, taskId: string): Promise<HermesTask> {
  const result = JSON.parse(await runHermes(hermesHome, ['show', taskId, '--json'])) as {
    task: HermesTask;
  };
  return result.task;
}

async function productionBundleText(): Promise<string> {
  const assetsDir = join(webRoot, 'dist/assets');
  const files = (await readdir(assetsDir)).filter((file) => file.endsWith('.js'));
  return (await Promise.all(files.map((file) => readFile(join(assetsDir, file), 'utf8')))).join('\n');
}

function isExpectedResourceFailure(failure: string): boolean {
  if (failure.startsWith('404 ') && failure.includes('/v1/network/')) return true;
  return failure.includes('/events/') && (
    failure.includes('ERR_ABORTED') || failure.includes('ERR_INCOMPLETE_CHUNKED_ENCODING')
  );
}

describe('smart-swarm browser resource failure classification', () => {
  it('exempts only 404 responses from the unrelated network API', () => {
    expect(isExpectedResourceFailure('404 http://127.0.0.1/v1/network/status')).toBe(true);
    expect(isExpectedResourceFailure('500 http://127.0.0.1/v1/network/status')).toBe(false);
    expect(isExpectedResourceFailure('net::ERR_FAILED http://127.0.0.1/v1/network/status')).toBe(false);
  });
});

describe.runIf(enabled)('live smart-swarm dashboard against isolated Hermes', () => {
  it('proves authenticated HTTP/SSE, real browser topology, governed actions, recovery, and cleanup', async () => {
    const marker = `live-e2e-${Date.now()}`;
    const secretMarker = `secret-${crypto.randomUUID()}`;
    const workerTitle = `${marker} Worker token=${secretMarker}`;
    const operatorToken = `operator-${crypto.randomUUID()}`;
    const hermesHome = await mkdtemp(join(tmpdir(), 'franken-smart-swarm-hermes-'));
    const sessionDir = await mkdtemp(join(tmpdir(), 'franken-smart-swarm-session-'));
    const previousEnv = {
      hermesHome: process.env['HERMES_HOME'],
      kanbanDb: process.env['HERMES_KANBAN_DB'],
      operatorToken: process.env['FRANKENBEAST_BEAST_OPERATOR_TOKEN'],
      proxyTarget: process.env['VITE_API_PROXY_TARGET'],
      configFile: process.env['FRANKENBEAST_CONFIG_FILE'],
      configPath: process.env['FRANKENBEAST_CONFIG_PATH'],
      ambientHermes: Object.fromEntries(ambientHermesEnvKeys.map((key) => [key, process.env[key]])),
    };
    let backend: ChatServerHandle | undefined;
    let vite: ViteDevServer | undefined;
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let caught: unknown;

    try {
      await runHermes(hermesHome, ['init']);
      await runHermes(hermesHome, ['boards', 'create', 'empty-e2e', '--name', 'Empty E2E']);
      await runHermes(hermesHome, ['init'], {
        databasePath: join(hermesHome, 'kanban', 'boards', 'empty-e2e', 'kanban.db'),
      });

      const pm = await createTask(hermesHome, `${marker} PM`);
      const worker = await createTask(hermesHome, workerTitle, [
        '--parent', pm.id,
        '--body', `private ${secretMarker}`,
      ]);
      await runHermes(hermesHome, [
        'complete', pm.id,
        '--summary', `${marker} dependency satisfied`,
      ]);
      await runHermes(hermesHome, [
        'block', '--kind', 'needs_input', worker.id, `${marker} operator input required`,
      ]);
      await runHermes(hermesHome, [
        'comment', worker.id, `${marker} initial live log evidence`, '--author', 'e2e-worker',
      ]);
      expect((await readTask(hermesHome, worker.id)).status).toBe('blocked');

      const incompatibleDir = join(hermesHome, 'kanban', 'boards', 'incompatible-e2e');
      await mkdir(incompatibleDir, { recursive: true });
      const incompatibleDb = new Database(join(incompatibleDir, 'kanban.db'));
      incompatibleDb.exec('CREATE TABLE incompatible_schema (id TEXT PRIMARY KEY)');
      incompatibleDb.close();

      for (const key of ambientHermesEnvKeys) delete process.env[key];
      process.env['HERMES_HOME'] = hermesHome;
      process.env['HERMES_KANBAN_DB'] = join(hermesHome, 'kanban.db');
      process.env['FRANKENBEAST_BEAST_OPERATOR_TOKEN'] = operatorToken;
      process.env['FRANKENBEAST_CONFIG_FILE'] = join(hermesHome, 'missing-frankenbeast-config.json');
      process.env['FRANKENBEAST_CONFIG_PATH'] = join(hermesHome, 'missing-frankenbeast-config.json');

      backend = await startChatServer({
        host: '127.0.0.1',
        port: 0,
        sessionStoreDir: sessionDir,
        llm: { complete: async () => 'unused in smart-swarm E2E' },
        projectName: 'smart-swarm-e2e',
        operatorToken,
        runtimeRegistry: new RuntimeAdapterRegistry([
          new HermesRuntimeAdapter({
            command: hermesCommand,
            hermesHome,
            kanbanDbPath: join(hermesHome, 'kanban.db'),
            env: {
              ...process.env,
              HERMES_HOME: hermesHome,
              HERMES_KANBAN_DB: join(hermesHome, 'kanban.db'),
            },
          }),
        ]),
      });
      process.env['VITE_API_PROXY_TARGET'] = backend.url;

      const unauthenticated = await fetch(`${backend.url}/v1/smart-swarm/providers`);
      expect(unauthenticated.status).toBe(401);
      const authenticated = await fetch(
        `${backend.url}/v1/smart-swarm/providers/hermes/snapshot?workspaceId=hermes%3Aglobal`,
        {
          headers: { authorization: `Bearer ${operatorToken}` },
        },
      );
      expect(authenticated.status).toBe(200);
      const authenticatedText = await authenticated.text();
      expect(authenticatedText).toContain(marker);
      expect(authenticatedText).not.toContain(secretMarker);

      vite = await createViteServer({
        configFile: join(webRoot, 'vite.config.ts'),
        root: webRoot,
        logLevel: 'error',
        server: { host: '127.0.0.1', port: 0, strictPort: false },
      });
      await vite.listen();
      const dashboardUrl = vite.resolvedUrls?.local[0];
      if (!dashboardUrl) throw new Error('Vite did not publish a local dashboard URL');
      const dashboardPort = Number(new URL(dashboardUrl).port);

      browser = await chromium.launch({ headless: true });
      context = await browser.newContext();
      const page = await context.newPage();
      const browserErrors: string[] = [];
      const resourceFailures: string[] = [];
      let ticketRequests = 0;
      page.on('request', (request) => {
        if (request.url().endsWith('/events/ticket')) ticketRequests += 1;
      });
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
          browserErrors.push(message.text());
        }
      });
      page.on('pageerror', (error) => browserErrors.push(error.message));
      page.on('response', (response) => {
        if (response.status() >= 400) resourceFailures.push(`${response.status()} ${response.url()}`);
      });
      page.on('requestfailed', (request) => {
        resourceFailures.push(`${request.failure()?.errorText ?? 'request failed'} ${request.url()}`);
      });

      await page.goto(`${dashboardUrl}#/smart-swarm`);
      await expectBrowser(page.getByRole('heading', { name: 'smart-swarm' })).toBeVisible();
      await page.getByLabel('Runtime provider').selectOption('hermes');
      await expectBrowser(page.getByLabel('Runtime provider')).toHaveValue('hermes');
      await expectBrowser(page.getByText('Live · connected')).toBeVisible({ timeout: 15_000 });
      await expectBrowser(page.getByText(new RegExp(`${marker} Worker`))).toBeVisible();
      await expectBrowser(page.locator('body')).not.toContainText(secretMarker);
      await expectBrowser(page.getByText(`Depends on ${marker} PM`, { exact: true })).toBeVisible();
      await expectBrowser(page.getByText(new RegExp(`${marker} operator input required`))).toBeVisible();
      await expectBrowser(page.getByRole('region', { name: 'Provider capabilities' })).toContainText('unsupported');
      await expectBrowser(page.getByText('One or more Hermes databases are unavailable or schema-incompatible')).toBeVisible();
      await expectBrowser(page.getByText(/Approvals unsupported:.*no canonical approval-request source/)).toBeVisible();
      await expectBrowser(page.getByTitle('The supported Hermes Kanban schema has no canonical log-record source')).toBeVisible();

      await page.getByRole('button', { name: new RegExp(`Inspect ${marker} Worker`) }).click();
      await expectBrowser(page.getByRole('dialog', { name: new RegExp(`${marker} Worker.*details`) })).toBeVisible();
      await expectBrowser(page.getByRole('dialog').getByRole('definition').filter({ hasText: 'blocked' })).toBeVisible();
      await page.getByRole('button', { name: 'Close' }).click();

      const streamedMarker = `${marker} streamed event`;
      await runHermes(hermesHome, [
        'comment', worker.id, streamedMarker, '--author', 'e2e-worker',
      ]);
      await expectBrowser(page.getByText(new RegExp(streamedMarker))).toBeVisible({ timeout: 15_000 });

      const ticketRequestsBeforeRecovery = ticketRequests;
      await vite.close();
      vite = undefined;
      await expectBrowser(page.getByText('Connection lost · reconnecting')).toBeVisible({ timeout: 10_000 });
      vite = await createViteServer({
        configFile: join(webRoot, 'vite.config.ts'),
        root: webRoot,
        logLevel: 'error',
        server: { host: '127.0.0.1', port: dashboardPort, strictPort: true },
      });
      await vite.listen();
      await expect.poll(() => ticketRequests, { timeout: 20_000 }).toBeGreaterThan(ticketRequestsBeforeRecovery);
      await expectBrowser(page.getByText('Live · connected')).toBeVisible({ timeout: 20_000 });

      await page.getByRole('button', { name: new RegExp(`Inspect ${marker} Worker`) }).click();
      await expectBrowser(page.getByRole('button', { name: 'Promote task' })).toBeEnabled();
      await page.getByRole('button', { name: 'Promote task' }).click();
      await expectBrowser(page.getByText('rejected: Runtime action was not approved by the governor')).toBeVisible();
      expect((await readTask(hermesHome, worker.id)).status).toBe('blocked');

      await page.getByRole('button', { name: 'Resolve blocker' }).click();
      await expectBrowser(page.getByText('Blocker resolved; refreshing live state.')).toBeVisible({ timeout: 15_000 });
      await expect.poll(async () => (await readTask(hermesHome, worker.id)).status).toBe('ready');
      await expectBrowser(page.getByRole('button', { name: 'Promote task' })).toBeDisabled();

      const approvalResult = await page.evaluate(async ({ workerId }) => {
        const response = await fetch('/v1/smart-swarm/providers/hermes/actions', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            correlationId: crypto.randomUUID(),
            idempotencyKey: `approval.resolve:${crypto.randomUUID()}`,
            action: {
              type: 'approval.resolve',
              workspaceId: 'hermes:global',
              approvalId: `approval:${workerId}`,
              decision: 'reject',
              reason: 'Hermes approval decisions are intentionally unsupported',
            },
          }),
        });
        return await response.json() as { data: { status: string; reason?: string } };
      }, { workerId: worker.id });
      expect(approvalResult.data).toEqual(expect.objectContaining({
        status: 'unsupported',
        reason: expect.stringContaining('canonical approval'),
      }));

      await page.getByRole('button', { name: 'Close' }).click();
      await page.getByLabel('Workspace').selectOption({ label: 'empty-e2e' });
      await expectBrowser(page.getByText('No runtime work in empty-e2e')).toBeVisible({ timeout: 10_000 });
      expect(browserErrors).toEqual([]);
      const unexpectedResourceFailures = resourceFailures.filter((failure) => !isExpectedResourceFailure(failure));
      expect(unexpectedResourceFailures).toEqual([]);

      const bundle = await productionBundleText();
      expect(bundle).not.toContain(`${marker} Worker`);
      expect(bundle).not.toContain('PM Ada');
      expect(bundle).not.toContain('task-live');
    } catch (error) {
      caught = error;
    } finally {
      await context?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
      await vite?.close().catch(() => undefined);
      await backend?.close().catch(() => undefined);
      await rm(sessionDir, { recursive: true, force: true });
      await rm(hermesHome, { recursive: true, force: true });
      for (const [key, value] of Object.entries(previousEnv)) {
        if (key === 'ambientHermes') {
          for (const envKey of ambientHermesEnvKeys) {
            const original = previousEnv.ambientHermes[envKey];
            if (original === undefined) delete process.env[envKey];
            else process.env[envKey] = original;
          }
          continue;
        }
        const envKey = {
          hermesHome: 'HERMES_HOME',
          kanbanDb: 'HERMES_KANBAN_DB',
          operatorToken: 'FRANKENBEAST_BEAST_OPERATOR_TOKEN',
          proxyTarget: 'VITE_API_PROXY_TARGET',
          configFile: 'FRANKENBEAST_CONFIG_FILE',
          configPath: 'FRANKENBEAST_CONFIG_PATH',
        }[key]!;
        const scalarValue = value as string | undefined;
        if (scalarValue === undefined) delete process.env[envKey];
        else process.env[envKey] = scalarValue;
      }
    }

    expect(existsSync(hermesHome)).toBe(false);
    expect(existsSync(sessionDir)).toBe(false);
    if (caught) throw caught;
  }, 120_000);
});
