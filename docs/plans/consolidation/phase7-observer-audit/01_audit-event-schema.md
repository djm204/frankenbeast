# Chunk 7.1: Audit Event Schema

**Phase:** 7 — Observer Audit Trail
**Depends on:** Phase 3 (provider types)
**Estimated size:** Small (~100 lines types + implementation)

---

## Purpose

Extend the observer's event model with audit-specific fields: unique IDs, hashes, provider tracking, and parent-child relationships.

## Implementation

```typescript
// packages/franken-observer/src/audit-event.ts

import { createHash } from 'node:crypto';

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

export function createAuditEvent(
  type: string,
  payload: unknown,
  options: {
    phase: string;
    provider: string;
    input?: string | Buffer;
    output?: string | Buffer;
    parentEventId?: string;
  },
): AuditEvent {
  return {
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    phase: options.phase,
    provider: options.provider,
    type,
    inputHash: options.input ? hashContent(options.input) : undefined,
    outputHash: options.output ? hashContent(options.output) : undefined,
    payload,
    parentEventId: options.parentEventId,
  };
}

function hashContent(content: string | Buffer): string {
  return 'sha256:' + createHash('sha256').update(content).digest('hex');
}

// Audit trail is an append-only list
export class AuditTrail {
  private events: AuditEvent[] = [];

  append(event: AuditEvent): void {
    this.events.push(event);
  }

  getAll(): readonly AuditEvent[] {
    return this.events;
  }

  getByType(type: string): AuditEvent[] {
    return this.events.filter(e => e.type === type);
  }

  getByPhase(phase: string): AuditEvent[] {
    return this.events.filter(e => e.phase === phase);
  }

  getChildren(parentEventId: string): AuditEvent[] {
    return this.events.filter(e => e.parentEventId === parentEventId);
  }

  /** Export as JSON for storage */
  toJSON(): AuditEvent[] {
    return [...this.events];
  }

  /** Import from stored JSON */
  static fromJSON(events: AuditEvent[]): AuditTrail {
    const trail = new AuditTrail();
    for (const event of events) {
      trail.append(event);
    }
    return trail;
  }

  /** Verify integrity — each hash matches its content if content is provided */
  verify(contentMap: Map<string, string | Buffer>): { valid: boolean; mismatches: string[] } {
    const mismatches: string[] = [];
    for (const event of this.events) {
      if (event.inputHash) {
        const content = contentMap.get(`${event.eventId}:input`);
        if (content && hashContent(content) !== event.inputHash) {
          mismatches.push(`${event.eventId}: input hash mismatch`);
        }
      }
      if (event.outputHash) {
        const content = contentMap.get(`${event.eventId}:output`);
        if (content && hashContent(content) !== event.outputHash) {
          mismatches.push(`${event.eventId}: output hash mismatch`);
        }
      }
    }
    return { valid: mismatches.length === 0, mismatches };
  }
}
```

## Tests

```typescript
describe('AuditTrail', () => {
  describe('createAuditEvent()', () => {
    it('generates unique eventId', () => { ... });
    it('computes SHA-256 hash for input', () => { ... });
    it('computes SHA-256 hash for output', () => { ... });
    it('omits hashes when content not provided', () => { ... });
    it('sets parentEventId for nested events', () => { ... });
  });

  describe('AuditTrail', () => {
    it('appends events in order', () => { ... });
    it('getByType filters correctly', () => { ... });
    it('getByPhase filters correctly', () => { ... });
    it('getChildren returns child events', () => { ... });
    it('toJSON/fromJSON round-trips', () => { ... });
    it('verify() passes with correct hashes', () => { ... });
    it('verify() detects tampered content', () => { ... });
  });
});
```

## Files

- **Add:** `packages/franken-observer/src/audit-event.ts`
- **Add:** `packages/franken-observer/tests/unit/audit-event.test.ts`

## Exit Criteria

- `AuditEvent` type with all required fields
- `createAuditEvent()` generates unique IDs and computes content hashes
- `AuditTrail` supports append, filter, serialize/deserialize, and integrity verification
