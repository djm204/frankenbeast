import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FileSessionStore } from '../../../src/chat/session-store.js';

const TMP = join(__dirname, '__fixtures__/chat-store');

describe('FileSessionStore', () => {
  let store: FileSessionStore;

  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
    store = new FileSessionStore(TMP);
  });

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('creates a session and persists to disk', () => {
    const session = store.create('test-project');
    expect(session.id).toMatch(/^chat-/);
    expect(session.projectId).toBe('test-project');

    const loaded = store.get(session.id);
    expect(loaded).toBeDefined();
    expect(loaded!.id).toBe(session.id);
  });

  it('saves updated session state', () => {
    const session = store.create('proj');
    session.transcript.push({ role: 'user', content: 'Hello', timestamp: new Date().toISOString() });
    store.save(session);

    const loaded = store.get(session.id);
    expect(loaded!.transcript).toHaveLength(1);
  });

  it('lists all session IDs', () => {
    store.create('a');
    store.create('b');
    expect(store.list()).toHaveLength(2);
  });

  it('lists stored sessions sorted by most recent update', async () => {
    const first = store.create('proj');
    const second = store.create('proj');

    store.save({
      ...first,
      updatedAt: '2026-03-10T00:00:01.000Z',
    });
    store.save({
      ...second,
      updatedAt: '2026-03-10T00:00:02.000Z',
    });

    const sessions = store.listSessions('proj');

    expect(sessions.map((session) => session.id)).toEqual([second.id, first.id]);
  });

  it('deletes a session', () => {
    const session = store.create('proj');
    store.delete(session.id);
    expect(store.get(session.id)).toBeUndefined();
  });

  it('returns undefined for non-existent session', () => {
    expect(store.get('nonexistent')).toBeUndefined();
    expect(store.listCorruptions()).toEqual([]);
  });

  it('quarantines malformed JSON sessions and reports them during listing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const corruptId = 'chat-corrupt-json';
    const corruptPath = join(TMP, `${corruptId}.json`);
    writeFileSync(corruptPath, '{"id":', 'utf-8');

    expect(store.listSessions()).toEqual([]);

    const [diagnostic] = store.listCorruptions();
    expect(diagnostic).toMatchObject({ id: corruptId, path: corruptPath });
    expect(diagnostic!.reason).toContain('JSON');
    expect(existsSync(corruptPath)).toBe(false);
    expect(existsSync(diagnostic!.quarantinePath)).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('corrupt chat session chat-corrupt-json'));

    warn.mockRestore();
  });

  it('keeps corrupt-session diagnostics visible after a store restart', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const corruptId = 'chat-corrupt-before-restart';
    const corruptPath = join(TMP, `${corruptId}.json`);
    writeFileSync(corruptPath, '{"id":', 'utf-8');

    expect(store.get(corruptId)).toBeUndefined();
    const restartedStore = new FileSessionStore(TMP);

    expect(restartedStore.listCorruptions()).toEqual([
      expect.objectContaining({
        id: corruptId,
        path: corruptPath,
        reason: 'previously quarantined corrupt chat session file',
      }),
    ]);

    warn.mockRestore();
  });

  it('does not report archived corruptions after the same session id is repaired', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const repairedId = 'chat-repaired-after-corruption';
    const repairedPath = join(TMP, `${repairedId}.json`);
    writeFileSync(repairedPath, '{"id":', 'utf-8');

    expect(store.get(repairedId)).toBeUndefined();
    expect(store.listCorruptions()).toEqual([
      expect.objectContaining({ id: repairedId, path: repairedPath }),
    ]);

    store.save({
      id: repairedId,
      projectId: 'proj',
      transcript: [],
      state: 'active',
      tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0,
      createdAt: '2026-03-10T00:00:00.000Z',
      updatedAt: '2026-03-10T00:00:01.000Z',
    });

    expect(readdirSync(TMP).some((entry) => entry.startsWith(`${repairedId}.json.corrupt-`))).toBe(true);
    expect(store.get(repairedId)).toMatchObject({ id: repairedId, projectId: 'proj' });
    expect(store.listCorruptions()).toEqual([]);
    expect(new FileSessionStore(TMP).listCorruptions()).toEqual([]);

    warn.mockRestore();
  });

  it('filters corrupt-session diagnostics by project id when available', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const firstId = 'chat-corrupt-first-project';
    const secondId = 'chat-corrupt-second-project';
    const unknownId = 'chat-corrupt-unknown-project';
    writeFileSync(join(TMP, `${firstId}.json`), JSON.stringify({ id: firstId, projectId: 'first' }), 'utf-8');
    writeFileSync(join(TMP, `${secondId}.json`), JSON.stringify({ id: secondId, projectId: 'second' }), 'utf-8');
    writeFileSync(join(TMP, `${unknownId}.json`), '{"id":', 'utf-8');

    expect(store.get(firstId)).toBeUndefined();
    expect(store.get(secondId)).toBeUndefined();
    expect(store.get(unknownId)).toBeUndefined();

    expect(store.listCorruptions('first')).toEqual([
      expect.objectContaining({ id: firstId, projectId: 'first' }),
      expect.objectContaining({ id: unknownId }),
    ]);
    expect(store.listCorruptions('second')).toEqual([
      expect.objectContaining({ id: secondId, projectId: 'second' }),
      expect.objectContaining({ id: unknownId }),
    ]);

    warn.mockRestore();
  });

  it('does not quarantine unreadable session paths', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unreadableId = 'chat-directory-entry';
    const unreadablePath = join(TMP, `${unreadableId}.json`);
    mkdirSync(unreadablePath, { recursive: true });

    expect(store.get(unreadableId)).toBeUndefined();

    expect(existsSync(unreadablePath)).toBe(true);
    expect(store.listCorruptions()).toEqual([]);

    warn.mockRestore();
  });

  it('rejects path-traversal session ids without moving files outside the store', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const nestedStoreDir = join(TMP, 'nested-store');
    const nestedStore = new FileSessionStore(nestedStoreDir);
    mkdirSync(nestedStoreDir, { recursive: true });
    const outsidePath = join(TMP, 'config.json');
    writeFileSync(outsidePath, JSON.stringify({ ok: true }), 'utf-8');

    expect(nestedStore.get('../config')).toBeUndefined();
    nestedStore.delete('../config');

    expect(existsSync(outsidePath)).toBe(true);
    expect(nestedStore.listCorruptions()).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignoring invalid chat session id'));

    warn.mockRestore();
  });

  it('quarantines schema-invalid session files separately from missing files', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const corruptId = 'chat-invalid-schema';
    const corruptPath = join(TMP, `${corruptId}.json`);
    writeFileSync(corruptPath, JSON.stringify({ id: corruptId, projectId: 'proj' }), 'utf-8');

    expect(store.get(corruptId)).toBeUndefined();

    const corruptions = store.listCorruptions();
    expect(corruptions).toHaveLength(1);
    expect(corruptions[0]).toMatchObject({ id: corruptId, path: corruptPath });
    expect(corruptions[0]!.reason).toContain('Required');
    expect(existsSync(corruptPath)).toBe(false);
    expect(existsSync(corruptions[0]!.quarantinePath)).toBe(true);
    expect(store.get('nonexistent')).toBeUndefined();
    expect(store.listCorruptions()).toHaveLength(1);

    warn.mockRestore();
  });

  it('writes sessions atomically without leaving temporary files after a save', () => {
    const session = store.create('proj');
    session.transcript.push({ role: 'user', content: 'Hello', timestamp: new Date().toISOString() });

    store.save(session);

    expect(store.get(session.id)!.transcript).toHaveLength(1);
    expect(readdirSync(TMP).filter((entry) => entry.includes('.tmp'))).toEqual([]);
  });

  it('preserves existing session file permissions during atomic saves', () => {
    const session = store.create('proj');
    const sessionPath = join(TMP, `${session.id}.json`);
    chmodSync(sessionPath, 0o600);

    session.transcript.push({ role: 'user', content: 'private', timestamp: new Date().toISOString() });
    store.save(session);

    expect(statSync(sessionPath).mode & 0o777).toBe(0o600);
    expect(store.get(session.id)!.transcript).toHaveLength(1);
  });

  it('uses unique quarantine paths for repeated corrupt writes with the same id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const corruptId = 'chat-repeat-corrupt';
    const corruptPath = join(TMP, `${corruptId}.json`);
    writeFileSync(corruptPath, '{"id":', 'utf-8');
    expect(store.get(corruptId)).toBeUndefined();
    const firstQuarantine = store.listCorruptions()[0]!.quarantinePath;

    writeFileSync(corruptPath, '{"id":', 'utf-8');
    expect(store.get(corruptId)).toBeUndefined();

    const quarantinedFiles = readdirSync(TMP).filter((entry) => entry.startsWith(`${corruptId}.json.corrupt-`));
    expect(quarantinedFiles).toHaveLength(2);
    expect(store.listCorruptions()[0]!.quarantinePath).not.toBe(firstQuarantine);
    expect(existsSync(corruptPath)).toBe(false);

    warn.mockRestore();
  });
});
