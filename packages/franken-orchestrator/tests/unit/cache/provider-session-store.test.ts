import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProviderSessionStore } from '../../../src/cache/provider-session-store.js';

describe('ProviderSessionStore', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('persists provider session metadata across process restarts for one work scope', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-provider-session-'));
    const rootDir = join(workDir, '.fbeast', '.cache', 'llm');

    const store = new ProviderSessionStore(rootDir, { schemaVersion: 3 });
    await store.save({
      projectId: 'frankenbeast',
      workId: 'issue:99',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      sessionId: 'sess-99',
      promptFingerprint: 'fp-99',
      createdAt: '2026-03-13T00:00:00.000Z',
      updatedAt: '2026-03-13T00:00:00.000Z',
    });

    const reloaded = new ProviderSessionStore(rootDir, { schemaVersion: 3 });
    await expect(reloaded.load({
      projectId: 'frankenbeast',
      workId: 'issue:99',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      promptFingerprint: 'fp-99',
    })).resolves.toMatchObject({
      sessionId: 'sess-99',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
    });
  });

  it('does not expose one work scope session metadata to another work scope', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-provider-session-'));
    const rootDir = join(workDir, '.fbeast', '.cache', 'llm');
    const store = new ProviderSessionStore(rootDir, { schemaVersion: 3 });

    await store.save({
      projectId: 'frankenbeast',
      workId: 'issue:99',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      sessionId: 'sess-99',
      promptFingerprint: 'fp-99',
      createdAt: '2026-03-13T00:00:00.000Z',
      updatedAt: '2026-03-13T00:00:00.000Z',
    });

    await expect(store.load({
      projectId: 'frankenbeast',
      workId: 'issue:110',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      promptFingerprint: 'fp-99',
    })).resolves.toBeUndefined();
  });

  it('invalidates stored session metadata when schema version changes', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-provider-session-'));
    const rootDir = join(workDir, '.fbeast', '.cache', 'llm');

    const store = new ProviderSessionStore(rootDir, { schemaVersion: 3 });
    await store.save({
      projectId: 'frankenbeast',
      workId: 'issue:99',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      sessionId: 'sess-99',
      promptFingerprint: 'fp-99',
      createdAt: '2026-03-13T00:00:00.000Z',
      updatedAt: '2026-03-13T00:00:00.000Z',
    });

    const reloaded = new ProviderSessionStore(rootDir, { schemaVersion: 4 });
    await expect(reloaded.load({
      projectId: 'frankenbeast',
      workId: 'issue:99',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      promptFingerprint: 'fp-99',
    })).resolves.toBeUndefined();
  });

  it('invalidates stored session metadata when provider, model, or fingerprint changes', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-provider-session-'));
    const rootDir = join(workDir, '.fbeast', '.cache', 'llm');
    const store = new ProviderSessionStore(rootDir, { schemaVersion: 3 });

    await store.save({
      projectId: 'frankenbeast',
      workId: 'issue:99',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      sessionId: 'sess-99',
      promptFingerprint: 'fp-99',
      createdAt: '2026-03-13T00:00:00.000Z',
      updatedAt: '2026-03-13T00:00:00.000Z',
    });

    await expect(store.load({
      projectId: 'frankenbeast',
      workId: 'issue:99',
      provider: 'codex',
      model: 'claude-sonnet-4-6',
      promptFingerprint: 'fp-99',
    })).resolves.toBeUndefined();

    await expect(store.load({
      projectId: 'frankenbeast',
      workId: 'issue:99',
      provider: 'claude',
      model: 'claude-opus-4',
      promptFingerprint: 'fp-99',
    })).resolves.toBeUndefined();

    await expect(store.load({
      projectId: 'frankenbeast',
      workId: 'issue:99',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      promptFingerprint: 'fp-110',
    })).resolves.toBeUndefined();
  });
});
