import { hashContent } from './utils/crypto.js';
import { deterministicUuid, wallClockNow } from '@franken/types';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const AUDIT_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function requireStringField(record: Record<string, unknown>, field: keyof AuditEvent, context: string): string {
  if (typeof record[field] !== 'string' || record[field].length === 0) {
    throw new Error(`Invalid audit event at ${context}: ${String(field)} must be a non-empty string`);
  }
  return record[field];
}

function requireOptionalStringField(
  record: Record<string, unknown>,
  field: keyof AuditEvent,
  context: string,
): void {
  if (record[field] !== undefined && typeof record[field] !== 'string') {
    throw new Error(`Invalid audit event at ${context}: ${String(field)} must be a string when present`);
  }
}

function requireOptionalHashField(record: Record<string, unknown>, field: keyof AuditEvent, context: string): void {
  if (record[field] === undefined) {
    return;
  }
  if (typeof record[field] !== 'string' || !AUDIT_HASH_PATTERN.test(record[field])) {
    throw new Error(`Invalid audit event at ${context}: ${String(field)} must be a sha256 hash when present`);
  }
}

function requireIsoTimestamp(record: Record<string, unknown>, context: string): void {
  const timestamp = requireStringField(record, 'timestamp', context);
  const parsed = Date.parse(timestamp);
  if (!ISO_TIMESTAMP_PATTERN.test(timestamp) || Number.isNaN(parsed) || new Date(parsed).toISOString() !== timestamp) {
    throw new Error(`Invalid audit event at ${context}: timestamp must be an ISO timestamp`);
  }
}

export function assertAuditEvent(value: unknown, context = 'event'): asserts value is AuditEvent {
  if (!isRecord(value)) {
    throw new Error(`Invalid audit event at ${context}: expected object`);
  }

  requireStringField(value, 'eventId', context);
  requireIsoTimestamp(value, context);
  requireStringField(value, 'phase', context);
  requireStringField(value, 'provider', context);
  requireStringField(value, 'type', context);

  if (!Object.prototype.hasOwnProperty.call(value, 'payload')) {
    throw new Error(`Invalid audit event at ${context}: payload is required`);
  }

  requireOptionalHashField(value, 'inputHash', context);
  requireOptionalHashField(value, 'outputHash', context);
  requireOptionalStringField(value, 'parentEventId', context);
}

export function assertAuditEventArray(value: unknown, context = 'events'): asserts value is AuditEvent[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid audit trail: ${context} must be an array`);
  }
  value.forEach((event, index) => assertAuditEvent(event, `${context}[${index}]`));
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
    eventId: deterministicUuid('packages/franken-observer/src/audit-event.ts'),
    timestamp: new Date(wallClockNow()).toISOString(),
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

export { hashContent };

function cloneArrayBufferView<T extends ArrayBufferView>(value: T): T {
  if (value instanceof DataView) {
    const copy = new Uint8Array(value.byteLength);
    copy.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    return new DataView(copy.buffer) as unknown as T;
  }

  if (Buffer.isBuffer(value)) {
    return Buffer.from(value) as unknown as T;
  }

  const TypedArray = value.constructor as new (source: ArrayLike<number>) => T;
  return new TypedArray(value as unknown as ArrayLike<number>);
}

function cloneArrayBuffer<T extends ArrayBuffer | SharedArrayBuffer>(value: T): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(new Uint8Array(value));
  return copy.buffer;
}

function cloneValue<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return value;
  }

  const existing = seen.get(value);
  if (existing !== undefined) {
    return existing as T;
  }

  if (typeof value === 'function') {
    seen.set(value, value);
    freezeValue(value);
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return Buffer.from(value) as T;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    for (const item of value) {
      clone.push(cloneValue(item, seen));
    }
    return clone as T;
  }

  if (value instanceof Map) {
    const clone = new Map<unknown, unknown>();
    seen.set(value, clone);
    for (const [key, item] of value) {
      clone.set(cloneValue(key, seen), cloneValue(item, seen));
    }
    return clone as T;
  }

  if (value instanceof Set) {
    const clone = new Set<unknown>();
    seen.set(value, clone);
    for (const item of value) {
      clone.add(cloneValue(item, seen));
    }
    return clone as T;
  }

  if (ArrayBuffer.isView(value)) {
    return cloneArrayBufferView(value) as T;
  }

  if (value instanceof ArrayBuffer || value instanceof SharedArrayBuffer) {
    return cloneArrayBuffer(value) as T;
  }

  const toJSON = (value as { toJSON?: unknown }).toJSON;
  if (typeof toJSON === 'function') {
    return cloneValue(toJSON.call(value), seen) as T;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype === Object.prototype || prototype === null) {
    const clone: Record<string, unknown> = {};
    seen.set(value, clone);
    for (const [key, item] of Object.entries(value)) {
      clone[key] = cloneValue(item, seen);
    }
    return clone as T;
  }

  try {
    return structuredClone(value);
  } catch {
    const clone: Record<string, unknown> = {};
    seen.set(value, clone);
    for (const [key, item] of Object.entries(value)) {
      clone[key] = cloneValue(item, seen);
    }
    return clone as T;
  }
}

function freezeValue<T>(value: T, seen = new WeakSet<object>()): T {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null || seen.has(value)) {
    return value;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      freezeValue(item, seen);
    }
  } else if (value instanceof Map) {
    for (const [key, item] of value) {
      freezeValue(key, seen);
      freezeValue(item, seen);
    }
  } else if (value instanceof Set) {
    for (const item of value) {
      freezeValue(item, seen);
    }
  } else {
    for (const item of Object.values(value)) {
      freezeValue(item, seen);
    }
  }

  if (!ArrayBuffer.isView(value)) {
    Object.freeze(value);
  }
  return value;
}

function immutableAuditEvent(event: AuditEvent): AuditEvent {
  return freezeValue(cloneValue(event));
}

function auditEventForJson(event: AuditEvent): AuditEvent {
  return freezeValue({
    ...cloneValue(event),
    payload: event.payload === undefined ? null : cloneValue(event.payload),
  });
}

/**
 * Append-only, immutable audit trail.
 * Records every execution decision for compliance auditing.
 */
export class AuditTrail {
  private events: AuditEvent[] = [];

  append(event: AuditEvent): void {
    this.events.push(immutableAuditEvent(event));
  }

  getAll(): readonly AuditEvent[] {
    return this.events.map((event) => immutableAuditEvent(event));
  }

  getByType(type: string): AuditEvent[] {
    return this.events.filter((e) => e.type === type).map((event) => immutableAuditEvent(event));
  }

  getByPhase(phase: string): AuditEvent[] {
    return this.events.filter((e) => e.phase === phase).map((event) => immutableAuditEvent(event));
  }

  getChildren(parentEventId: string): AuditEvent[] {
    return this.events.filter((e) => e.parentEventId === parentEventId).map((event) => immutableAuditEvent(event));
  }

  toJSON(): AuditEvent[] {
    return this.events.map((event) => auditEventForJson(event));
  }

  static fromJSON(events: unknown): AuditTrail {
    assertAuditEventArray(events);
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
        if (content === undefined) {
          mismatches.push(`${event.eventId}: input content missing`);
        } else if (hashContent(content) !== event.inputHash) {
          mismatches.push(`${event.eventId}: input hash mismatch`);
        }
      }
      if (event.outputHash) {
        const content = contentMap.get(`${event.eventId}:output`);
        if (content === undefined) {
          mismatches.push(`${event.eventId}: output content missing`);
        } else if (hashContent(content) !== event.outputHash) {
          mismatches.push(`${event.eventId}: output hash mismatch`);
        }
      }
    }
    return { valid: mismatches.length === 0, mismatches };
  }
}
