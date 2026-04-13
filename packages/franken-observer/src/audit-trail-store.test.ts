import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
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

  it('exists() returns true for saved trails', () => {
    store.save('run-1', sampleTrail());
    expect(store.exists('run-1')).toBe(true);
    expect(store.exists('nonexistent')).toBe(false);
  });

  it('throws when loading nonexistent trail', () => {
    expect(() => store.load('missing')).toThrow('Audit trail not found');
  });

  it('replayer can load and replay a persisted artifact', () => {
    store.save('run-1', sampleTrail());
    const loaded = store.load('run-1');
    const timeline = new ExecutionReplayer().replay(loaded);
    expect(timeline.phases).toHaveLength(1);
    expect(timeline.phases[0]!.phase).toBe('planning');
  });
});
