import type { AuditEvent } from './audit-event.js';
import { AuditTrail } from './audit-event.js';

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

    const phases = this.groupByPhase(events);
    const switches = this.extractProviderSwitches(events);
    const errors = this.extractErrors(events);

    const startTime = events[0]!.timestamp;
    const endTime = events[events.length - 1]!.timestamp;

    return {
      runId: this.extractRunId(events),
      startTime,
      endTime,
      totalDurationMs:
        new Date(endTime).getTime() - new Date(startTime).getTime(),
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

    return [...phaseMap.entries()].map(([phase, phaseEvents]) => ({
      phase,
      startTime: phaseEvents[0]!.timestamp,
      endTime: phaseEvents[phaseEvents.length - 1]!.timestamp,
      durationMs:
        new Date(phaseEvents[phaseEvents.length - 1]!.timestamp).getTime() -
        new Date(phaseEvents[0]!.timestamp).getTime(),
      provider: phaseEvents[phaseEvents.length - 1]!.provider,
      eventCount: phaseEvents.length,
      events: phaseEvents,
    }));
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
