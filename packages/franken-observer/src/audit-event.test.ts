import { describe, it, expect } from 'vitest';
import { createAuditEvent, AuditTrail, hashContent } from './audit-event.js';

describe('createAuditEvent', () => {
  it('generates unique eventId', () => {
    const e1 = createAuditEvent('test', {}, { phase: 'p', provider: 'pr' });
    const e2 = createAuditEvent('test', {}, { phase: 'p', provider: 'pr' });
    expect(e1.eventId).not.toBe(e2.eventId);
  });

  it('computes SHA-256 hash for input', () => {
    const event = createAuditEvent('test', {}, {
      phase: 'p', provider: 'pr', input: 'hello',
    });
    expect(event.inputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('computes SHA-256 hash for output', () => {
    const event = createAuditEvent('test', {}, {
      phase: 'p', provider: 'pr', output: 'result',
    });
    expect(event.outputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('omits hashes when content not provided', () => {
    const event = createAuditEvent('test', {}, { phase: 'p', provider: 'pr' });
    expect(event.inputHash).toBeUndefined();
    expect(event.outputHash).toBeUndefined();
  });

  it('sets parentEventId for nested events', () => {
    const event = createAuditEvent('test', {}, {
      phase: 'p', provider: 'pr', parentEventId: 'parent-1',
    });
    expect(event.parentEventId).toBe('parent-1');
  });
});

describe('AuditTrail', () => {
  it('appends events in order', () => {
    const trail = new AuditTrail();
    const e1 = createAuditEvent('a', {}, { phase: 'p', provider: 'pr' });
    const e2 = createAuditEvent('b', {}, { phase: 'p', provider: 'pr' });
    trail.append(e1);
    trail.append(e2);
    expect(trail.getAll()).toEqual([e1, e2]);
  });

  it('getByType filters correctly', () => {
    const trail = new AuditTrail();
    trail.append(createAuditEvent('llm.request', {}, { phase: 'p', provider: 'pr' }));
    trail.append(createAuditEvent('llm.response', {}, { phase: 'p', provider: 'pr' }));
    trail.append(createAuditEvent('llm.request', {}, { phase: 'p', provider: 'pr' }));
    expect(trail.getByType('llm.request')).toHaveLength(2);
  });

  it('getByPhase filters correctly', () => {
    const trail = new AuditTrail();
    trail.append(createAuditEvent('a', {}, { phase: 'planning', provider: 'pr' }));
    trail.append(createAuditEvent('b', {}, { phase: 'execution', provider: 'pr' }));
    expect(trail.getByPhase('planning')).toHaveLength(1);
  });

  it('getChildren returns child events', () => {
    const trail = new AuditTrail();
    const parent = createAuditEvent('parent', {}, { phase: 'p', provider: 'pr' });
    const child = createAuditEvent('child', {}, { phase: 'p', provider: 'pr', parentEventId: parent.eventId });
    trail.append(parent);
    trail.append(child);
    expect(trail.getChildren(parent.eventId)).toEqual([child]);
  });

  it('toJSON/fromJSON round-trips', () => {
    const trail = new AuditTrail();
    trail.append(createAuditEvent('a', { x: 1 }, { phase: 'p', provider: 'pr', input: 'in' }));
    trail.append(createAuditEvent('b', { y: 2 }, { phase: 'p', provider: 'pr', output: 'out' }));

    const json = trail.toJSON();
    const restored = AuditTrail.fromJSON(json);
    expect(restored.getAll()).toEqual(json);
  });

  it('verify() passes with correct hashes', () => {
    const trail = new AuditTrail();
    const event = createAuditEvent('test', {}, { phase: 'p', provider: 'pr', input: 'hello' });
    trail.append(event);

    const contentMap = new Map<string, string>();
    contentMap.set(`${event.eventId}:input`, 'hello');
    expect(trail.verify(contentMap)).toEqual({ valid: true, mismatches: [] });
  });

  it('verify() detects tampered content', () => {
    const trail = new AuditTrail();
    const event = createAuditEvent('test', {}, { phase: 'p', provider: 'pr', input: 'hello' });
    trail.append(event);

    const contentMap = new Map<string, string>();
    contentMap.set(`${event.eventId}:input`, 'tampered');
    const result = trail.verify(contentMap);
    expect(result.valid).toBe(false);
    expect(result.mismatches).toHaveLength(1);
  });
});
