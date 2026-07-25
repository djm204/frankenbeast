import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrainRegistry, SqliteBrain } from '@franken/brain';
import Database from 'better-sqlite3';

import { errorHandler } from '../../../src/http/middleware.js';
import { brainRoutes, type BrainRouteContext } from '../../../src/http/routes/brain-routes.js';
import { TransportSecurityService } from '../../../src/http/security/transport-security.js';
import { testCredential } from '../../support/test-credentials.js';

const OPERATOR_TOKEN = testCredential('TEST_BRAIN_ROUTES_OPERATOR_TOKEN');

function createApp(
  registry: BrainRegistry,
  resolveContext?: (agentTypeId: string) => BrainRouteContext | undefined,
): Hono {
  const app = new Hono();
  app.onError(errorHandler);
  app.route('/', brainRoutes({
    registry,
    resolveContext,
    operatorToken: OPERATOR_TOKEN,
    security: new TransportSecurityService(),
  }));
  return app;
}

function authorizedHeaders(): Record<string, string> {
  return { authorization: `Bearer ${OPERATOR_TOKEN}` };
}

describe('brain routes integration', () => {
  const tempDirs: string[] = [];
  const registries: BrainRegistry[] = [];

  afterEach(() => {
    for (const registry of registries.splice(0)) registry.close();
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function createRegistry(): { registry: BrainRegistry; brainsDir: string } {
    const root = mkdtempSync(join(tmpdir(), 'franken-brain-routes-'));
    const brainsDir = join(root, '.fbeast', 'brains');
    const registry = new BrainRegistry(brainsDir);
    tempDirs.push(root);
    registries.push(registry);
    return { registry, brainsDir };
  }

  it('requires operator authentication before reading brain state', async () => {
    const { registry } = createRegistry();
    registry.forAgentType('coder');

    const response = await createApp(registry).request('/v1/brain/coder');

    expect(response.status).toBe(401);
  });

  it('summarizes a real registry-backed brain with bounded keys and faculty availability', async () => {
    const { registry } = createRegistry();
    const brain = registry.forAgentType('coder');
    brain.working.set('goal', 'ship the route');
    brain.working.set('owner', 'coder');
    brain.episodic.record({
      type: 'observation',
      summary: 'First event',
      createdAt: '2026-07-24T10:00:00.000Z',
    });
    brain.recovery.checkpoint({
      runId: 'run-1',
      phase: 'verify',
      step: 2,
      context: {},
      timestamp: '2026-07-24T10:05:00.000Z',
    });

    const response = await createApp(registry).request('/v1/brain/coder', {
      headers: authorizedHeaders(),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        agentTypeId: 'coder',
        workingMemory: {
          keys: ['goal', 'owner'],
          total: 2,
          truncated: false,
        },
        episodic: { eventCount: 1 },
        recovery: { lastCheckpointAt: '2026-07-24T10:05:00.000Z' },
        faculties: {
          planning: { configured: false },
          reasoning: { configured: false },
          action: { configured: false },
          learning: { configured: false },
        },
        capabilities: {
          memoryReview: true,
          retentionReporting: true,
          recordLearning: true,
        },
        lessons: { available: false, count: null },
      },
    });
  });

  it('resolves a persisted custom brain path and service-side faculty configuration', async () => {
    const { registry, brainsDir } = createRegistry();
    mkdirSync(brainsDir, { recursive: true });
    const customDbPath = join(brainsDir, 'custom-coder.db');
    const writer = new SqliteBrain(customDbPath);
    writer.working.set('custom-key', 'custom-value');
    writer.working.flushToDb();
    writer.close();

    const response = await createApp(registry, () => ({
      dbPath: customDbPath,
      faculties: {
        planning: true,
        reasoning: true,
        action: true,
        learning: false,
      },
    })).request('/v1/brain/coder', { headers: authorizedHeaders() });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        workingMemory: { keys: ['custom-key'], total: 1 },
        faculties: {
          planning: { configured: true },
          reasoning: { configured: true },
          action: { configured: true },
          learning: { configured: false },
        },
      },
    });
    expect(existsSync(join(brainsDir, 'coder.db'))).toBe(false);
  });

  it('does not fabricate persisted state for a configured in-memory brain', async () => {
    const { registry } = createRegistry();
    const response = await createApp(registry, () => ({ dbPath: ':memory:' }))
      .request('/v1/brain/coder', { headers: authorizedHeaders() });

    expect(response.status).toBe(404);
  });

  it('reads working-memory keys written after the route brain was hydrated', async () => {
    const { registry, brainsDir } = createRegistry();
    registry.forAgentType('coder');
    const app = createApp(registry);
    const writer = new SqliteBrain(join(brainsDir, 'coder.db'));
    writer.working.set('late-key', 'late-value');
    writer.working.flushToDb();
    writer.close();

    const response = await app.request('/v1/brain/coder', { headers: authorizedHeaders() });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { workingMemory: { keys: ['late-key'], total: 1 } },
    });
  });

  it('paginates and filters episodic history within strict query bounds', async () => {
    const { registry } = createRegistry();
    const brain = registry.forAgentType('planner');
    for (const [index, summary] of ['alpha plan', 'beta result', 'alpha retry'].entries()) {
      brain.episodic.record({
        type: index === 1 ? 'success' : 'observation',
        summary,
        createdAt: `2026-07-24T10:0${index}:00.000Z`,
      });
    }
    brain.episodic.record({
      type: 'observation',
      summary: 'neutral event',
      details: { topic: 'gamma' },
      createdAt: '2026-07-24T09:59:00.000Z',
    });
    const app = createApp(registry);

    const first = await app.request('/v1/brain/planner/episodes?limit=2&offset=0', {
      headers: authorizedHeaders(),
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      data: [
        { summary: 'alpha retry' },
        { summary: 'beta result' },
      ],
      page: { limit: 2, offset: 0, hasMore: true, nextOffset: 2 },
    });

    const filtered = await app.request('/v1/brain/planner/episodes?query=alpha&limit=10', {
      headers: authorizedHeaders(),
    });
    expect(filtered.status).toBe(200);
    expect((await filtered.json() as { data: Array<{ summary: string }> }).data.map((event) => event.summary))
      .toEqual(['alpha retry', 'alpha plan']);

    const ranked = await app.request('/v1/brain/planner/episodes?query=alpha%20retry&limit=10', {
      headers: authorizedHeaders(),
    });
    expect((await ranked.json() as { data: Array<{ summary: string }> }).data.map((event) => event.summary))
      .toEqual(['alpha retry', 'alpha plan']);

    const detailsMatch = await app.request('/v1/brain/planner/episodes?query=gamma&limit=10', {
      headers: authorizedHeaders(),
    });
    expect(await detailsMatch.json()).toMatchObject({ data: [{ summary: 'neutral event' }] });
    expect(brain.accessAudit.list({ operation: 'episodic.readBoundedPage' })[0]).toMatchObject({
      outcome: 'success',
      details: { limit: 11, offset: 0, count: 1 },
    });

    const invalid = await app.request('/v1/brain/planner/episodes?limit=101', {
      headers: authorizedHeaders(),
    });
    expect(invalid.status).toBe(422);
  });

  it('bounds each episodic row before parsing oversized stored details', async () => {
    const { registry, brainsDir } = createRegistry();
    registry.forAgentType('coder').episodic.record({
      type: 'observation',
      step: 's'.repeat(1_000_000),
      summary: 'Large diagnostic event',
      details: { raw: 'x'.repeat(1_000_000) },
      createdAt: '2026-07-24T10:00:00.000Z',
    });
    const db = new Database(join(brainsDir, 'coder.db'));
    const { id: eventId } = db.prepare(
      'SELECT id FROM episodic_events ORDER BY id DESC LIMIT 1',
    ).get() as { id: string };
    db.prepare('UPDATE episodic_events SET details = ? WHERE id = ?')
      .run(`{"raw":"${'x'.repeat(1_000_000)}`, eventId);
    db.close();

    const response = await createApp(registry).request('/v1/brain/coder/episodes?limit=1', {
      headers: authorizedHeaders(),
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(Buffer.byteLength(body)).toBeLessThan(20_000);
    expect(JSON.parse(body)).toMatchObject({
      data: [{ details: null, detailsTruncated: true, stepTruncated: true }],
    });
  });

  it('reports lesson consolidation as unavailable until the learning faculty provides it', async () => {
    const { registry } = createRegistry();
    registry.forAgentType('reviewer');

    const response = await createApp(registry).request('/v1/brain/reviewer/lessons', {
      headers: authorizedHeaders(),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [],
      meta: {
        available: false,
        facultyConfigured: false,
        reason: 'Consolidated lessons are not available until the learning faculty is configured',
      },
    });
  });

  it('does not create a database for unknown or invalid agent types', async () => {
    const { registry, brainsDir } = createRegistry();
    const app = createApp(registry);

    const missing = await app.request('/v1/brain/unknown', { headers: authorizedHeaders() });
    expect(missing.status).toBe(404);
    expect(existsSync(join(brainsDir, 'unknown.db'))).toBe(false);

    const invalid = await app.request('/v1/brain/%2E%2E%2Fescape', { headers: authorizedHeaders() });
    expect(invalid.status).toBe(400);
  });

  it('returns a generic internal error when brain storage fails', async () => {
    const registry = {
      getAgentType: () => {
        throw new Error('secret database path /private/brain.db');
      },
    } as unknown as BrainRegistry;

    const response = await createApp(registry).request('/v1/brain/coder', {
      headers: authorizedHeaders(),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: 'BRAIN_READ_FAILED',
        message: 'Brain state could not be read',
      },
    });
  });
});
