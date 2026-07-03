import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { createAuditEvent, hashContent } from '@frankenbeast/observer';
import { createObserverAdapter } from './observer-adapter.js';

function tmpDbPath(): string {
  const dir = join(tmpdir(), `fbeast-observer-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, 'beast.db');
}

function legacy16(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`.slice(0, 16);
}

function legacy16AuditHash(metadata: string, parentHash?: string): string {
  const inputHash = `sha256:${createHash('sha256').update(metadata).digest('hex')}`;
  return parentHash ? legacy16(`${parentHash}:${inputHash}`) : inputHash.slice(0, 16);
}

function fullAuditHash(sessionId: string, eventType: string, metadata: string, parentHash?: string): string {
  const auditEvent = createAuditEvent(eventType, JSON.parse(metadata), {
    phase: 'mcp',
    provider: 'fbeast-mcp',
    input: metadata,
  });
  const baseHash = hashContent(`${sessionId}:${eventType}:${auditEvent.inputHash ?? ''}:${metadata}`);
  return parentHash ? hashContent(`${parentHash}:${baseHash}`) : baseHash;
}

describe('ObserverAdapter', () => {
  const dbPaths: string[] = [];

  function tracked(path: string): string {
    dbPaths.push(path);
    return path;
  }

  afterEach(() => {
    for (const path of dbPaths) {
      rmSync(join(path, '..'), { recursive: true, force: true });
    }
    dbPaths.length = 0;
  });

  it('chains later audit hashes through the previous entry hash', async () => {
    const secondHashFrom = async (firstMetadata: string): Promise<string> => {
      const observer = createObserverAdapter(tracked(tmpDbPath()));
      const sessionId = randomUUID();

      await observer.log({
        event: 'tool_call',
        metadata: firstMetadata,
        sessionId,
      });

      const second = await observer.log({
        event: 'tool_result',
        metadata: JSON.stringify({ tool: 'memory', ok: true }),
        sessionId,
      });

      return second.hash;
    };

    const baseline = await secondHashFrom(JSON.stringify({ tool: 'memory', step: 1 }));
    const mutatedHistory = await secondHashFrom(JSON.stringify({ tool: 'memory', step: 999 }));

    expect(mutatedHistory).not.toBe(baseline);
  });

  it('stores full hashes and verifies an intact audit chain', async () => {
    const observer = createObserverAdapter(tracked(tmpDbPath()));
    const sessionId = randomUUID();

    const first = await observer.log({ event: 'tool_call', metadata: JSON.stringify({ tool: 'memory' }), sessionId });
    const second = await observer.log({ event: 'tool_result', metadata: JSON.stringify({ tool: 'memory', ok: true }), sessionId });
    const verification = await observer.verify(sessionId);

    expect(first.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(second.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(verification).toEqual({ ok: true, checked: 2 });
  });

  it('binds the event type into the first audit hash', async () => {
    const firstHashFrom = async (event: string): Promise<string> => {
      const observer = createObserverAdapter(tracked(tmpDbPath()));
      const sessionId = randomUUID();

      const entry = await observer.log({
        event,
        metadata: JSON.stringify({ tool: 'memory', ok: true }),
        sessionId,
      });

      return entry.hash;
    };

    const callHash = await firstHashFrom('tool_call');
    const resultHash = await firstHashFrom('tool_result');

    expect(resultHash).not.toBe(callHash);
  });

  it('binds the session id into audit hashes', async () => {
    const metadata = JSON.stringify({ tool: 'memory', ok: true });
    const firstHashFrom = async (sessionId: string): Promise<string> => {
      const observer = createObserverAdapter(tracked(tmpDbPath()));
      const entry = await observer.log({ event: 'tool_call', metadata, sessionId });
      return entry.hash;
    };

    const firstSessionHash = await firstHashFrom('session-a');
    const secondSessionHash = await firstHashFrom('session-b');

    expect(secondSessionHash).not.toBe(firstSessionHash);
  });

  it('rejects audit rows moved to a different session', async () => {
    const dbPath = tracked(tmpDbPath());
    const observer = createObserverAdapter(dbPath);

    await observer.log({ event: 'tool_call', metadata: JSON.stringify({ tool: 'memory' }), sessionId: 'session-a' });
    const db = new Database(dbPath);
    db.prepare('UPDATE audit_trail SET session_id = ? WHERE session_id = ?').run('session-b', 'session-a');
    db.close();

    const verification = await observer.verify('session-b');

    expect(verification.ok).toBe(false);
    expect(verification.firstInvalid?.index).toBe(0);
  });

  it('rejects legacy full hashes that are not bound to the verified session', async () => {
    const dbPath = tracked(tmpDbPath());
    const observer = createObserverAdapter(dbPath);
    const metadata = JSON.stringify({ tool: 'memory', ok: true });
    const auditEvent = createAuditEvent('tool_call', JSON.parse(metadata), {
      phase: 'mcp',
      provider: 'fbeast-mcp',
      input: metadata,
    });
    const unboundHash = hashContent(`tool_call:${auditEvent.inputHash ?? ''}:${metadata}`);
    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO audit_trail (session_id, event_type, payload, hash, parent_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run('session-b', 'tool_call', metadata, unboundHash, null);
    db.close();

    const verification = await observer.verify('session-b');

    expect(verification.ok).toBe(false);
    expect(verification.firstInvalid?.index).toBe(0);
  });

  it('verifies and migrates legacy 16-character audit hashes', async () => {
    const dbPath = tracked(tmpDbPath());
    const observer = createObserverAdapter(dbPath);
    const sessionId = randomUUID();
    const firstMetadata = JSON.stringify({ sessionId, eventType: 'tool_call', tool: 'memory', step: 1 });
    const secondMetadata = JSON.stringify({ sessionId, eventType: 'tool_result', tool: 'memory', ok: true });
    const firstLegacyHash = legacy16AuditHash(firstMetadata);
    const secondLegacyHash = legacy16AuditHash(secondMetadata, firstLegacyHash);
    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO audit_trail (session_id, event_type, payload, hash, parent_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, 'tool_call', firstMetadata, firstLegacyHash, null);
    db.prepare(`
      INSERT INTO audit_trail (session_id, event_type, payload, hash, parent_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, 'tool_result', secondMetadata, secondLegacyHash, firstLegacyHash);
    db.close();

    const verification = await observer.verify(sessionId);
    const trail = await observer.trail(sessionId);

    expect(verification).toEqual({ ok: true, checked: 2 });
    expect(trail[0]!.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(trail[0]!.parentHash).toBeNull();
    expect(trail[1]!.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(trail[1]!.parentHash).toBe(trail[0]!.hash);
  });

  it('migrates legacy 16-character hashes logged with pretty-printed metadata', async () => {
    const dbPath = tracked(tmpDbPath());
    const observer = createObserverAdapter(dbPath);
    const sessionId = randomUUID();
    const rawMetadata = `{ "sessionId": ${JSON.stringify(sessionId)}, "eventType": "tool_call", "tool": "memory" }`;
    const storedMetadata = JSON.stringify(JSON.parse(rawMetadata));
    const legacyHash = legacy16AuditHash(rawMetadata);
    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO audit_trail (session_id, event_type, payload, hash, parent_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, 'tool_call', storedMetadata, legacyHash, null);
    db.close();

    const verification = await observer.verify(sessionId);
    const trail = await observer.trail(sessionId);

    expect(verification).toEqual({ ok: true, checked: 1 });
    expect(trail[0]!.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(trail[0]!.payload).toBe(storedMetadata);
  });

  it('rejects legacy 16-character hashes when stored payload cannot reproduce the legacy hash', async () => {
    const dbPath = tracked(tmpDbPath());
    const observer = createObserverAdapter(dbPath);
    const sessionId = randomUUID();
    const rawMetadata = `{
      "sessionId" : ${JSON.stringify(sessionId)},
      "eventType" : "tool_call",
      "tool" : "memory"
    }`;
    const storedMetadata = JSON.stringify(JSON.parse(rawMetadata));
    const legacyHash = legacy16AuditHash(rawMetadata);
    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO audit_trail (session_id, event_type, payload, hash, parent_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, 'tool_call', storedMetadata, legacyHash, null);
    db.close();

    const verification = await observer.verify(sessionId);
    const trail = await observer.trail(sessionId);

    expect(verification.ok).toBe(false);
    expect(verification.firstInvalid?.index).toBe(0);
    expect(trail[0]!.hash).toBe(legacyHash);
  });

  it('migrates full-hash children chained to legacy parents', async () => {
    const dbPath = tracked(tmpDbPath());
    const observer = createObserverAdapter(dbPath);
    const sessionId = randomUUID();
    const firstMetadata = JSON.stringify({ sessionId, eventType: 'tool_call', tool: 'memory', step: 1 });
    const secondMetadata = JSON.stringify({ tool: 'memory', ok: true });
    const firstLegacyHash = legacy16AuditHash(firstMetadata);
    const secondFullHash = fullAuditHash(sessionId, 'tool_result', secondMetadata, firstLegacyHash);
    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO audit_trail (session_id, event_type, payload, hash, parent_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, 'tool_call', firstMetadata, firstLegacyHash, null);
    db.prepare(`
      INSERT INTO audit_trail (session_id, event_type, payload, hash, parent_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, 'tool_result', secondMetadata, secondFullHash, firstLegacyHash);
    db.close();

    const verification = await observer.verify(sessionId);
    const trail = await observer.trail(sessionId);

    expect(verification).toEqual({ ok: true, checked: 2 });
    expect(trail[0]!.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(trail[0]!.parentHash).toBeNull();
    expect(trail[1]!.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(trail[1]!.hash).not.toBe(secondFullHash);
    expect(trail[1]!.parentHash).toBe(trail[0]!.hash);
  });

  it('migrates an intact legacy tail before appending a new audit row', async () => {
    const dbPath = tracked(tmpDbPath());
    const observer = createObserverAdapter(dbPath);
    const sessionId = randomUUID();
    const firstMetadata = JSON.stringify({ sessionId, eventType: 'tool_call', tool: 'memory', step: 1 });
    const firstLegacyHash = legacy16AuditHash(firstMetadata);
    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO audit_trail (session_id, event_type, payload, hash, parent_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, 'tool_call', firstMetadata, firstLegacyHash, null);
    db.close();

    await observer.log({ event: 'tool_result', metadata: JSON.stringify({ tool: 'memory', ok: true }), sessionId });
    const trail = await observer.trail(sessionId);

    expect(trail[0]!.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(trail[0]!.hash).not.toBe(firstLegacyHash);
    expect(trail[1]!.parentHash).toBe(trail[0]!.hash);
  });

  it('does not rewrite a valid legacy prefix when a later row is invalid', async () => {
    const dbPath = tracked(tmpDbPath());
    const observer = createObserverAdapter(dbPath);
    const sessionId = randomUUID();
    const firstMetadata = JSON.stringify({ sessionId, eventType: 'tool_call', tool: 'memory', step: 1 });
    const firstLegacyHash = legacy16AuditHash(firstMetadata);
    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO audit_trail (session_id, event_type, payload, hash, parent_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, 'tool_call', firstMetadata, firstLegacyHash, null);
    db.prepare(`
      INSERT INTO audit_trail (session_id, event_type, payload, hash, parent_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, 'tool_result', JSON.stringify({ tool: 'memory', tampered: true }), 'sha256:badbadbad', firstLegacyHash);
    db.close();

    const verification = await observer.verify(sessionId);
    const trail = await observer.trail(sessionId);

    expect(verification.ok).toBe(false);
    expect(verification.firstInvalid?.index).toBe(1);
    expect(trail[0]!.hash).toBe(firstLegacyHash);
  });

  it('allows appending after intact unbound legacy audit rows without migrating them', async () => {
    const dbPath = tracked(tmpDbPath());
    const observer = createObserverAdapter(dbPath);
    const sessionId = randomUUID();
    const firstMetadata = JSON.stringify({ tool: 'memory', phase: 'pre-tool' });
    const firstLegacyHash = legacy16AuditHash(firstMetadata);
    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO audit_trail (session_id, event_type, payload, hash, parent_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, 'tool_call', firstMetadata, firstLegacyHash, null);
    db.close();

    await observer.log({ event: 'tool_result', metadata: JSON.stringify({ tool: 'memory', ok: true }), sessionId });
    const trail = await observer.trail(sessionId);
    const verification = await observer.verify(sessionId);

    expect(trail[0]!.hash).toBe(firstLegacyHash);
    expect(trail[1]!.parentHash).toBe(firstLegacyHash);
    expect(verification.ok).toBe(false);
    expect(verification.firstInvalid?.index).toBe(0);
  });

  it('rejects legacy 16-character audit rows without session binding before migrating', async () => {
    const dbPath = tracked(tmpDbPath());
    const observer = createObserverAdapter(dbPath);
    const metadata = JSON.stringify({ tool: 'memory', ok: true });
    const legacyHash = legacy16AuditHash(metadata);
    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO audit_trail (session_id, event_type, payload, hash, parent_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run('session-b', 'tool_call', metadata, legacyHash, null);
    db.close();

    const verification = await observer.verify('session-b');

    expect(verification.ok).toBe(false);
    expect(verification.firstInvalid?.index).toBe(0);
    const [row] = await observer.trail('session-b');
    expect(row!.hash).toBe(legacyHash);
  });

  it('rejects legacy 16-character audit rows without event binding before migrating', async () => {
    const dbPath = tracked(tmpDbPath());
    const observer = createObserverAdapter(dbPath);
    const sessionId = randomUUID();
    const metadata = JSON.stringify({ sessionId, tool: 'memory', ok: true });
    const legacyHash = legacy16AuditHash(metadata);
    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO audit_trail (session_id, event_type, payload, hash, parent_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, 'tool_call', metadata, legacyHash, null);
    db.close();

    const verification = await observer.verify(sessionId);

    expect(verification.ok).toBe(false);
    expect(verification.firstInvalid?.index).toBe(0);
    const [row] = await observer.trail(sessionId);
    expect(row!.hash).toBe(legacyHash);
  });

  it('preserves JSON string metadata when hashing and storing payloads', async () => {
    const observer = createObserverAdapter(tracked(tmpDbPath()));
    const sessionId = randomUUID();

    const logged = await observer.log({ event: 'tool_call', metadata: JSON.stringify('literal metadata'), sessionId });
    const trail = await observer.trail(sessionId);
    const verification = await observer.verify(sessionId);

    expect(trail[0]!.payload).toBe('"literal metadata"');
    expect(verification).toEqual({ ok: true, checked: 1 });
    expect(logged.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('reports tampered payloads during full-chain verification', async () => {
    const dbPath = tracked(tmpDbPath());
    const observer = createObserverAdapter(dbPath);
    const sessionId = randomUUID();

    await observer.log({ event: 'tool_call', metadata: JSON.stringify({ tool: 'memory' }), sessionId });
    const db = new Database(dbPath);
    db.prepare('UPDATE audit_trail SET payload = ? WHERE session_id = ?').run(JSON.stringify({ tool: 'memory', tampered: true }), sessionId);
    db.close();

    const verification = await observer.verify(sessionId);

    expect(verification.ok).toBe(false);
    expect(verification.firstInvalid?.index).toBe(0);
  });

  it('hashes the exact stored payload bytes during verification', async () => {
    const dbPath = tracked(tmpDbPath());
    const observer = createObserverAdapter(dbPath);
    const sessionId = randomUUID();

    await observer.log({ event: 'tool_call', metadata: JSON.stringify({ tool: 'memory' }), sessionId });
    const db = new Database(dbPath);
    db.prepare('UPDATE audit_trail SET payload = ? WHERE session_id = ?').run('{ "tool": "memory" }', sessionId);
    db.close();

    const verification = await observer.verify(sessionId);

    expect(verification.ok).toBe(false);
    expect(verification.firstInvalid?.index).toBe(0);
  });
});
