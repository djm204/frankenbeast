import { execFile } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';
import {
  chromium,
  expect as expectBrowser,
  request as playwrightRequest,
  type Browser,
  type BrowserContext,
  type Page,
  type Request,
  type Route,
} from '@playwright/test';
import { describe, expect, it } from 'vitest';
import { isPublicIpAddress } from './smart-swarm-public-live-address.js';
import { credentialRedactionNeedles } from './smart-swarm-public-live-redaction.js';
import { hermesTimestamp } from './smart-swarm-public-live-time.js';

const execFileAsync = promisify(execFile);
const enabled = process.env['LIVE_PUBLIC_SMART_SWARM_E2E'] === '1';
const hermesCommand = process.env['HERMES_COMMAND'] ?? 'hermes';
const hermesEnvironmentAllowlist = [
  'HOME',
  'LANG',
  'LC_ALL',
  'PATH',
  'TMPDIR',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'HERMES_HOME',
  'HERMES_PROFILE',
] as const;
const publicCredentialEnvironmentKeys = [
  'SMART_SWARM_PUBLIC_BASIC_AUTH',
  'SMART_SWARM_PUBLIC_BASIC_AUTH_USERNAME',
  'SMART_SWARM_PUBLIC_BASIC_AUTH_PASSWORD',
  'SMART_SWARM_PUBLIC_USERNAME',
  'SMART_SWARM_PUBLIC_PASSWORD',
] as const;

interface SourceTask {
  id: string;
  status: string;
  title: string;
}

interface PublicSnapshot {
  state: string;
  tasks: { status: string; data: Array<{ id: string; state: string; title: string }> };
  runs: { status: string; data: Array<{ id: string; taskId: string; state: string; startedAt: string }> };
  events: { status: string; data: Array<{ id: string; taskId: string | null; occurredAt: string; summary: string }> };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for public live acceptance`);
  return value;
}

async function publicOrigin(rawUrl: string): Promise<string> {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('SMART_SWARM_PUBLIC_URL must be a credential-free HTTPS origin');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '0.0.0.0'
    || hostname.startsWith('127.')
    || hostname.startsWith('::')
  ) {
    throw new Error('SMART_SWARM_PUBLIC_URL must use the public path, not loopback');
  }
  if (!hostname.endsWith('.ngrok-free.app')) {
    throw new Error('SMART_SWARM_PUBLIC_URL must use the reviewed ngrok public ingress');
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error('SMART_SWARM_PUBLIC_URL must resolve exclusively to public network addresses');
  }
  return url.origin;
}

function basicCredential(rawCredential: string): { username: string; password: string } {
  const separator = rawCredential.indexOf(':');
  if (separator <= 0 || separator === rawCredential.length - 1) {
    throw new Error('SMART_SWARM_PUBLIC_BASIC_AUTH must be a non-empty username:password pair');
  }
  const username = rawCredential.slice(0, separator);
  const password = rawCredential.slice(separator + 1);
  if (username.length < 6 || password.length < 6) {
    throw new Error('SMART_SWARM_PUBLIC_BASIC_AUTH components must be at least six characters for redaction verification');
  }
  return { username, password };
}

function hermesSubprocessEnvironment(databasePath: string): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = {};
  for (const key of hermesEnvironmentAllowlist) {
    if (process.env[key] !== undefined) childEnv[key] = process.env[key];
  }
  for (const key of publicCredentialEnvironmentKeys) delete childEnv[key];
  delete childEnv['HERMES_KANBAN_BOARD'];
  childEnv['HERMES_KANBAN_DB'] = databasePath;
  return childEnv;
}

function browserSubprocessEnvironment(): Record<string, string> {
  const allowed = ['HOME', 'PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'TZ'];
  return Object.fromEntries(allowed.flatMap((key) => {
    const value = process.env[key];
    return value === undefined ? [] : [[key, value]];
  }));
}

function expectCredentialRedaction(
  surface: unknown,
  credential: { username: string; password: string },
  surfaceName: string,
): void {
  const serialized = typeof surface === 'string' ? surface : JSON.stringify(surface);
  for (const needle of credentialRedactionNeedles(credential)) {
    if (serialized.includes(needle)) {
      throw new Error(`${surfaceName} leaked public Basic Auth credential material`);
    }
  }
}

async function readSourceTask(taskId: string, databasePath: string): Promise<SourceTask> {
  const { stdout } = await execFileAsync(hermesCommand, ['kanban', 'show', taskId, '--json'], {
    env: hermesSubprocessEnvironment(databasePath),
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  return (JSON.parse(stdout) as { task: SourceTask }).task;
}

async function addAcceptanceComment(taskId: string, marker: string, databasePath: string): Promise<void> {
  await execFileAsync(hermesCommand, [
    'kanban', 'comment', taskId, marker, '--author', 'public-acceptance',
  ], {
    env: hermesSubprocessEnvironment(databasePath),
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
}

function sourceComment(databasePath: string, taskId: string, marker: string): {
  id: number;
  createdAt: number;
} {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const row = database.prepare(`
      SELECT id, created_at AS createdAt
      FROM task_comments
      WHERE task_id = ? AND body = ? AND author = 'public-acceptance'
      ORDER BY id DESC
      LIMIT 1
    `).get(taskId, marker) as { id: number; createdAt: number } | undefined;
    if (!row) throw new Error('Genuine Hermes acceptance comment was not persisted');
    return row;
  } finally {
    database.close();
  }
}

function sourceRunPointer(databasePath: string, taskId: string): number | null {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const row = database.prepare('SELECT current_run_id AS currentRunId FROM tasks WHERE id = ?')
      .get(taskId) as { currentRunId: number | null } | undefined;
    if (!row) throw new Error(`Genuine Hermes task ${taskId} is missing`);
    return row.currentRunId;
  } finally {
    database.close();
  }
}

function sourceTaskExists(databasePath: string, taskId: string): boolean {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return database.prepare('SELECT 1 FROM tasks WHERE id = ? LIMIT 1').get(taskId) !== undefined;
  } finally {
    database.close();
  }
}

function normalizedTaskId(taskId: string): string {
  return `hermes:global:${taskId}`;
}

function normalizedCommentId(commentId: number): string {
  return `hermes:global:comment:${commentId}`;
}

function objectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(objectKeys);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, nested]) => [key, ...objectKeys(nested)]);
}

function isSmartSwarmSseRequest(request: Request): boolean {
  return request.url().includes('/v1/smart-swarm/providers/hermes/events/')
    && !request.url().endsWith('/events/ticket');
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    return {
      clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((element) => !element.closest('[aria-hidden="true"]'))
        .map((element) => ({
          className: element.className,
          left: Math.round(element.getBoundingClientRect().left),
          right: Math.round(element.getBoundingClientRect().right),
          tagName: element.tagName,
        }))
        .filter(({ left, right }) => left < -1 || right > clientWidth + 1)
        .slice(0, 10),
    };
  });
  expect(overflow, 'Public dashboard must not overflow horizontally').toEqual({
    clientWidth: overflow.clientWidth,
    scrollWidth: overflow.clientWidth,
    offenders: [],
  });
}

describe.runIf(enabled)('authenticated public smart-swarm against genuine live Hermes data', () => {
  it('proves source-traceable live updates, replay, governed safety, redaction, accessibility, and responsive behavior', async () => {
    const origin = await publicOrigin(requiredEnvironment('SMART_SWARM_PUBLIC_URL'));
    const credential = basicCredential(requiredEnvironment('SMART_SWARM_PUBLIC_BASIC_AUTH'));
    const taskId = requiredEnvironment('SMART_SWARM_ACCEPTANCE_TASK_ID');
    const databasePath = requiredEnvironment('HERMES_KANBAN_DB');
    const sourceBefore = await readSourceTask(taskId, databasePath);
    const sourceRunBefore = sourceRunPointer(databasePath, taskId);
    expect(sourceBefore.id).toBe(taskId);
    if (sourceRunBefore === null) throw new Error('Acceptance source task must expose its current live run');

    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let page: Page | undefined;
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const unexpectedNetworkFailures: string[] = [];
    const expectedManagedSseUrls = new Set<string>();
    let captureManagedSseRequests = true;
    let networkPhase = 'initial';
    let latestSseRequest: Request | undefined;

    try {
      const chromiumPath = chromium.executablePath();
      if (!existsSync(chromiumPath)) {
        throw new Error('Playwright Chromium is not installed; run `npx playwright install chromium` before this npm test command');
      }
      browser = await chromium.launch({
        env: browserSubprocessEnvironment(),
        headless: true,
      });
      context = await browser.newContext({
        httpCredentials: credential,
        extraHTTPHeaders: { 'ngrok-skip-browser-warning': 'true' },
        viewport: { width: 1440, height: 900 },
      });
      page = await context.newPage();

      page.on('request', (request) => {
        if (!isSmartSwarmSseRequest(request)) return;
        latestSseRequest = request;
        if (captureManagedSseRequests) expectedManagedSseUrls.add(request.url());
      });
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
          consoleErrors.push(message.text());
        }
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('response', (response) => {
        if (response.status() >= 400) {
          unexpectedNetworkFailures.push(`${response.status()} ${new URL(response.url()).pathname}`);
        }
      });
      page.on('requestfailed', (request) => {
        const errorText = request.failure()?.errorText ?? 'request failed';
        if (expectedManagedSseUrls.has(request.url()) && [
          'net::ERR_ABORTED',
          'net::ERR_INCOMPLETE_CHUNKED_ENCODING',
        ].includes(errorText)) {
          return;
        }
        unexpectedNetworkFailures.push(`${networkPhase} ${request.failure()?.errorText ?? 'request failed'} ${new URL(request.url()).pathname}`);
      });

      const unauthenticatedContext = await playwrightRequest.newContext({
        extraHTTPHeaders: { 'ngrok-skip-browser-warning': 'true' },
      });
      try {
        const unauthenticated = await unauthenticatedContext.get(`${origin}/health`, {
          failOnStatusCode: false,
        });
        expect(unauthenticated.status()).toBe(401);
      } finally {
        await unauthenticatedContext.dispose();
      }

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(`
        (() => {
          const NativeEventSource = window.EventSource;
          window.EventSource = class PublicAcceptanceEventSource extends NativeEventSource {
            constructor(...args) {
              super(...args);
              window.__publicAcceptanceEventSource = this;
              window.__publicAcceptanceRawActivityEvents ??= [];
              this.addEventListener('activity', (event) => {
                window.__publicAcceptanceRawActivityEvents.push(event.data);
              });
            }
          };
          window.__interruptPublicAcceptanceEventSource = () => {
            const source = window.__publicAcceptanceEventSource;
            if (!source) return false;
            source.close();
            source.dispatchEvent(new Event('error'));
            return true;
          };
        })();
      `);
      const initialSnapshotResponse = page.waitForResponse((response) => (
        response.status() === 200
        && response.url().includes('/v1/smart-swarm/providers/hermes/snapshot')
      ), { timeout: 30_000 });
      await page.goto(`${origin}/#/smart-swarm`, { waitUntil: 'domcontentloaded' });
      await expectBrowser(page.getByRole('heading', { name: 'Smart Swarm', level: 1 })).toBeVisible();
      if (await page.getByLabel('Runtime provider').inputValue() !== 'hermes') {
        await page.getByLabel('Runtime provider').selectOption('hermes');
      }
      try {
        await expectBrowser(page.getByText('Live · connected')).toBeVisible({ timeout: 20_000 });
      } catch (error) {
        throw new Error(`Public SSE did not connect; network failures: ${unexpectedNetworkFailures.join(', ') || 'none'}`, {
          cause: error,
        });
      }
      captureManagedSseRequests = false;
      await expectBrowser(page.getByRole('region', { name: 'Runtime brain pulse' })).toBeVisible();
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);

      const snapshotBefore = (await (await initialSnapshotResponse).json() as { data: PublicSnapshot }).data;
      expect(snapshotBefore.state).toBe('ready');
      expect(snapshotBefore.tasks.status).toBe('available');
      expect(snapshotBefore.runs.status).toBe('available');
      expect(snapshotBefore.events.status).toBe('available');
      const publicTask = snapshotBefore.tasks.data.find((task) => task.id === normalizedTaskId(taskId));
      expect(publicTask).toEqual(expect.objectContaining({
        state: sourceBefore.status,
        title: sourceBefore.title,
      }));
      expect(snapshotBefore.runs.data).toContainEqual(expect.objectContaining({
        id: `hermes:global:run:${sourceRunBefore}`,
        taskId: normalizedTaskId(taskId),
      }));
      expect(snapshotBefore.tasks.data.some((task) => task.title.toLowerCase().includes('design-interview'))).toBe(false);
      expectCredentialRedaction(snapshotBefore, credential, 'snapshot');
      expect(objectKeys(snapshotBefore).map((key) => key.toLowerCase())).not.toContain('authorization');
      expect(objectKeys(snapshotBefore).map((key) => key.toLowerCase())).not.toContain('operator_token');

      const inspectTask = page.getByRole('button', { name: `Inspect ${sourceBefore.title}` });
      await expectBrowser(inspectTask).toBeVisible();
      await inspectTask.click();
      const detail = page.getByRole('dialog', { name: `${sourceBefore.title} details` });
      await expectBrowser(detail).toBeVisible();
      await expectBrowser(detail.getByRole('definition').filter({ hasText: sourceBefore.status })).toBeVisible();
      await expectBrowser(detail.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
      await page.keyboard.press('Escape');
      await expectBrowser(inspectTask).toBeFocused();

      const liveMarker = `#3858 genuine live transition ${crypto.randomUUID()}`;
      await addAcceptanceComment(taskId, liveMarker, databasePath);
      const liveSource = sourceComment(databasePath, taskId, liveMarker);
      const expectedLiveEventId = normalizedCommentId(liveSource.id);
      const expectedOccurredAt = hermesTimestamp(liveSource.createdAt);
      const pulse = page.getByRole('region', { name: 'Runtime brain pulse' });
      await expectBrowser(pulse.getByText(liveMarker, { exact: true })).toBeVisible({ timeout: 20_000 });
      const openSource = pulse.getByRole('button', {
        name: `Open source task ${normalizedTaskId(taskId)} for event ${expectedLiveEventId}`,
      });
      await expectBrowser(openSource).toBeVisible();
      const liveEvent = openSource.locator('xpath=ancestor::li');
      await expectBrowser(liveEvent.getByText(normalizedTaskId(taskId), { exact: true })).toBeVisible();
      await expectBrowser(liveEvent.getByText(liveMarker, { exact: true })).toBeVisible();
      const eventTime = liveEvent.locator(`time[datetime="${expectedOccurredAt}"]`);
      await expectBrowser(eventTime).toBeVisible();
      expectCredentialRedaction(await liveEvent.evaluate((element) => element.outerHTML), credential, 'live SSE event');
      const rawLiveEvents = await page.evaluate<string[]>('window.__publicAcceptanceRawActivityEvents || []');
      const rawLiveEvent = rawLiveEvents.map((payload) => JSON.parse(payload) as Record<string, unknown>)
        .find((event) => event['id'] === expectedLiveEventId);
      expect(rawLiveEvent, 'The raw live SSE payload must be captured').toBeDefined();
      expectCredentialRedaction(rawLiveEvent, credential, 'raw live SSE payload');
      expect(objectKeys(rawLiveEvent).map((key) => key.toLowerCase())).not.toContain('authorization');
      await openSource.click();
      const sourceDetail = page.getByRole('dialog', { name: `${sourceBefore.title} details` });
      await expectBrowser(sourceDetail).toBeVisible();
      await sourceDetail.getByRole('button', { name: 'Close', exact: true }).click();

      const sourceBeforeAction = await readSourceTask(taskId, databasePath);
      const governedProbeTaskId = 't_3858_governor_probe';
      const governedProbeNormalizedId = normalizedTaskId(governedProbeTaskId);
      expect(sourceTaskExists(databasePath, governedProbeTaskId)).toBe(false);
      const governedResult = await page.evaluate(async ({ normalizedId }) => {
        const response = await fetch('/v1/smart-swarm/providers/hermes/actions', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            correlationId: crypto.randomUUID(),
            idempotencyKey: `public-governor-acceptance:${crypto.randomUUID()}`,
            action: {
              type: 'policy.apply',
              workspaceId: 'hermes:global',
              taskId: normalizedId,
              policy: 'promote-task',
              reason: 'Public acceptance governor probe against a verified nonexistent task',
            },
          }),
        });
        if (!response.ok) throw new Error(`Governed action failed with HTTP ${response.status}`);
        return (await response.json() as {
          data: {
            status: string;
            reason?: string;
            audit: {
              requestedBy: string;
              actionType: string;
              targetId: string;
              outcome: string;
            };
          };
        }).data;
      }, { normalizedId: governedProbeNormalizedId });
      expect(governedResult).toEqual(expect.objectContaining({
        status: 'rejected',
        reason: expect.stringContaining('not approved by the governor'),
        audit: {
          requestedBy: 'authenticated-operator',
          actionType: 'policy.apply',
          targetId: governedProbeNormalizedId,
          outcome: 'rejected',
        },
      }));
      expectCredentialRedaction(governedResult, credential, 'governed action response');
      const sourceAfterAction = await readSourceTask(taskId, databasePath);
      expect(sourceAfterAction.status).toBe(sourceBeforeAction.status);
      expect(sourceRunPointer(databasePath, taskId)).toBe(sourceRunBefore);
      expect(sourceTaskExists(databasePath, governedProbeTaskId)).toBe(false);

      const reconnectStreamPattern = '**/v1/smart-swarm/providers/hermes/events/*';
      let resolveHeldReconnect!: (request: Request) => void;
      const heldReconnect = new Promise<Request>((resolve) => {
        resolveHeldReconnect = resolve;
      });
      let releaseHeldReconnect!: () => void;
      const reconnectRelease = new Promise<void>((resolve) => {
        releaseHeldReconnect = resolve;
      });
      const holdReconnect = async (route: Route): Promise<void> => {
        if (new URL(route.request().url()).pathname.endsWith('/events/ticket')) {
          await route.continue();
          return;
        }
        resolveHeldReconnect(route.request());
        await reconnectRelease;
        await route.continue();
      };
      await page.route(reconnectStreamPattern, holdReconnect);
      const interruptedSseUrl = latestSseRequest?.url();
      if (!interruptedSseUrl) throw new Error('The deliberate interruption must target the active smart-swarm SSE request');
      expectedManagedSseUrls.add(interruptedSseUrl);
      captureManagedSseRequests = true;
      networkPhase = 'interruption';
      expect(await page.evaluate('window.__interruptPublicAcceptanceEventSource()')).toBe(true);
      await expectBrowser(page.getByText('Connection lost · reconnecting')).toBeVisible({ timeout: 15_000 });
      const reconnectRequest = await Promise.race([
        heldReconnect,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timed out holding reconnect SSE request')), 15_000)),
      ]);
      expectedManagedSseUrls.add(reconnectRequest.url());
      expect(new URL(reconnectRequest.url()).searchParams.get('cursor')).toBeTruthy();
      const replayMarker = `#3858 cursor replay ${crypto.randomUUID()}`;
      await addAcceptanceComment(taskId, replayMarker, databasePath);
      const replaySource = sourceComment(databasePath, taskId, replayMarker);
      releaseHeldReconnect();
      await expectBrowser(page.getByText('Live · connected')).toBeVisible({ timeout: 30_000 });
      await page.unroute(reconnectStreamPattern, holdReconnect);
      await expect.poll(async () => await page!.getByText(replayMarker, { exact: true }).count(), {
        timeout: 20_000,
      }).toBe(2);
      expect(await page.getByRole('button', {
        name: `Open source task ${normalizedTaskId(taskId)} for event ${normalizedCommentId(replaySource.id)}`,
      }).count()).toBe(1);
      const replayEvents = page.getByText(replayMarker, { exact: true });
      expectCredentialRedaction(await replayEvents.first().evaluate((element) => element.outerHTML), credential, 'replayed SSE event');
      const replayEventId = normalizedCommentId(replaySource.id);
      const rawReplayEvents = await page.evaluate<string[]>('window.__publicAcceptanceRawActivityEvents || []');
      const rawReplayEvent = rawReplayEvents.map((payload) => JSON.parse(payload) as Record<string, unknown>)
        .find((event) => event['id'] === replayEventId);
      expect(rawReplayEvent, 'The raw replayed SSE payload must be captured').toBeDefined();
      expectCredentialRedaction(rawReplayEvent, credential, 'raw replayed SSE payload');
      expect(objectKeys(rawReplayEvent).map((key) => key.toLowerCase())).not.toContain('authorization');
      captureManagedSseRequests = false;
      networkPhase = 'post-replay';
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 768, height: 1024 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(viewport);
        await expectNoHorizontalOverflow(page);
        await expectBrowser(page.getByRole('heading', { name: 'Smart Swarm', level: 1 })).toBeVisible();
      }

      expectCredentialRedaction(await page.content(), credential, 'rendered DOM');
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(unexpectedNetworkFailures).toEqual([]);
    } finally {
      await Promise.allSettled([
        page?.close(),
        context?.close(),
        browser?.close(),
      ].filter((cleanup): cleanup is Promise<void> => cleanup !== undefined));
    }
  }, 180_000);
});
