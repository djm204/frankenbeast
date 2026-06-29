import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { createObserverAdapter } from './observer-adapter.js';

function tmpDbPath(): string {
  const dir = join(tmpdir(), `fbeast-observer-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, 'beast.db');
}

function legacy16(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function legacy16AuditHash(eventType: string, metadata: string, parentHash?: string): string {
  const inputHash = `sha256:${createHash('sha256').update(metadata).digest('hex')}`;
  const baseHash = legacy16(`${eventType}:${inputHash}:${metadata}`);
  return parentHash ? legacy16(`${parentHash}:${baseHash}`) : baseHash;
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

  it('verifies and migrates legacy 16-character audit hashes', async () => {
    const dbPath = tracked(tmpDbPath());
    const observer = createObserverAdapter(dbPath);
    const sessionId = randomUUID();
    const firstMetadata = JSON.stringify({ tool: 'memory', step: 1 });
    const secondMetadata = JSON.stringify({ tool: 'memory', ok: true });
    const firstLegacyHash = legacy16AuditHash('tool_call', firstMetadata);
    const secondLegacyHash = legacy16AuditHash('tool_result', secondMetadata, firstLegacyHash);
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
});
