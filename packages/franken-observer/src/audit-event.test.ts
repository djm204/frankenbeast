import { describe, it, expect } from 'vitest';
import { createAuditEvent, AuditTrail, hashContent, type AuditEvent } from './audit-event.js';

function ignoreMutation(mutate: () => void): void {
  try {
    mutate();
  } catch {
    // Frozen runtime values may throw in strict mode; the invariant under test is
    // that mutation attempts never alter the trail's stored history.
  }
}

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

  it('uses the shared content hash formatter', () => {
    expect(hashContent('hello')).toBe(
      'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
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

  it('hashes empty string input (not treated as missing)', () => {
    const event = createAuditEvent('test', {}, { phase: 'p', provider: 'pr', input: '' });
    expect(event.inputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('hashes empty string output (not treated as missing)', () => {
    const event = createAuditEvent('test', {}, { phase: 'p', provider: 'pr', output: '' });
    expect(event.outputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
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

  it('toJSON normalizes undefined payloads before persistence', () => {
    const trail = new AuditTrail();
    trail.append(createAuditEvent('empty.payload', undefined, { phase: 'p', provider: 'pr' }));

    expect(trail.toJSON()[0]!.payload).toBeNull();
    expect(AuditTrail.fromJSON(trail.toJSON()).getAll()[0]!.payload).toBeNull();
  });

  it('does not retain mutable aliases to appended events', () => {
    const trail = new AuditTrail();
    const event = createAuditEvent('append.alias', { nested: { count: 1 } }, { phase: 'p', provider: 'pr' });
    trail.append(event);

    event.type = 'tampered';
    (event.payload as { nested: { count: number } }).nested.count = 99;

    expect(trail.getAll()[0]).toMatchObject({
      type: 'append.alias',
      payload: { nested: { count: 1 } },
    });
  });

  it('returns defensive copies from getAll()', () => {
    const trail = new AuditTrail();
    const event = createAuditEvent('get.alias', { nested: { count: 1 } }, { phase: 'p', provider: 'pr' });
    trail.append(event);

    const returned = trail.getAll() as AuditEvent[];
    ignoreMutation(() => returned.push(createAuditEvent('extra', {}, { phase: 'p', provider: 'pr' })));
    ignoreMutation(() => {
      returned[0]!.type = 'tampered';
    });
    ignoreMutation(() => {
      (returned[0]!.payload as { nested: { count: number } }).nested.count = 99;
    });

    expect(trail.getAll()).toHaveLength(1);
    expect(trail.getAll()[0]).toMatchObject({
      type: 'get.alias',
      payload: { nested: { count: 1 } },
    });
  });

  it('returns defensive copies from toJSON()', () => {
    const trail = new AuditTrail();
    trail.append(createAuditEvent('json.alias', { nested: { count: 1 } }, { phase: 'p', provider: 'pr' }));

    const json = trail.toJSON();
    ignoreMutation(() => json.push(createAuditEvent('extra', {}, { phase: 'p', provider: 'pr' })));
    ignoreMutation(() => {
      json[0]!.type = 'tampered';
    });
    ignoreMutation(() => {
      (json[0]!.payload as { nested: { count: number } }).nested.count = 99;
    });

    expect(trail.getAll()).toHaveLength(1);
    expect(trail.getAll()[0]).toMatchObject({
      type: 'json.alias',
      payload: { nested: { count: 1 } },
    });
  });

  it('fromJSON does not retain aliases to caller-owned JSON data', () => {
    const json = [createAuditEvent('restore.alias', { nested: { count: 1 } }, { phase: 'p', provider: 'pr' })];
    const trail = AuditTrail.fromJSON(json);

    json[0]!.type = 'tampered';
    (json[0]!.payload as { nested: { count: number } }).nested.count = 99;
    json.push(createAuditEvent('extra', {}, { phase: 'p', provider: 'pr' }));

    expect(trail.getAll()).toHaveLength(1);
    expect(trail.getAll()[0]).toMatchObject({
      type: 'restore.alias',
      payload: { nested: { count: 1 } },
    });
  });

  it('fromJSON rejects non-array input', () => {
    expect(() => AuditTrail.fromJSON({})).toThrow(/events must be an array/i);
  });

  it('fromJSON rejects events missing required fields', () => {
    expect(() => AuditTrail.fromJSON([{}])).toThrow(/events\[0\]: eventId must be a non-empty string/i);
  });

  it('fromJSON rejects malformed optional hashes', () => {
    const event = { ...createAuditEvent('a', {}, { phase: 'p', provider: 'pr' }), inputHash: '' };
    expect(() => AuditTrail.fromJSON([event])).toThrow(/events\[0\]: inputHash must be a sha256 hash/i);
  });

  it('fromJSON rejects malformed timestamps', () => {
    const event = { ...createAuditEvent('a', {}, { phase: 'p', provider: 'pr' }), timestamp: 'not-a-date' };
    expect(() => AuditTrail.fromJSON([event])).toThrow(/events\[0\]: timestamp must be an ISO timestamp/i);
  });

  it('fromJSON rejects impossible timestamp dates', () => {
    const event = { ...createAuditEvent('a', {}, { phase: 'p', provider: 'pr' }), timestamp: '2026-02-31T00:00:00.000Z' };
    expect(() => AuditTrail.fromJSON([event])).toThrow(/events\[0\]: timestamp must be an ISO timestamp/i);
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

  it('verify() fails when hashed input content is missing', () => {
    const trail = new AuditTrail();
    const event = createAuditEvent('test', {}, { phase: 'p', provider: 'pr', input: 'hello' });
    trail.append(event);

    expect(trail.verify(new Map())).toEqual({
      valid: false,
      mismatches: [`${event.eventId}: input content missing`],
    });
  });

  it('verify() fails when hashed output content is missing', () => {
    const trail = new AuditTrail();
    const event = createAuditEvent('test', {}, { phase: 'p', provider: 'pr', output: 'result' });
    trail.append(event);

    expect(trail.verify(new Map())).toEqual({
      valid: false,
      mismatches: [`${event.eventId}: output content missing`],
    });
  });

  it('verify() reports only the missing side when one hashed content entry is absent', () => {
    const trail = new AuditTrail();
    const event = createAuditEvent('test', {}, {
      phase: 'p',
      provider: 'pr',
      input: 'hello',
      output: 'result',
    });
    trail.append(event);

    const contentMap = new Map<string, string>();
    contentMap.set(`${event.eventId}:input`, 'hello');

    expect(trail.verify(contentMap)).toEqual({
      valid: false,
      mismatches: [`${event.eventId}: output content missing`],
    });
  });

  it('verify() checks empty string content against hash', () => {
    const trail = new AuditTrail();
    const event = createAuditEvent('test', {}, { phase: 'p', provider: 'pr', input: '' });
    trail.append(event);

    // Correct empty string passes
    const correctMap = new Map<string, string>();
    correctMap.set(`${event.eventId}:input`, '');
    expect(trail.verify(correctMap).valid).toBe(true);

    // Non-empty content fails against empty-string hash
    const wrongMap = new Map<string, string>();
    wrongMap.set(`${event.eventId}:input`, 'not-empty');
    expect(trail.verify(wrongMap).valid).toBe(false);
  });
});
