import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileInitStateStore } from '../../../src/init/init-state-store.js';
import { createEmptyInitState } from '../../../src/init/init-types.js';

describe('FileInitStateStore', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('returns a clean initial state when no file exists', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-state-'));
    const store = new FileInitStateStore(join(tempDir, 'init-state.json'));

    const state = await store.load('/tmp/project/.frankenbeast/config.json');

    expect(state).toEqual(createEmptyInitState('/tmp/project/.frankenbeast/config.json'));
  });

  it('saves and reloads prior init state', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-state-'));
    const store = new FileInitStateStore(join(tempDir, 'init-state.json'));

    const saved = await store.save({
      ...createEmptyInitState('/tmp/project/.frankenbeast/config.json'),
      selectedModules: ['chat', 'comms'],
      selectedCommsTransports: ['slack'],
      completedSteps: ['module-selection', 'comms-transport-selection'],
      answers: { 'chat.model': 'claude-sonnet-4-6' },
    });

    const loaded = await store.load('/tmp/project/.frankenbeast/config.json');

    expect(loaded).toEqual(saved);
  });
});
