import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  CREATE_TABLES,
  SELECT_RESOURCE_SAMPLES_BY_AGENT,
  SELECT_RESOURCE_SAMPLES_BY_AGENT_AND_RUN,
  SELECT_RESOURCE_SAMPLES_BY_RUN,
} from './schema.js';

describe('process resource sample query schema', () => {
  it.each([
    ['agent', SELECT_RESOURCE_SAMPLES_BY_AGENT, { agentId: 'agent-1', since: 0, before: 2_000, limit: 100 }, 'idx_process_resource_samples_agent_timestamp'],
    ['run', SELECT_RESOURCE_SAMPLES_BY_RUN, { runId: 'run-1', since: 0, before: 2_000, limit: 100 }, 'idx_process_resource_samples_run_timestamp'],
    ['agent and run', SELECT_RESOURCE_SAMPLES_BY_AGENT_AND_RUN, { agentId: 'agent-1', runId: 'run-1', since: 0, before: 2_000, limit: 100 }, 'idx_process_resource_samples_run_timestamp'],
  ])('uses an identifier/time index for %s queries', (_scope, sql, params, expectedIndex) => {
    const db = new Database(':memory:');
    db.exec(CREATE_TABLES);

    const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(params) as Array<{ detail: string }>;

    expect(plan.some(row => row.detail.includes(expectedIndex))).toBe(true);
    db.close();
  });
});