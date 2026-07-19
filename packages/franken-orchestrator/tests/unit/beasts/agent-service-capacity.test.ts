import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
import { AgentService } from '../../../src/beasts/services/agent-service.js';
import { CapacityReservationPolicy } from '../../../src/beasts/services/capacity-reservation-policy.js';
import { defaultAgentToolPolicyConfig } from '../../../src/beasts/services/role-tool-manifest.js';

let workDir: string | undefined;

afterEach(async () => {
  if (workDir) {
    await rm(workDir, { recursive: true, force: true });
    workDir = undefined;
  }
});

describe('AgentService capacity reservations', () => {
  it('reports reservation liveness state from active tracked agents', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-agent-capacity-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const service = new AgentService(repo, () => '2026-07-15T00:00:00.000Z', {
      capacityPolicy: new CapacityReservationPolicy({
        totalSlots: 3,
        reservations: [{ id: 'security-urgent', slots: 1, labels: ['security'], categories: ['availability'] }],
      }),
    });

    const normalAgent = service.createAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
      initConfig: { labels: ['feature'], agentRole: 'coding', requestedTools: ['read_file', 'search_files', 'write_file', 'patch', 'terminal', 'terminal.background', 'github.read', 'github.comment', 'github.pr', 'kanban.comment'], skills: [] },
    });
    const securityAgent = service.createAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
      initConfig: { labels: ['security'], agentRole: 'coding', requestedTools: ['read_file', 'search_files', 'write_file', 'patch', 'terminal', 'terminal.background', 'github.read', 'github.comment', 'github.pr', 'kanban.comment'], skills: [] },
    });
    service.updateAgent(normalAgent.id, { status: 'running' });
    service.updateAgent(securityAgent.id, { status: 'running' });

    expect(service.getCapacityReservationState()).toEqual({
      totalSlots: 3,
      usedSlots: 2,
      freeSlots: 1,
      normalSlots: { total: 2, used: 1, free: 1 },
      reservations: [
        {
          id: 'security-urgent',
          slots: 1,
          used: 1,
          free: 0,
          released: false,
          labels: ['security'],
          categories: ['availability'],
        },
      ],
    });
  });

  it('keeps capacity summaries available when another tracked agent has corrupt JSON', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-agent-capacity-'));
    const dbPath = join(workDir, 'beasts.db');
    const repo = new SQLiteBeastRepository(dbPath);
    const service = new AgentService(repo, () => '2026-07-15T00:00:00.000Z', {
      capacityPolicy: new CapacityReservationPolicy({ totalSlots: 2, reservations: [] }),
    });
    const healthy = service.createAgent({
      definitionId: 'martin-loop', source: 'dashboard', createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
      initConfig: { ...defaultAgentToolPolicyConfig('martin-loop'), labels: ['feature'] },
    });
    const corrupt = service.createAgent({
      definitionId: 'martin-loop', source: 'dashboard', createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
      initConfig: { ...defaultAgentToolPolicyConfig('martin-loop'), labels: ['security'] },
    });
    service.updateAgent(healthy.id, { status: 'running' });
    service.updateAgent(corrupt.id, { status: 'running' });
    const db = new Database(dbPath);
    db.prepare('UPDATE tracked_agents SET init_config = ? WHERE id = ?').run('{"secret":"must-not-leak"', corrupt.id);
    db.close();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(service.getCapacityReservationState()).toMatchObject({ usedSlots: 1, freeSlots: 1 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`tracked_agents.init_config for row ${corrupt.id}`));
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('must-not-leak'));
    warn.mockRestore();
  });
});
