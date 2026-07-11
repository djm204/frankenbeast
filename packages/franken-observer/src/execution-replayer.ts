import type { AuditEvent } from './audit-event.js';
import { AuditTrail } from './audit-event.js';

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

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
  replay(trail: AuditTrail): ExecutionTimeline {
    const events = trail.getAll();
    if (events.length === 0) {
      throw new Error('Cannot replay empty audit trail');
    }

    this.validateEventTimestamps(events);

    const phases = this.groupByPhase(events);
    const switches = this.extractProviderSwitches(events);
    const errors = this.extractErrors(events);

    const startEvent = events[0]!;
    const endEvent = events[events.length - 1]!;
    const startTime = startEvent.timestamp;
    const endTime = endEvent.timestamp;

    return {
      runId: this.extractRunId(events),
      startTime,
      endTime,
      totalDurationMs:
        this.parseEventTimestamp(endEvent, 'execution timeline end') -
        this.parseEventTimestamp(startEvent, 'execution timeline start'),
      phases,
      providerSwitches: switches,
      errors,
      summary: this.generateSummary(phases, switches, errors),
    };
  }

  private groupByPhase(events: readonly AuditEvent[]): PhaseTimeline[] {
    const phaseMap = new Map<string, AuditEvent[]>();
    for (const event of events) {
      const existing = phaseMap.get(event.phase) ?? [];
      existing.push(event);
      phaseMap.set(event.phase, existing);
    }

    return [...phaseMap.entries()].map(([phase, phaseEvents]) => {
      const startEvent = phaseEvents[0]!;
      const endEvent = phaseEvents[phaseEvents.length - 1]!;
      return {
        phase,
        startTime: startEvent.timestamp,
        endTime: endEvent.timestamp,
        durationMs:
          this.parseEventTimestamp(endEvent, `phase ${phase} end`) -
          this.parseEventTimestamp(startEvent, `phase ${phase} start`),
        provider: endEvent.provider,
        eventCount: phaseEvents.length,
        events: phaseEvents,
      };
    });
  }

  private validateEventTimestamps(events: readonly AuditEvent[]): void {
    for (const event of events) {
      this.parseEventTimestamp(event, `phase ${event.phase}`);
    }
  }

  private parseEventTimestamp(event: AuditEvent, context: string): number {
    const timestampMs = Date.parse(event.timestamp);
    if (
      !ISO_TIMESTAMP_PATTERN.test(event.timestamp) ||
      !Number.isFinite(timestampMs) ||
      new Date(timestampMs).toISOString() !== event.timestamp
    ) {
      throw new Error(
        `Invalid audit event timestamp during replay (${context}): eventId=${event.eventId}, phase=${event.phase}, type=${event.type}, timestamp=${JSON.stringify(event.timestamp)}`,
      );
    }
    return timestampMs;
  }

  private extractProviderSwitches(
    events: readonly AuditEvent[],
  ): ProviderSwitchEvent[] {
    return events
      .filter((e) => e.type === 'provider.switch')
      .map((e) => {
        const payload = e.payload as Record<string, string>;
        return {
          timestamp: e.timestamp,
          from: payload['from'] ?? '',
          to: payload['to'] ?? '',
          reason: payload['reason'] ?? '',
          phase: e.phase,
        };
      });
  }

  private extractErrors(events: readonly AuditEvent[]): ErrorEvent[] {
    return events
      .filter((e) => e.type === 'error')
      .map((e) => {
        const payload = e.payload as Record<string, unknown>;
        return {
          timestamp: e.timestamp,
          phase: e.phase,
          provider: e.provider,
          error: (payload['message'] as string) ?? 'Unknown error',
          recovered: (payload['recovered'] as boolean) ?? false,
        };
      });
  }

  private extractRunId(events: readonly AuditEvent[]): string {
    const runStart = events.find((e) => e.type === 'run.start');
    if (runStart) {
      return (runStart.payload as Record<string, string>)['runId'] ?? runStart.eventId;
    }
    return events[0]!.eventId;
  }

  private generateSummary(
    phases: PhaseTimeline[],
    switches: ProviderSwitchEvent[],
    errors: ErrorEvent[],
  ): string {
    const phaseNames = phases.map((p) => p.phase).join(' → ');
    const parts = [`Phases: ${phaseNames}`];
    if (switches.length > 0) {
      parts.push(`Provider switches: ${switches.length}`);
    }
    if (errors.length > 0) {
      const recovered = errors.filter((e) => e.recovered).length;
      parts.push(`Errors: ${errors.length} (${recovered} recovered)`);
    }
    return parts.join('. ');
  }
}
