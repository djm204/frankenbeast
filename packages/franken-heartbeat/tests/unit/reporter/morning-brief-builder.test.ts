import { describe, it, expect } from 'vitest';
import { buildMorningBrief } from '../../../src/reporter/morning-brief-builder.js';
import type { HeartbeatReport } from '../../../src/core/types.js';

describe('buildMorningBrief', () => {
  it('builds brief from report with no reflection (pulse only)', () => {
    const report: HeartbeatReport = {
      timestamp: '2026-02-19T02:00:00Z',
      pulseResult: { status: 'HEARTBEAT_OK' },
      actions: [],
    };
    const brief = buildMorningBrief(report);
    expect(brief).toContain('HEARTBEAT_OK');
    expect(brief).toContain('2026-02-19');
  });

  it('builds brief with full reflection including patterns and improvements', () => {
    const report: HeartbeatReport = {
      timestamp: '2026-02-19T02:00:00Z',
      pulseResult: { status: 'FLAGS_FOUND', flags: [{ source: 'watchlist', description: 'pending', severity: 'low' }] },
      reflection: {
        patterns: ['repeated mock failures'],
        improvements: [{ target: 'skills', description: 'add error handler', priority: 'high' }],
        techDebt: [{ location: '/src/services', description: 'TODO cleanup', effort: 'small' }],
      },
      actions: [{ type: 'morning_brief', payload: {} }],
    };
    const brief = buildMorningBrief(report);
    expect(brief).toContain('repeated mock failures');
    expect(brief).toContain('add error handler');
    expect(brief).toContain('TODO cleanup');
  });

  it('formats brief as structured markdown', () => {
    const report: HeartbeatReport = {
      timestamp: '2026-02-19T02:00:00Z',
      pulseResult: { status: 'HEARTBEAT_OK' },
      actions: [],
    };
    const brief = buildMorningBrief(report);
    expect(brief).toContain('#');
  });
});
