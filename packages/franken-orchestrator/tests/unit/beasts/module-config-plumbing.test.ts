import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
import { AgentService } from '../../../src/beasts/services/agent-service.js';
import { BeastDispatchService } from '../../../src/beasts/services/beast-dispatch-service.js';
import { BeastCatalogService } from '../../../src/beasts/services/beast-catalog-service.js';
import { BeastLogStore } from '../../../src/beasts/events/beast-log-store.js';
import { PrometheusBeastMetrics } from '../../../src/beasts/telemetry/prometheus-beast-metrics.js';
import type { ModuleConfig } from '../../../src/beasts/types.js';

function stubExecutors(repo: SQLiteBeastRepository) {
  return {
    process: {
      start: vi.fn(async (run: { id: string }) => repo.createAttempt(run.id, { status: 'running' })),
      stop: vi.fn(),
      kill: vi.fn(),
    },
    container: {
      start: vi.fn(),
      stop: vi.fn(),
      kill: vi.fn(),
    },
  };
}

describe('ModuleConfig plumbing', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  describe('SQLiteBeastRepository', () => {
    it('persists and reads moduleConfig on tracked agents', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-modcfg-repo-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const moduleConfig: ModuleConfig = { firewall: true, skills: false, governor: false };

      const agent = repo.createTrackedAgent({
        definitionId: 'martin-loop',
        source: 'dashboard',
        status: 'initializing',
        createdByUser: 'operator',
        initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
        initConfig: {},
        moduleConfig,
        createdAt: '2026-03-13T00:00:00.000Z',
        updatedAt: '2026-03-13T00:00:00.000Z',
      });

      expect(agent.moduleConfig).toEqual(moduleConfig);

      const fetched = repo.getTrackedAgent(agent.id);
      expect(fetched?.moduleConfig).toEqual(moduleConfig);
    });

    it('defaults to no moduleConfig when not provided', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-modcfg-repo-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));

      const agent = repo.createTrackedAgent({
        definitionId: 'martin-loop',
        source: 'cli',
        status: 'initializing',
        createdByUser: 'operator',
        initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
        initConfig: {},
        createdAt: '2026-03-13T00:00:00.000Z',
        updatedAt: '2026-03-13T00:00:00.000Z',
      });

      expect(agent.moduleConfig).toBeUndefined();
      const fetched = repo.getTrackedAgent(agent.id);
      expect(fetched?.moduleConfig).toBeUndefined();
    });

    it('updates moduleConfig on existing tracked agents', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-modcfg-repo-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));

      const agent = repo.createTrackedAgent({
        definitionId: 'martin-loop',
        source: 'dashboard',
        status: 'initializing',
        createdByUser: 'operator',
        initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
        initConfig: {},
        createdAt: '2026-03-13T00:00:00.000Z',
        updatedAt: '2026-03-13T00:00:00.000Z',
      });

      const updated = repo.updateTrackedAgent(agent.id, {
        moduleConfig: { critique: false, heartbeat: false },
        updatedAt: '2026-03-13T00:00:01.000Z',
      });

      expect(updated.moduleConfig).toEqual({ critique: false, heartbeat: false });
      const fetched = repo.getTrackedAgent(agent.id);
      expect(fetched?.moduleConfig).toEqual({ critique: false, heartbeat: false });
    });

    it('migrates legacy schema to include module_config column', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-modcfg-migrate-'));
      // First repo creates the schema with module_config
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const agent = repo.createTrackedAgent({
        definitionId: 'martin-loop',
        source: 'dashboard',
        status: 'initializing',
        createdByUser: 'operator',
        initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
        initConfig: {},
        moduleConfig: { firewall: false },
        createdAt: '2026-03-13T00:00:00.000Z',
        updatedAt: '2026-03-13T00:00:00.000Z',
      });
      repo.close();

      // Re-open — migration should be idempotent
      const repo2 = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const fetched = repo2.getTrackedAgent(agent.id);
      expect(fetched?.moduleConfig).toEqual({ firewall: false });
      repo2.close();
    });
  });

  describe('AgentService', () => {
    it('passes moduleConfig through createAgent', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-modcfg-svc-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const service = new AgentService(repo, () => '2026-03-13T00:00:00.000Z');

      const agent = service.createAgent({
        definitionId: 'martin-loop',
        source: 'dashboard',
        createdByUser: 'operator',
        initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
        initConfig: {},
        moduleConfig: { skills: false, planner: false },
      });

      expect(agent.moduleConfig).toEqual({ skills: false, planner: false });
    });

    it('updates moduleConfig via updateAgent', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-modcfg-svc-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const service = new AgentService(repo, () => '2026-03-13T00:00:00.000Z');

      const agent = service.createAgent({
        definitionId: 'martin-loop',
        source: 'dashboard',
        createdByUser: 'operator',
        initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
        initConfig: {},
      });

      const updated = service.updateAgent(agent.id, {
        moduleConfig: { governor: false },
      });

      expect(updated.moduleConfig).toEqual({ governor: false });
    });
  });

  describe('BeastDispatchService', () => {
    it('merges explicit moduleConfig into configSnapshot.modules', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-modcfg-dispatch-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const metrics = new PrometheusBeastMetrics();
      const executors = stubExecutors(repo);
      const dispatch = new BeastDispatchService(repo, new BeastCatalogService(), executors, metrics, logs);

      const run = await dispatch.createRun({
        definitionId: 'martin-loop',
        config: {
          provider: 'claude',
          objective: 'test module config',
          chunkDirectory: 'docs/chunks',
        },
        dispatchedBy: 'dashboard',
        dispatchedByUser: 'operator',
        moduleConfig: { firewall: false, critique: false },
      });

      expect(run.configSnapshot).toMatchObject({
        modules: { firewall: false, critique: false },
      });
    });

    it('resolves moduleConfig from tracked agent when not explicit', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-modcfg-dispatch-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const metrics = new PrometheusBeastMetrics();
      const executors = stubExecutors(repo);
      const agents = new AgentService(repo, () => '2026-03-13T00:00:00.000Z');
      const dispatch = new BeastDispatchService(repo, new BeastCatalogService(), executors, metrics, logs);

      const agent = agents.createAgent({
        definitionId: 'martin-loop',
        source: 'dashboard',
        createdByUser: 'operator',
        initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
        initConfig: {
          provider: 'claude',
          objective: 'test agent fallback',
          chunkDirectory: 'docs/chunks',
        },
        moduleConfig: { governor: false, heartbeat: false },
      });

      const run = await dispatch.createRun({
        definitionId: 'martin-loop',
        trackedAgentId: agent.id,
        config: {
          provider: 'claude',
          objective: 'test agent fallback',
          chunkDirectory: 'docs/chunks',
        },
        dispatchedBy: 'dashboard',
        dispatchedByUser: 'operator',
      });

      expect(run.configSnapshot).toMatchObject({
        modules: { governor: false, heartbeat: false },
      });
    });

    it('omits modules from configSnapshot when no moduleConfig provided', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-modcfg-dispatch-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const metrics = new PrometheusBeastMetrics();
      const executors = stubExecutors(repo);
      const dispatch = new BeastDispatchService(repo, new BeastCatalogService(), executors, metrics, logs);

      const run = await dispatch.createRun({
        definitionId: 'martin-loop',
        config: {
          provider: 'claude',
          objective: 'no module config',
          chunkDirectory: 'docs/chunks',
        },
        dispatchedBy: 'cli',
        dispatchedByUser: 'operator',
      });

      expect(run.configSnapshot).not.toHaveProperty('modules');
    });

    it('explicit moduleConfig overrides agent moduleConfig', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-modcfg-dispatch-'));
      const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
      const logs = new BeastLogStore(join(workDir, 'logs'));
      const metrics = new PrometheusBeastMetrics();
      const executors = stubExecutors(repo);
      const agents = new AgentService(repo, () => '2026-03-13T00:00:00.000Z');
      const dispatch = new BeastDispatchService(repo, new BeastCatalogService(), executors, metrics, logs);

      const agent = agents.createAgent({
        definitionId: 'martin-loop',
        source: 'dashboard',
        createdByUser: 'operator',
        initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
        initConfig: {
          provider: 'claude',
          objective: 'override test',
          chunkDirectory: 'docs/chunks',
        },
        moduleConfig: { governor: false },
      });

      const run = await dispatch.createRun({
        definitionId: 'martin-loop',
        trackedAgentId: agent.id,
        config: {
          provider: 'claude',
          objective: 'override test',
          chunkDirectory: 'docs/chunks',
        },
        dispatchedBy: 'dashboard',
        dispatchedByUser: 'operator',
        moduleConfig: { firewall: false },
      });

      // Explicit moduleConfig takes precedence over agent's moduleConfig
      expect(run.configSnapshot).toMatchObject({
        modules: { firewall: false },
      });
      expect((run.configSnapshot as Record<string, unknown>).modules).not.toHaveProperty('governor');
    });
  });

  describe('CLI args', () => {
    it('builds moduleConfig from --no-* flags', async () => {
      const { parseArgs } = await import('../../../src/cli/args.js');
      const args = parseArgs(['beasts', 'spawn', 'martin-loop', '--no-firewall', '--no-critique']);
      expect(args.moduleConfig).toEqual({ firewall: false, critique: false });
    });

    it('returns undefined moduleConfig when no --no-* flags provided', async () => {
      const { parseArgs } = await import('../../../src/cli/args.js');
      const args = parseArgs(['beasts', 'spawn', 'martin-loop']);
      expect(args.moduleConfig).toBeUndefined();
    });
  });
});
