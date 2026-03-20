# Chunk 7.2: Execution Replay

**Phase:** 7 — Observer Audit Trail
**Depends on:** Chunk 7.1 (audit event schema)
**Estimated size:** Small (~80 lines + tests)

---

## Purpose

Implement `ExecutionReplayer` that reconstructs the decision sequence from an audit trail. This allows auditors to see exactly what happened during an execution — which providers were used, what decisions were made, where failures occurred.

## Implementation

```typescript
// packages/franken-observer/src/execution-replayer.ts

import type { AuditEvent, AuditTrail } from './audit-event.js';

export interface ExecutionTimeline {
  runId: string;
  startTime: string;
  endTime: string;
  totalDurationMs: number;
  phases: PhaseTimeline[];
  providerSwitches: ProviderSwitchEvent[];
  errors: ErrorEvent[];
  summary: string;
}

export interface PhaseTimeline {
  phase: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  provider: string;
  eventCount: number;
  events: AuditEvent[];
}

export interface ProviderSwitchEvent {
  timestamp: string;
  from: string;
  to: string;
  reason: string;
  phase: string;
}

export interface ErrorEvent {
  timestamp: string;
  phase: string;
  provider: string;
  error: string;
  recovered: boolean;
}

export class ExecutionReplayer {
  /**
   * Reconstruct a timeline from an audit trail.
   */
  replay(trail: AuditTrail): ExecutionTimeline {
    const events = trail.getAll();
    if (events.length === 0) {
      throw new Error('Cannot replay empty audit trail');
    }

    const phases = this.groupByPhase(events);
    const switches = this.extractProviderSwitches(events);
    const errors = this.extractErrors(events);

    const startTime = events[0].timestamp;
    const endTime = events[events.length - 1].timestamp;

    return {
      runId: this.extractRunId(events),
      startTime,
      endTime,
      totalDurationMs: new Date(endTime).getTime() - new Date(startTime).getTime(),
      phases,
      providerSwitches: switches,
      errors,
      summary: this.generateSummary(phases, switches, errors),
    };
  }

  private groupByPhase(events: readonly AuditEvent[]): PhaseTimeline[] { ... }
  private extractProviderSwitches(events: readonly AuditEvent[]): ProviderSwitchEvent[] { ... }
  private extractErrors(events: readonly AuditEvent[]): ErrorEvent[] { ... }
  private extractRunId(events: readonly AuditEvent[]): string { ... }
  private generateSummary(...): string { ... }
}
```

## Tests

```typescript
describe('ExecutionReplayer', () => {
  describe('replay()', () => {
    it('reconstructs timeline from audit trail', () => {
      const trail = buildSampleTrail([
        { type: 'phase.start', phase: 'planning', provider: 'claude-cli' },
        { type: 'llm.request', phase: 'planning', provider: 'claude-cli' },
        { type: 'llm.response', phase: 'planning', provider: 'claude-cli' },
        { type: 'phase.end', phase: 'planning', provider: 'claude-cli' },
        { type: 'phase.start', phase: 'execution', provider: 'claude-cli' },
        { type: 'provider.switch', phase: 'execution', provider: 'codex-cli' },
        { type: 'llm.request', phase: 'execution', provider: 'codex-cli' },
        { type: 'llm.response', phase: 'execution', provider: 'codex-cli' },
        { type: 'phase.end', phase: 'execution', provider: 'codex-cli' },
      ]);

      const timeline = new ExecutionReplayer().replay(trail);

      expect(timeline.phases).toHaveLength(2);
      expect(timeline.phases[0].phase).toBe('planning');
      expect(timeline.phases[1].phase).toBe('execution');
      expect(timeline.providerSwitches).toHaveLength(1);
      expect(timeline.providerSwitches[0].from).toBe('claude-cli');
      expect(timeline.providerSwitches[0].to).toBe('codex-cli');
    });

    it('extracts errors with recovery status', () => { ... });
    it('calculates phase durations', () => { ... });
    it('generates human-readable summary', () => { ... });
    it('throws on empty trail', () => { ... });
  });
});
```

## Files

- **Add:** `packages/franken-observer/src/execution-replayer.ts`
- **Add:** `packages/franken-observer/tests/unit/execution-replayer.test.ts`

## Exit Criteria

- `ExecutionReplayer.replay()` produces an `ExecutionTimeline` from an `AuditTrail`
- Timeline includes phases, provider switches, errors, and summary
- Provider switches tracked with from/to/reason
- Errors tracked with recovery status
