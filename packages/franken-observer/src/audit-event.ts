import { createHash, randomUUID } from 'node:crypto';

export interface AuditEvent {
  eventId: string;
  timestamp: string;
  phase: string;
  provider: string;
  type: string;
  inputHash?: string;
  outputHash?: string;
  payload: unknown;
  parentEventId?: string;
}

export interface CreateAuditEventOptions {
  phase: string;
  provider: string;
  input?: string | Buffer;
  output?: string | Buffer;
  parentEventId?: string;
}

export function createAuditEvent(
  type: string,
  payload: unknown,
  options: CreateAuditEventOptions,
): AuditEvent {
  const event: AuditEvent = {
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    phase: options.phase,
    provider: options.provider,
    type,
    payload,
  };
  if (options.input !== undefined) {
    event.inputHash = hashContent(options.input);
  }
  if (options.output !== undefined) {
    event.outputHash = hashContent(options.output);
  }
  if (options.parentEventId) {
    event.parentEventId = options.parentEventId;
  }
  return event;
}

export function hashContent(content: string | Buffer): string {
  return 'sha256:' + createHash('sha256').update(content).digest('hex');
}

/**
 * Append-only, immutable audit trail.
 * Records every execution decision for compliance auditing.
 */
export class AuditTrail {
  private events: AuditEvent[] = [];

  append(event: AuditEvent): void {
    this.events.push(event);
  }

  getAll(): readonly AuditEvent[] {
    return this.events;
  }

  getByType(type: string): AuditEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  getByPhase(phase: string): AuditEvent[] {
    return this.events.filter((e) => e.phase === phase);
  }

  getChildren(parentEventId: string): AuditEvent[] {
    return this.events.filter((e) => e.parentEventId === parentEventId);
  }

  toJSON(): AuditEvent[] {
    return [...this.events];
  }

  static fromJSON(events: AuditEvent[]): AuditTrail {
    const trail = new AuditTrail();
    for (const event of events) {
      trail.append(event);
    }
    return trail;
  }

  verify(
    contentMap: Map<string, string | Buffer>,
  ): { valid: boolean; mismatches: string[] } {
    const mismatches: string[] = [];
    for (const event of this.events) {
      if (event.inputHash) {
        const content = contentMap.get(`${event.eventId}:input`);
        if (content !== undefined && hashContent(content) !== event.inputHash) {
          mismatches.push(`${event.eventId}: input hash mismatch`);
        }
      }
      if (event.outputHash) {
        const content = contentMap.get(`${event.eventId}:output`);
        if (content !== undefined && hashContent(content) !== event.outputHash) {
          mismatches.push(`${event.eventId}: output hash mismatch`);
        }
      }
    }
    return { valid: mismatches.length === 0, mismatches };
  }
}
