import { describe, it, expect, vi } from 'vitest';
import { HeartbeatPortAdapter } from '../../../src/adapters/heartbeat-adapter.js';

describe('HeartbeatPortAdapter', () => {
  it('maps heartbeat report to pulse result', async () => {
    const pulseOrchestrator = {
      run: vi.fn().mockResolvedValue({
        timestamp: '2026-03-05T00:00:00.000Z',
        pulseResult: {
          status: 'FLAGS_FOUND',
          flags: [{ source: 'git', description: 'dirty', severity: 'low' }],
        },
        reflection: {
          patterns: [],
          improvements: [
            { target: 'tests', description: 'Add coverage', priority: 'high' },
          ],
          techDebt: [
            { location: 'src/app.ts', description: 'Refactor', effort: 'small' },
          ],
        },
        actions: [],
      }),
    };

    const adapter = new HeartbeatPortAdapter({ pulseOrchestrator });

    const result = await adapter.pulse();

    expect(result).toEqual({
      improvements: ['Add coverage'],
      techDebt: ['src/app.ts: Refactor'],
      summary: 'Heartbeat flags found (1) with 1 improvements',
    });
  });

  it('handles heartbeat ok without reflection', async () => {
    const pulseOrchestrator = {
      run: vi.fn().mockResolvedValue({
        timestamp: '2026-03-05T00:00:00.000Z',
        pulseResult: { status: 'HEARTBEAT_OK' },
        actions: [],
      }),
    };

    const adapter = new HeartbeatPortAdapter({ pulseOrchestrator });
    const result = await adapter.pulse();

    expect(result).toEqual({
      improvements: [],
      techDebt: [],
      summary: 'Heartbeat OK',
    });
  });

  it('wraps pulse errors', async () => {
    const pulseOrchestrator = {
      run: vi.fn().mockRejectedValue(new Error('boom')),
    };

    const adapter = new HeartbeatPortAdapter({ pulseOrchestrator });

    await expect(adapter.pulse()).rejects.toThrow('HeartbeatPortAdapter failed');
  });
});
