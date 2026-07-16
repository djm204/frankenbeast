import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
import { AgentService } from '../../../src/beasts/services/agent-service.js';
import { CapacityReservationPolicy } from '../../../src/beasts/services/capacity-reservation-policy.js';

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
      initConfig: { labels: ['feature'] },
    });
    const securityAgent = service.createAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      createdByUser: 'operator',
      initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
      initConfig: { labels: ['security'] },
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
});
