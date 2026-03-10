import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
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
  });
});
