import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AuditTrail, createAuditEvent } from './audit-event.js';
import { AuditTrailStore } from './audit-trail-store.js';
import { ExecutionReplayer } from './execution-replayer.js';

describe('AuditTrailStore', () => {
  let tempDir: string;
  let store: AuditTrailStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'audit-test-'));
    store = new AuditTrailStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function sampleTrail(): AuditTrail {
    const trail = new AuditTrail();
    trail.append(createAuditEvent('phase.start', {}, { phase: 'planning', provider: 'claude-cli' }));
    trail.append(createAuditEvent('llm.request', { prompt: 'test' }, { phase: 'planning', provider: 'claude-cli', input: 'test' }));
    trail.append(createAuditEvent('llm.response', { content: 'result' }, { phase: 'planning', provider: 'claude-cli', output: 'result' }));
    trail.append(createAuditEvent('phase.end', {}, { phase: 'planning', provider: 'claude-cli' }));
    return trail;
  }

  it('writes .fbeast/audit/<runId>.json', () => {
    const trail = sampleTrail();
    const path = store.save('run-123', trail);
    expect(path).toContain('run-123.json');
    expect(existsSync(path)).toBe(true);
  });

  it('creates the audit directory when missing', () => {
    const auditDir = join(tempDir, '.fbeast', 'audit');
    expect(existsSync(auditDir)).toBe(false);
    store.save('run-1', sampleTrail());
    expect(existsSync(auditDir)).toBe(true);
  });

  it('loads a persisted trail back into AuditTrail', () => {
    const trail = sampleTrail();
    store.save('run-1', trail);
    const loaded = store.load('run-1');
    expect(loaded.getAll()).toHaveLength(4);
    expect(loaded.getAll()[0]!.type).toBe('phase.start');
  });

  it('round-trips persisted events without loss', () => {
    const trail = sampleTrail();
    store.save('run-1', trail);
    const loaded = store.load('run-1');

    const original = trail.toJSON();
    const restored = loaded.toJSON();
    expect(restored).toEqual(original);
  });

  it('persisted artifact has correct schema', () => {
    store.save('run-1', sampleTrail());
    const raw = JSON.parse(readFileSync(join(tempDir, '.fbeast', 'audit', 'run-1.json'), 'utf-8'));
    expect(raw.version).toBe(1);
    expect(raw.runId).toBe('run-1');
    expect(raw.createdAt).toBeTruthy();
    expect(raw.events).toHaveLength(4);
  });

  it('rejects persisted artifacts with an unsupported version', () => {
    const filePath = store.save('run-1', sampleTrail());
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    raw.version = 2;
    writeFileSync(filePath, JSON.stringify(raw));

    expect(() => store.load('run-1')).toThrow(/invalid persisted audit trail: version must be 1/i);
  });

  it('rejects persisted artifacts with missing events', () => {
    const filePath = store.save('run-1', sampleTrail());
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    delete raw.events;
    writeFileSync(filePath, JSON.stringify(raw));

    expect(() => store.load('run-1')).toThrow(/events must be an array/i);
  });

  it('rejects persisted artifacts with non-array events', () => {
    const filePath = store.save('run-1', sampleTrail());
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    raw.events = {};
    writeFileSync(filePath, JSON.stringify(raw));

    expect(() => store.load('run-1')).toThrow(/events must be an array/i);
  });

  it('rejects persisted events missing required identity and type fields', () => {
    const filePath = store.save('run-1', sampleTrail());
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    raw.events = [{ phase: 'planning', provider: 'claude-cli', type: 'phase.start', payload: {} }];
    writeFileSync(filePath, JSON.stringify(raw));

    expect(() => store.load('run-1')).toThrow(/events\[0\]: eventId must be a non-empty string/i);
  });

  it('rejects persisted events missing payload', () => {
    const filePath = store.save('run-1', sampleTrail());
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    raw.events = [
      {
        eventId: 'event-1',
        timestamp: '2026-01-01T00:00:00.000Z',
        phase: 'planning',
        provider: 'claude-cli',
        type: 'phase.start',
      },
    ];
    writeFileSync(filePath, JSON.stringify(raw));

    expect(() => store.load('run-1')).toThrow(/events\[0\]: payload is required/i);
  });

  it('round-trips events whose original payload was undefined', () => {
    const trail = new AuditTrail();
    trail.append(createAuditEvent('payload.undefined', undefined, { phase: 'planning', provider: 'claude-cli' }));

    store.save('run-1', trail);

    expect(store.load('run-1').getAll()[0]!.payload).toBeNull();
  });

  it('rejects persisted events with malformed hashes', () => {
    const filePath = store.save('run-1', sampleTrail());
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    raw.events[0].inputHash = '';
    writeFileSync(filePath, JSON.stringify(raw));

    expect(() => store.load('run-1')).toThrow(/events\[0\]: inputHash must be a sha256 hash/i);
  });

  it('rejects persisted events with malformed timestamps', () => {
    const filePath = store.save('run-1', sampleTrail());
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    raw.events[0].timestamp = 'not-a-date';
    writeFileSync(filePath, JSON.stringify(raw));

    expect(() => store.load('run-1')).toThrow(/events\[0\]: timestamp must be an ISO timestamp/i);
  });

  it('writes a replay manifest next to the audit trail when provided', () => {
    store.save('run-1', sampleTrail(), [
      { version: 1, kind: 'llm.response', runId: 'run-1', timestamp: 't', contentRef: 'abc123' },
    ]);

    const raw = JSON.parse(readFileSync(join(tempDir, '.fbeast', 'audit', 'run-1.replay.json'), 'utf-8'));
    expect(raw).toEqual([
      { version: 1, kind: 'llm.response', runId: 'run-1', timestamp: 't', contentRef: 'abc123' },
    ]);
  });

  it('exists() returns true for saved trails', () => {
    store.save('run-1', sampleTrail());
    expect(store.exists('run-1')).toBe(true);
    expect(store.exists('nonexistent')).toBe(false);
  });

  it('throws when loading nonexistent trail', () => {
    expect(() => store.load('missing')).toThrow('Audit trail not found');
  });

  it('rejects run IDs containing path traversal segments on save', () => {
    expect(() => store.save('../../etc/passwd', sampleTrail())).toThrow(/invalid run id/i);
    // Confirm nothing escaped the audit directory. A naive
    // join(auditDir, '../../etc/passwd.json') would normalize to
    // <tempDir>/etc/passwd.json, so assert against that hermetic target
    // rather than a path that escapes tempDir into the real filesystem.
    expect(existsSync(join(tempDir, 'etc', 'passwd.json'))).toBe(false);
  });

  it('rejects run IDs containing slashes or path separators', () => {
    expect(() => store.save('foo/bar', sampleTrail())).toThrow(/invalid run id/i);
    expect(() => store.save('foo\\bar', sampleTrail())).toThrow(/invalid run id/i);
  });

  it('rejects empty and dot run IDs', () => {
    expect(() => store.save('', sampleTrail())).toThrow(/invalid run id/i);
    expect(() => store.save('.', sampleTrail())).toThrow(/invalid run id/i);
    expect(() => store.save('..', sampleTrail())).toThrow(/invalid run id/i);
  });

  it('rejects invalid run IDs on load and exists without filesystem access', () => {
    expect(() => store.load('../secret')).toThrow(/invalid run id/i);
    expect(() => store.exists('../secret')).toThrow(/invalid run id/i);
  });

  it('rejects run IDs that are absolute paths', () => {
    expect(() => store.save('/etc/passwd', sampleTrail())).toThrow(/invalid run id/i);
    expect(() => store.load('/etc/passwd')).toThrow(/invalid run id/i);
    expect(() => store.exists('/etc/passwd')).toThrow(/invalid run id/i);
    expect(() => store.save('C:\\Windows\\System32\\evil', sampleTrail())).toThrow(/invalid run id/i);
  });

  it('rejects run IDs with nested path separators', () => {
    expect(() => store.save('a/b/../../c', sampleTrail())).toThrow(/invalid run id/i);
    expect(() => store.save('foo/bar/baz', sampleTrail())).toThrow(/invalid run id/i);
  });

  it('rejects a bare parent-traversal run ID', () => {
    expect(() => store.save('../x', sampleTrail())).toThrow(/invalid run id/i);
  });

  it('accepts valid run IDs composed of safe characters', () => {
    const path = store.save('run-abc123', sampleTrail());
    expect(path).toContain('run-abc123.json');
    expect(store.exists('run-abc123')).toBe(true);
    expect(store.load('run-abc123').getAll()).toHaveLength(4);
  });

  it('never resolves a persisted file path outside of the audit directory', () => {
    const auditDir = join(tempDir, '.fbeast', 'audit');
    const path = store.save('run-1', sampleTrail());
    expect(path.startsWith(auditDir)).toBe(true);
  });

  it('replayer can load and replay a persisted artifact', () => {
    store.save('run-1', sampleTrail());
    const loaded = store.load('run-1');
    const timeline = new ExecutionReplayer().replay(loaded);
    expect(timeline.phases).toHaveLength(1);
    expect(timeline.phases[0]!.phase).toBe('planning');
  });
});
