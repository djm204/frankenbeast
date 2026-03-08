import { describe, it, expect } from 'vitest';
import {
  type PulseResult,
  type Flag,
  type ReflectionResult,
  type HeartbeatReport,
  type Action,
  FlagSchema,
  PulseResultSchema,
  ActionSchema,
} from '../../../src/core/types.js';

describe('PulseResult', () => {
  it('narrows to HEARTBEAT_OK with no flags', () => {
    const result: PulseResult = { status: 'HEARTBEAT_OK' };
    expect(result.status).toBe('HEARTBEAT_OK');
    if (result.status === 'HEARTBEAT_OK') {
      // TypeScript should narrow — no flags property
      expect('flags' in result).toBe(false);
    }
  });

  it('narrows to FLAGS_FOUND with flags array', () => {
    const result: PulseResult = {
      status: 'FLAGS_FOUND',
      flags: [{ source: 'watchlist', description: 'pending task', severity: 'low' }],
    };
    if (result.status === 'FLAGS_FOUND') {
      expect(result.flags).toHaveLength(1);
      expect(result.flags[0]?.source).toBe('watchlist');
    }
  });

  it('validates via Zod schema', () => {
    const valid = PulseResultSchema.safeParse({ status: 'HEARTBEAT_OK' });
    expect(valid.success).toBe(true);

    const invalid = PulseResultSchema.safeParse({ status: 'UNKNOWN' });
    expect(invalid.success).toBe(false);
  });
});

describe('Flag', () => {
  it('accepts valid severity values', () => {
    for (const severity of ['low', 'medium', 'high'] as const) {
      const result = FlagSchema.safeParse({
        source: 'test',
        description: 'desc',
        severity,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid severity values', () => {
    const result = FlagSchema.safeParse({
      source: 'test',
      description: 'desc',
      severity: 'critical',
    });
    expect(result.success).toBe(false);
  });
});

describe('Action', () => {
  it('accepts valid action types', () => {
    for (const type of ['skill_proposal', 'planner_task', 'morning_brief'] as const) {
      const result = ActionSchema.safeParse({ type, payload: {} });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid action types', () => {
    const result = ActionSchema.safeParse({ type: 'invalid', payload: {} });
    expect(result.success).toBe(false);
  });
});

describe('HeartbeatReport', () => {
  it('includes optional reflection field', () => {
    const report: HeartbeatReport = {
      timestamp: '2026-02-19T02:00:00Z',
      pulseResult: { status: 'HEARTBEAT_OK' },
      actions: [],
    };
    expect(report.reflection).toBeUndefined();
  });

  it('includes reflection when provided', () => {
    const reflection: ReflectionResult = {
      patterns: ['repeated mock failures'],
      improvements: [{ target: 'skills', description: 'add API error handler', priority: 'high' }],
      techDebt: [{ location: '/src/services', description: 'TODO comments', effort: 'small' }],
    };
    const report: HeartbeatReport = {
      timestamp: '2026-02-19T02:00:00Z',
      pulseResult: { status: 'FLAGS_FOUND', flags: [] },
      reflection,
      actions: [],
    };
    expect(report.reflection?.patterns).toHaveLength(1);
  });
});
