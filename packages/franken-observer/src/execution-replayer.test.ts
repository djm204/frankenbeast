import { describe, it, expect } from 'vitest';
import { AuditTrail, createAuditEvent } from './audit-event.js';
import { ExecutionReplayer } from './execution-replayer.js';

function buildTrail(
  specs: Array<{ type: string; phase: string; provider: string; payload?: unknown }>,
): AuditTrail {
  const trail = new AuditTrail();
  const baseTime = new Date('2026-03-26T00:00:00Z').getTime();
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i]!;
    const event = createAuditEvent(s.type, s.payload ?? {}, {
      phase: s.phase,
      provider: s.provider,
    });
    // Override timestamp for deterministic tests
    (event as { timestamp: string }).timestamp = new Date(baseTime + i * 1000).toISOString();
    trail.append(event);
  }
  return trail;
}

describe('ExecutionReplayer', () => {
  const replayer = new ExecutionReplayer();

  it('reconstructs timeline from audit trail', () => {
    const trail = buildTrail([
      { type: 'phase.start', phase: 'planning', provider: 'claude-cli' },
      { type: 'llm.request', phase: 'planning', provider: 'claude-cli' },
      { type: 'llm.response', phase: 'planning', provider: 'claude-cli' },
      { type: 'phase.end', phase: 'planning', provider: 'claude-cli' },
      { type: 'phase.start', phase: 'execution', provider: 'claude-cli' },
      { type: 'provider.switch', phase: 'execution', provider: 'codex-cli', payload: { from: 'claude-cli', to: 'codex-cli', reason: 'rate-limit' } },
      { type: 'llm.request', phase: 'execution', provider: 'codex-cli' },
      { type: 'llm.response', phase: 'execution', provider: 'codex-cli' },
      { type: 'phase.end', phase: 'execution', provider: 'codex-cli' },
    ]);

    const timeline = replayer.replay(trail);

    expect(timeline.phases).toHaveLength(2);
    expect(timeline.phases[0]!.phase).toBe('planning');
    expect(timeline.phases[1]!.phase).toBe('execution');
    expect(timeline.providerSwitches).toHaveLength(1);
    expect(timeline.providerSwitches[0]!.from).toBe('claude-cli');
    expect(timeline.providerSwitches[0]!.to).toBe('codex-cli');
    expect(timeline.providerSwitches[0]!.reason).toBe('rate-limit');
  });

  it('extracts errors with recovery status', () => {
    const trail = buildTrail([
      { type: 'phase.start', phase: 'execution', provider: 'claude-cli' },
      { type: 'error', phase: 'execution', provider: 'claude-cli', payload: { message: 'rate limit', recovered: true } },
      { type: 'phase.end', phase: 'execution', provider: 'codex-cli' },
    ]);

    const timeline = replayer.replay(trail);
    expect(timeline.errors).toHaveLength(1);
    expect(timeline.errors[0]!.error).toBe('rate limit');
    expect(timeline.errors[0]!.recovered).toBe(true);
  });

  it('calculates phase durations', () => {
    const trail = buildTrail([
      { type: 'phase.start', phase: 'planning', provider: 'claude-cli' },
      { type: 'phase.end', phase: 'planning', provider: 'claude-cli' },
    ]);

    const timeline = replayer.replay(trail);
    expect(timeline.phases[0]!.durationMs).toBe(1000); // 1 second apart
    expect(timeline.totalDurationMs).toBe(1000);
  });

  it('generates human-readable summary', () => {
    const trail = buildTrail([
      { type: 'phase.start', phase: 'planning', provider: 'claude-cli' },
      { type: 'provider.switch', phase: 'planning', provider: 'codex-cli', payload: { from: 'claude', to: 'codex', reason: 'error' } },
      { type: 'phase.end', phase: 'planning', provider: 'codex-cli' },
    ]);

    const timeline = replayer.replay(trail);
    expect(timeline.summary).toContain('planning');
    expect(timeline.summary).toContain('Provider switches: 1');
  });

  it('throws on empty trail', () => {
    expect(() => replayer.replay(new AuditTrail())).toThrow('Cannot replay empty audit trail');
  });
});
