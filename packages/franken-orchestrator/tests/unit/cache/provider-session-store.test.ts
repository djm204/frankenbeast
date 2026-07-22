import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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

  it('uses atomic writes that replace valid provider-session JSON only after the replacement is complete', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-provider-session-'));
    const rootDir = join(workDir, '.fbeast', '.cache', 'llm');
    const sessionPath = join(rootDir, 'work', 'frankenbeast', 'issue%3A99', 'provider-session.json');
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

    await store.save({
      projectId: 'frankenbeast',
      workId: 'issue:99',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      sessionId: 'sess-99-replacement',
      promptFingerprint: 'fp-99',
      createdAt: '2026-03-13T00:00:00.000Z',
      updatedAt: '2026-03-13T00:00:01.000Z',
    });

    await expect(readFile(sessionPath, 'utf8')).resolves.toContain('sess-99-replacement');
    await expect(store.load({
      projectId: 'frankenbeast',
      workId: 'issue:99',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      promptFingerprint: 'fp-99',
    })).resolves.toMatchObject({
      sessionId: 'sess-99-replacement',
      schemaVersion: 3,
    });
  });

  it('leaves unsupported provider-session schema versions untouched', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-provider-session-'));
    const rootDir = join(workDir, '.fbeast', '.cache', 'llm');
    const sessionPath = join(rootDir, 'work', 'frankenbeast', 'issue%3A99', 'provider-session.json');
    await mkdir(dirname(sessionPath), { recursive: true });
    await writeFile(sessionPath, JSON.stringify({
      schemaVersion: 4,
      projectId: 'frankenbeast',
      workId: 'issue:99',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      sessionId: 'sess-99',
      createdAt: '2026-03-13T00:00:00.000Z',
      updatedAt: '2026-03-13T00:00:00.000Z',
    }), 'utf8');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = new ProviderSessionStore(rootDir, { schemaVersion: 3 });
    await expect(store.load({
      projectId: 'frankenbeast',
      workId: 'issue:99',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      promptFingerprint: 'fp-99',
    })).resolves.toBeUndefined();
    await expect(readFile(sessionPath, 'utf8')).resolves.toContain('"schemaVersion":4');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('quarantines schema-invalid provider-session records and treats them as explicit misses', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-provider-session-'));
    const rootDir = join(workDir, '.fbeast', '.cache', 'llm');
    const sessionDir = join(rootDir, 'work', 'frankenbeast', 'issue%3A99');
    const sessionPath = join(sessionDir, 'provider-session.json');
    await mkdir(sessionDir, { recursive: true });
    await writeFile(sessionPath, JSON.stringify({
      schemaVersion: 3,
      projectId: 'frankenbeast',
      workId: 'issue:99',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      sessionId: null,
      promptFingerprint: 'fp-99',
      createdAt: '2026-03-13T00:00:00.000Z',
      updatedAt: '2026-03-13T00:00:00.000Z',
    }), 'utf8');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = new ProviderSessionStore(rootDir, { schemaVersion: 3 });
    await expect(store.load({
      projectId: 'frankenbeast',
      workId: 'issue:99',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      promptFingerprint: 'fp-99',
    })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Invalid provider session record'));
    await expect(readFile(sessionPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await readdir(sessionDir)).filter((entry) => entry.startsWith('provider-session.json.corrupt-'))).toHaveLength(1);
    warn.mockRestore();
  });

  it('quarantines malformed provider-session JSON and treats corruption as an explicit miss', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-provider-session-'));
    const rootDir = join(workDir, '.fbeast', '.cache', 'llm');
    const sessionPath = join(rootDir, 'work', 'frankenbeast', 'issue%3A99', 'provider-session.json');
    await mkdir(dirname(sessionPath), { recursive: true });
    await writeFile(sessionPath, '{"sessionId": "truncated"', 'utf8');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = new ProviderSessionStore(rootDir, { schemaVersion: 3 });
    await expect(store.load({
      projectId: 'frankenbeast',
      workId: 'issue:99',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      promptFingerprint: 'fp-99',
    })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Malformed provider session JSON'));
    await expect(readFile(sessionPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    warn.mockRestore();
  });
});
