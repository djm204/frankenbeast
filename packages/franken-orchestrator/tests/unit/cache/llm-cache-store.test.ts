import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { LlmCacheStore } from '../../../src/cache/llm-cache-store.js';
import { encodeCachePathSegment } from '../../../src/cache/llm-cache-types.js';

describe('LlmCacheStore', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('persists project-stable entries across process restarts', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-llm-cache-'));
    const rootDir = join(workDir, '.fbeast', '.cache', 'llm');

    const store = new LlmCacheStore(rootDir, { schemaVersion: 1 });
    await store.saveProjectEntry('frankenbeast', 'stable:skills', {
      content: 'stable prompt',
      fingerprint: 'fp-project-stable',
      createdAt: '2026-03-13T00:00:00.000Z',
      metadata: {
        kind: 'project',
        provider: 'claude',
      },
    });

    const reloaded = new LlmCacheStore(rootDir, { schemaVersion: 1 });
    await expect(reloaded.loadProjectEntry('frankenbeast', 'stable:skills')).resolves.toMatchObject({
      content: 'stable prompt',
      fingerprint: 'fp-project-stable',
      metadata: {
        kind: 'project',
        provider: 'claude',
      },
    });
  });

  it('invalidates cache entries when schema version changes', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-llm-cache-'));
    const rootDir = join(workDir, '.fbeast', '.cache', 'llm');

    const store = new LlmCacheStore(rootDir, { schemaVersion: 1 });
    await store.saveProjectEntry('frankenbeast', 'stable:skills', {
      content: 'stable prompt',
      fingerprint: 'fp-project-stable',
      createdAt: '2026-03-13T00:00:00.000Z',
      metadata: {
        kind: 'project',
        provider: 'claude',
      },
    });

    const reloaded = new LlmCacheStore(rootDir, { schemaVersion: 2 });
    await expect(reloaded.loadProjectEntry('frankenbeast', 'stable:skills')).resolves.toBeUndefined();
  });

  it('invalidates cache entries when stored shape is invalid', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-llm-cache-'));
    const rootDir = join(workDir, '.fbeast', '.cache', 'llm');
    const store = new LlmCacheStore(rootDir, { schemaVersion: 1 });
    const path = join(
      rootDir,
      'project',
      encodeCachePathSegment('frankenbeast'),
      'stable',
      `${encodeCachePathSegment('project:broken')}.json`,
    );

    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      JSON.stringify(
        {
          schemaVersion: 1,
          content: null,
          fingerprint: 'fp-broken',
          createdAt: '2026-03-13T00:00:00.000Z',
          metadata: {
            kind: 'project',
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    await expect(store.loadProjectEntry('frankenbeast', 'project:broken')).resolves.toBeUndefined();
  });

  it('isolates work entries by work id', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-llm-cache-'));
    const rootDir = join(workDir, '.fbeast', '.cache', 'llm');
    const store = new LlmCacheStore(rootDir, { schemaVersion: 1 });

    await store.saveWorkEntry('frankenbeast', 'issue:99', 'summary', {
      content: 'issue 99 summary',
      fingerprint: 'fp-issue-99',
      createdAt: '2026-03-13T00:00:00.000Z',
      metadata: {
        kind: 'work',
      },
    });

    await expect(store.loadWorkEntry('frankenbeast', 'issue:99', 'summary')).resolves.toMatchObject({
      content: 'issue 99 summary',
    });
    await expect(store.loadWorkEntry('frankenbeast', 'issue:110', 'summary')).resolves.toBeUndefined();
  });

  it('keeps project and work namespaces separate even when keys match', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-llm-cache-'));
    const rootDir = join(workDir, '.fbeast', '.cache', 'llm');
    const store = new LlmCacheStore(rootDir, { schemaVersion: 1 });

    await store.saveProjectEntry('frankenbeast', 'shared-key', {
      content: 'project shared',
      fingerprint: 'fp-project',
      createdAt: '2026-03-13T00:00:00.000Z',
      metadata: {
        kind: 'project',
      },
    });
    await store.saveWorkEntry('frankenbeast', 'issue:99', 'shared-key', {
      content: 'work shared',
      fingerprint: 'fp-work',
      createdAt: '2026-03-13T00:00:01.000Z',
      metadata: {
        kind: 'work',
      },
    });

    await expect(store.loadProjectEntry('frankenbeast', 'shared-key')).resolves.toMatchObject({
      content: 'project shared',
    });
    await expect(store.loadWorkEntry('frankenbeast', 'issue:99', 'shared-key')).resolves.toMatchObject({
      content: 'work shared',
    });
  });
});
