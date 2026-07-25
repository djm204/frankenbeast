import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { HiveMindStore, hiveMindAgentTypeNamespace } from '@franken/brain';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BeastRepositoryJsonCorruptionError,
  SQLiteBeastRepository,
} from '../../../src/beasts/repository/sqlite-beast-repository.js';
import { AgentService } from '../../../src/beasts/services/agent-service.js';
import type { BeastRunService } from '../../../src/beasts/services/beast-run-service.js';
import {
  HiveStatusQuery,
  HIVE_STATUS_STALE_AFTER_MS,
  workspaceHiveId,
} from '../../../src/beasts/services/hive-status-query.js';

const NO_RUNS = { getRun: () => undefined } as unknown as BeastRunService;

function createAgent(agents: AgentService, definitionId: string, subjectId: string) {
  return agents.createAgent({
    definitionId,
    source: 'chat',
    createdByUser: subjectId,
    initAction: { kind: 'martin-loop', command: definitionId, config: {} },
    initConfig: {
      agentRole: 'coding',
      requestedTools: [
        'read_file', 'search_files', 'write_file', 'patch', 'terminal',
        'terminal.background', 'github.read', 'github.comment', 'github.pr', 'kanban.comment',
      ],
      skills: [],
    },
  });
}

describe('HiveStatusQuery', () => {
  const roots: string[] = [];
  const closeables: Array<{ close(): void }> = [];

  afterEach(() => {
    for (const closeable of closeables.splice(0).reverse()) closeable.close();
    for (const root of roots.splice(0).reverse()) rmSync(root, { recursive: true, force: true });
  });

  function createHarness(agentNow = '2026-07-25T11:59:00.000Z') {
    const root = mkdtempSync(join(tmpdir(), 'franken-hive-status-query-'));
    roots.push(root);
    const dbPath = join(root, '.fbeast', 'beast.db');
    const repository = new SQLiteBeastRepository(dbPath);
    const hive = new HiveMindStore(join(root, '.fbeast', 'hive', 'hive.db'));
    closeables.push(repository, hive);
    const agents = new AgentService(repository, () => agentNow);
    const query = new HiveStatusQuery(
      workspaceHiveId(root),
      agents,
      NO_RUNS,
      hive,
      () => new Date('2026-07-25T12:00:00.000Z'),
    );
    return { root, dbPath, agents, hive, query };
  }

  it('summarizes one tracked agent from real agent and hive stores', () => {
    const { agents, hive, query } = createHarness();
    const coder = createAgent(agents, 'coder', 'operator');
    agents.updateAgent(coder.id, { status: 'running' });
    hive.publish(hiveMindAgentTypeNamespace('coder'), 'registry-process-publisher', {
      kind: 'episode',
      event: {
        type: 'observation',
        summary: 'Implementing the status query',
        createdAt: '2026-07-25T11:59:30.000Z',
      },
    });

    expect(query.query({ subjectId: 'operator' })).toMatchObject({
      subjectId: 'operator',
      status: 'current',
      summary: '1 agent found in this workspace.',
      agents: [{
        agentId: coder.id,
        agentTypeId: 'coder',
        status: 'running',
        observation: 'current',
      }],
      recentActivity: [{
        agentTypeId: 'coder',
        kind: 'episode',
        summary: 'Implementing the status query',
      }],
      meta: { totalAgents: 1, truncated: false, hive: { status: 'available' } },
    });
  });

  it('truncates activity summaries at a complete UTF-8 boundary', () => {
    const { agents, hive, query } = createHarness();
    createAgent(agents, 'coder', 'operator');
    hive.publish(hiveMindAgentTypeNamespace('coder'), 'registry-process-publisher', {
      kind: 'episode',
      event: {
        type: 'observation',
        summary: `${'a'.repeat(1_023)}😀tail`,
        createdAt: '2026-07-25T11:59:30.000Z',
      },
    });

    const activity = query.query({ subjectId: 'operator' }).recentActivity[0];
    expect(activity?.truncated).toBe(true);
    expect(activity?.summary).not.toContain('�');
    expect(Buffer.byteLength(activity?.summary ?? '')).toBeLessThanOrEqual(1_024);
  });

  it('marks an old active status stale and keeps it visible when hive reads fail', () => {
    const { agents, hive, query } = createHarness('2026-07-25T11:00:00.000Z');
    const coder = createAgent(agents, 'coder', 'operator');
    agents.updateAgent(coder.id, { status: 'running' });
    hive.close();
    closeables.splice(closeables.indexOf(hive), 1);

    expect(query.query({ subjectId: 'operator' })).toMatchObject({
      status: 'partial',
      agents: [{
        agentId: coder.id,
        status: 'running',
        observation: 'stale',
      }],
      recentActivity: [],
      meta: {
        staleAfterMs: HIVE_STATUS_STALE_AFTER_MS,
        hive: { status: 'unavailable' },
      },
    });
  });

  it('rejects an active observation materially ahead of the query clock', () => {
    const { agents, query } = createHarness('2026-07-25T13:00:00.000Z');
    const coder = createAgent(agents, 'coder', 'operator');
    agents.updateAgent(coder.id, { status: 'running' });

    expect(query.query({ subjectId: 'operator' })).toMatchObject({
      status: 'partial',
      agents: [{
        agentId: coder.id,
        observation: 'unavailable',
        errorCode: 'INVALID_OBSERVATION_TIME',
      }],
    });
  });

  it('normalizes an overlong parseable observation timestamp', () => {
    const { root, agents, hive } = createHarness();
    const coder = createAgent(agents, 'coder', 'operator');
    const overlong = `July 25, 2026 11:59:00 UTC${' '.repeat(50)}`;
    const linkedAgents = {
      listAgentPage: () => ({
        agents: [{ ...coder, createdAt: overlong, updatedAt: overlong }],
        rowsScanned: 1,
      }),
    } as unknown as AgentService;
    const query = new HiveStatusQuery(
      workspaceHiveId(root),
      linkedAgents,
      NO_RUNS,
      hive,
      () => new Date('2026-07-25T12:00:00.000Z'),
    );

    expect(query.query({ subjectId: 'operator' }).agents[0]).toMatchObject({
      lastObservedAt: '2026-07-25T11:59:00.000Z',
      observation: 'current',
    });
  });

  it('bounds an invalid overlong observation timestamp without throwing', () => {
    const { root, agents, hive } = createHarness();
    const coder = createAgent(agents, 'coder', 'operator');
    const invalid = 'not-a-timestamp'.repeat(10);
    const linkedAgents = {
      listAgentPage: () => ({
        agents: [{ ...coder, createdAt: invalid, updatedAt: invalid }],
        rowsScanned: 1,
      }),
    } as unknown as AgentService;
    const query = new HiveStatusQuery(
      workspaceHiveId(root),
      linkedAgents,
      NO_RUNS,
      hive,
      () => new Date('2026-07-25T12:00:00.000Z'),
    );

    expect(query.query({ subjectId: 'operator' }).agents[0]).toMatchObject({
      lastObservedAt: '1970-01-01T00:00:00.000Z',
      observation: 'unavailable',
      errorCode: 'INVALID_OBSERVATION_TIME',
    });
  });

  it('marks an old pending-approval run stale using the run status vocabulary', () => {
    const { root, agents, hive } = createHarness();
    const coder = createAgent(agents, 'coder', 'operator');
    const linkedAgents = {
      listAgentPage: () => ({
        agents: [{ ...coder, status: 'awaiting_approval', dispatchRunId: 'run-1' }],
        rowsScanned: 1,
      }),
    } as unknown as AgentService;
    const runs = {
      getRun: () => ({
        id: 'run-1',
        trackedAgentId: coder.id,
        definitionId: 'coder',
        status: 'pending_approval',
        createdAt: '2026-07-25T11:00:00.000Z',
        startedAt: '2026-07-25T11:00:00.000Z',
        lastHeartbeatAt: '2026-07-25T11:00:00.000Z',
      }),
    } as unknown as BeastRunService;
    const query = new HiveStatusQuery(
      workspaceHiveId(root),
      linkedAgents,
      runs,
      hive,
      () => new Date('2026-07-25T12:00:00.000Z'),
    );

    expect(query.query({ subjectId: 'operator' }).agents[0]).toMatchObject({
      status: 'pending_approval',
      observation: 'stale',
    });
  });

  it('does not expose status from a linked run owned by another agent', () => {
    const { root, agents, hive } = createHarness();
    const coder = createAgent(agents, 'coder', 'operator');
    const linkedAgents = {
      listAgentPage: () => ({
        agents: [{ ...coder, dispatchRunId: 'run-1' }],
        rowsScanned: 1,
      }),
    } as unknown as AgentService;
    const runs = {
      getRun: () => ({
        id: 'run-1',
        trackedAgentId: 'another-agent',
        definitionId: 'reviewer',
        status: 'failed',
        createdAt: '2026-07-25T11:59:00.000Z',
      }),
    } as unknown as BeastRunService;
    const query = new HiveStatusQuery(
      workspaceHiveId(root),
      linkedAgents,
      runs,
      hive,
      () => new Date('2026-07-25T12:00:00.000Z'),
    );

    expect(query.query({ subjectId: 'operator' }).agents[0]).toMatchObject({
      status: 'initializing',
      observation: 'unavailable',
      errorCode: 'LINKED_RUN_MISMATCH',
    });
  });

  it('does not attribute activity published by a mismatched linked run', () => {
    const { root, agents, hive } = createHarness();
    const coder = createAgent(agents, 'coder', 'operator');
    const linkedAgents = {
      listAgentPage: () => ({
        agents: [{ ...coder, dispatchRunId: 'run-1' }],
        rowsScanned: 1,
      }),
    } as unknown as AgentService;
    const runs = {
      getRun: () => ({
        id: 'run-1',
        trackedAgentId: 'another-agent',
        definitionId: 'reviewer',
        status: 'running',
        createdAt: '2026-07-25T11:59:00.000Z',
      }),
    } as unknown as BeastRunService;
    hive.publish(hiveMindAgentTypeNamespace('coder'), 'run-1', {
      kind: 'episode',
      event: {
        type: 'observation',
        summary: 'Activity owned by another agent',
        createdAt: '2026-07-25T11:59:30.000Z',
      },
    });
    const query = new HiveStatusQuery(
      workspaceHiveId(root),
      linkedAgents,
      runs,
      hive,
      () => new Date('2026-07-25T12:00:00.000Z'),
    );

    expect(query.query({ subjectId: 'operator' }).recentActivity).toEqual([]);
  });

  it('degrades a corrupt linked run to an unavailable agent observation', () => {
    const { root, agents, hive } = createHarness();
    const coder = createAgent(agents, 'coder', 'operator');
    const linkedAgents = {
      listAgentPage: () => ({
        agents: [{ ...coder, dispatchRunId: 'run-corrupt' }],
        rowsScanned: 1,
      }),
    } as unknown as AgentService;
    const runs = {
      getRun: () => {
        throw new BeastRepositoryJsonCorruptionError({
          table: 'beast_runs',
          column: 'config_snapshot',
          rowId: 'run-corrupt',
          valueSnippet: '[redacted]',
        });
      },
    } as unknown as BeastRunService;
    const query = new HiveStatusQuery(
      workspaceHiveId(root),
      linkedAgents,
      runs,
      hive,
      () => new Date('2026-07-25T12:00:00.000Z'),
    );
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(query.query({ subjectId: 'operator' })).toMatchObject({
      status: 'partial',
      agents: [{
        agentId: coder.id,
        observation: 'unavailable',
        errorCode: 'LINKED_RUN_NOT_FOUND',
      }],
    });
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
  });

  it('filters by subject and reports bounded truncation', () => {
    const { agents, query } = createHarness();
    createAgent(agents, 'coder', 'operator');
    createAgent(agents, 'reviewer', 'operator');
    createAgent(agents, 'planner', 'another-operator');

    const result = query.query({ subjectId: 'operator', limit: 1 });

    expect(result.agents).toHaveLength(1);
    expect(result.agents[0]?.agentTypeId).not.toBe('planner');
    expect(result.meta).toMatchObject({ limit: 1, totalAgents: null, truncated: true });
    expect(result.summary).toContain('more agents omitted');
  });

  it('omits hive activity when an agent-type namespace is shared by subjects', () => {
    const { agents, hive, query } = createHarness();
    createAgent(agents, 'coder', 'operator');
    createAgent(agents, 'coder', 'another-operator');
    hive.publish(hiveMindAgentTypeNamespace('coder'), 'registry-process-publisher', {
      kind: 'episode',
      event: {
        type: 'observation',
        summary: 'Could belong to either subject',
        createdAt: '2026-07-25T11:59:30.000Z',
      },
    });

    expect(query.query({ subjectId: 'operator' })).toMatchObject({
      status: 'partial',
      recentActivity: [],
      meta: {
        hive: {
          status: 'partial',
          errorCodes: ['ATTRIBUTION_AMBIGUOUS'],
        },
      },
    });
  });

  it('reports mixed successful and failed hive namespace reads as partial', () => {
    const { agents, hive, query } = createHarness();
    createAgent(agents, 'coder', 'operator');
    createAgent(agents, 'reviewer', 'operator');
    hive.publish(hiveMindAgentTypeNamespace('reviewer'), 'registry-process-publisher', {
      kind: 'episode',
      event: {
        type: 'observation',
        summary: 'Reviewer activity remains readable',
        createdAt: '2026-07-25T11:59:30.000Z',
      },
    });
    const recent = hive.recent.bind(hive);
    vi.spyOn(hive, 'recent').mockImplementation((namespace, options) => {
      if (namespace === hiveMindAgentTypeNamespace('coder')) throw new Error('corrupt coder namespace');
      return recent(namespace, options);
    });

    expect(query.query({ subjectId: 'operator' })).toMatchObject({
      status: 'partial',
      recentActivity: [{ summary: 'Reviewer activity remains readable' }],
      meta: { hive: { status: 'partial' } },
    });
  });

  it('degrades an overlong hive timestamp while retaining readable namespaces', () => {
    const { agents, hive, query } = createHarness();
    createAgent(agents, 'coder', 'operator');
    createAgent(agents, 'reviewer', 'operator');
    hive.publish(hiveMindAgentTypeNamespace('coder'), 'coder-publisher', {
      kind: 'episode',
      event: {
        type: 'observation',
        summary: 'Malformed coder activity',
        createdAt: '2026-07-25T11:59:30.000Z',
      },
    });
    hive.publish(hiveMindAgentTypeNamespace('reviewer'), 'reviewer-publisher', {
      kind: 'episode',
      event: {
        type: 'observation',
        summary: 'Readable reviewer activity',
        createdAt: '2026-07-25T11:59:30.000Z',
      },
    });
    const recent = hive.recent.bind(hive);
    vi.spyOn(hive, 'recent').mockImplementation((namespace, options) => {
      const entries = recent(namespace, options);
      return namespace === hiveMindAgentTypeNamespace('coder')
        ? entries.map((entry) => ({ ...entry, publishedAt: 'x'.repeat(65) }))
        : entries;
    });

    expect(query.query({ subjectId: 'operator' })).toMatchObject({
      status: 'partial',
      recentActivity: [{ summary: 'Readable reviewer activity' }],
      meta: { hive: { status: 'partial' } },
    });
  });

  it('does not attribute type-level activity past a deleted agent from another subject', () => {
    const { agents, hive, query } = createHarness();
    createAgent(agents, 'coder', 'operator');
    const deleted = createAgent(agents, 'coder', 'another-operator');
    agents.updateAgent(deleted.id, { status: 'completed' });
    agents.softDeleteAgent(deleted.id);
    hive.publish(hiveMindAgentTypeNamespace('coder'), 'registry-process-publisher', {
      kind: 'episode',
      event: {
        type: 'observation',
        summary: 'Could belong to the deleted agent',
        createdAt: '2026-07-25T11:59:30.000Z',
      },
    });

    expect(query.query({ subjectId: 'operator' })).toMatchObject({
      status: 'partial',
      recentActivity: [],
      meta: {
        hive: {
          status: 'partial',
          errorCodes: ['ATTRIBUTION_AMBIGUOUS'],
        },
      },
    });
  });

  it('fails closed on type-level attribution when a corrupt agent row is skipped', () => {
    const { dbPath, agents, hive, query } = createHarness();
    createAgent(agents, 'coder', 'operator');
    const corrupt = createAgent(agents, 'coder', 'another-operator');
    const db = new Database(dbPath);
    closeables.push(db);
    db.prepare('UPDATE tracked_agents SET init_config = ? WHERE id = ?').run('{', corrupt.id);
    hive.publish(hiveMindAgentTypeNamespace('coder'), 'registry-process-publisher', {
      kind: 'episode',
      event: {
        type: 'observation',
        summary: 'Could belong to the skipped agent',
        createdAt: '2026-07-25T11:59:30.000Z',
      },
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(query.query({ subjectId: 'operator' })).toMatchObject({
      status: 'partial',
      recentActivity: [],
      meta: {
        hive: {
          status: 'partial',
          errorCodes: ['ATTRIBUTION_INCOMPLETE'],
        },
      },
    });
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
  });

  it('does not duplicate type-level activity for multiple agents owned by one subject', () => {
    const { agents, hive, query } = createHarness();
    createAgent(agents, 'coder', 'operator');
    createAgent(agents, 'coder', 'operator');
    hive.publish(hiveMindAgentTypeNamespace('coder'), 'registry-process-publisher', {
      kind: 'episode',
      event: {
        type: 'observation',
        summary: 'Shared coder activity',
        createdAt: '2026-07-25T11:59:30.000Z',
      },
    });

    expect(query.query({ subjectId: 'operator' }).recentActivity).toEqual([
      expect.objectContaining({ summary: 'Shared coder activity' }),
    ]);
  });

  it('isolates separate workspace stores', () => {
    const first = createHarness();
    const second = createHarness();
    createAgent(first.agents, 'coder', 'operator');
    first.hive.publish(hiveMindAgentTypeNamespace('coder'), 'unrelated-publisher', {
      kind: 'episode',
      event: { type: 'observation', summary: 'First workspace only', createdAt: '2026-07-25T11:59:30.000Z' },
    });

    expect(second.query.query({ subjectId: 'operator' })).toMatchObject({
      agents: [],
      recentActivity: [],
      meta: { totalAgents: 0, truncated: false },
    });
    expect(first.query.query({ subjectId: 'operator' }).workspaceId)
      .not.toBe(second.query.query({ subjectId: 'operator' }).workspaceId);
  });

  it('rejects unbounded or unidentified queries before reading stores', () => {
    const { query } = createHarness();
    expect(() => query.query({ subjectId: 'operator', limit: 101 })).toThrow(/limit/i);
    expect(() => query.query({ subjectId: '' })).toThrow(/subjectId/i);
    expect(() => query.query({ subjectId: 'x'.repeat(257) })).toThrow(/subjectId/i);
  });

  it('counts corrupt physical rows toward the 1,000-row scan bound', () => {
    const { dbPath, agents, query } = createHarness();
    createAgent(agents, 'coder', 'operator');
    const db = new Database(dbPath);
    closeables.push(db);
    const insert = db.prepare(`
      INSERT INTO tracked_agents (
        id, definition_id, source, status, created_by_user,
        init_action, init_config, created_at, updated_at
      ) VALUES (?, 'planner', 'chat', 'initializing', 'other-user', '{}', '{', ?, ?)
    `);
    db.transaction(() => {
      for (let index = 0; index < 1_001; index += 1) {
        const timestamp = `2026-07-26T00:${String(Math.floor(index / 60) % 60).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`;
        insert.run(`corrupt-${String(index).padStart(4, '0')}`, timestamp, timestamp);
      }
    })();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = query.query({ subjectId: 'operator', limit: 100 });

    expect(result.status).toBe('partial');
    expect(result.agents).toEqual([]);
    expect(result.summary).not.toContain('No agents have been dispatched');
    expect(result.meta).toMatchObject({ truncated: true, scanIncomplete: true });
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
  });
});
