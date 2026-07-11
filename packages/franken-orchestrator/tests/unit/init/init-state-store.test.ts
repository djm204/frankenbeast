import { afterEach, describe, expect, it, vi } from 'vitest';
import { chmod, lstat, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileInitStateStore } from '../../../src/init/init-state-store.js';
import { createEmptyInitState } from '../../../src/init/init-types.js';

describe('FileInitStateStore', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('returns a clean initial state when no file exists', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-state-'));
    const store = new FileInitStateStore(join(tempDir, 'init-state.json'));

    const state = await store.load('/tmp/project/.fbeast/config.json');

    expect(state).toEqual(createEmptyInitState('/tmp/project/.fbeast/config.json'));
  });

  it('saves and reloads prior init state', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-state-'));
    const store = new FileInitStateStore(join(tempDir, 'init-state.json'));

    const saved = await store.save({
      ...createEmptyInitState('/tmp/project/.fbeast/config.json'),
      selectedModules: ['chat', 'comms'],
      selectedCommsTransports: ['slack'],
      completedSteps: ['module-selection', 'comms-transport-selection'],
      answers: { 'chat.model': 'claude-sonnet-4-6' },
    });

    const loaded = await store.load('/tmp/project/.fbeast/config.json');

    expect(loaded).toEqual(saved);
  });

  it('quarantines malformed JSON and returns a clean initial state', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-state-'));
    const stateFile = join(tempDir, 'init-state.json');
    const store = new FileInitStateStore(stateFile);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await writeFile(stateFile, '{"selectedModules": [', 'utf-8');

    const state = await store.load('/tmp/project/.fbeast/config.json');
    const files = await readdir(tempDir);
    const quarantine = files.find((file) => file.startsWith('init-state.json.corrupt-'));

    expect(state).toEqual(createEmptyInitState('/tmp/project/.fbeast/config.json'));
    expect(quarantine).toBeTruthy();
    await expect(readFile(join(tempDir, quarantine ?? ''), 'utf-8')).resolves.toBe('{"selectedModules": [');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Malformed init state JSON'));
  });

  it('saves state through a temporary file rename without leaving temp files behind', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-state-'));
    const stateFile = join(tempDir, 'nested', 'init-state.json');
    const store = new FileInitStateStore(stateFile);

    await store.save(createEmptyInitState('/tmp/project/.fbeast/config.json'));

    const files = await readdir(join(tempDir, 'nested'));
    expect(files).toEqual(['init-state.json']);
    await expect(readFile(stateFile, 'utf-8')).resolves.toContain('/tmp/project/.fbeast/config.json');
  });

  it('preserves existing file permissions when saving atomically', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-state-'));
    const stateFile = join(tempDir, 'init-state.json');
    await writeFile(stateFile, '{}', 'utf-8');
    await chmod(stateFile, 0o600);
    const store = new FileInitStateStore(stateFile);

    await store.save(createEmptyInitState('/tmp/project/.fbeast/config.json'));

    const fileInfo = await lstat(stateFile);
    expect(fileInfo.mode & 0o777).toBe(0o600);
  });

  it('updates a dangling symlink target instead of replacing the symlink', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-state-'));
    const targetFile = join(tempDir, 'shared-init-state.json');
    const stateFile = join(tempDir, 'init-state.json');
    await symlink(targetFile, stateFile);
    const store = new FileInitStateStore(stateFile);

    await store.save(createEmptyInitState('/tmp/project/.fbeast/config.json'));

    const linkInfo = await lstat(stateFile);
    expect(linkInfo.isSymbolicLink()).toBe(true);
    await expect(readFile(targetFile, 'utf-8')).resolves.toContain('/tmp/project/.fbeast/config.json');
  });

  it('quarantines malformed JSON from a symlink target without replacing the symlink', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-state-'));
    const targetFile = join(tempDir, 'shared-init-state.json');
    const stateFile = join(tempDir, 'init-state.json');
    await writeFile(targetFile, '{"selectedModules": [', 'utf-8');
    await symlink(targetFile, stateFile);
    const store = new FileInitStateStore(stateFile);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await store.load('/tmp/project/.fbeast/config.json');

    const linkInfo = await lstat(stateFile);
    const files = await readdir(tempDir);
    const quarantine = files.find((file) => file.startsWith('shared-init-state.json.corrupt-'));
    expect(linkInfo.isSymbolicLink()).toBe(true);
    expect(quarantine).toBeTruthy();
    await expect(readFile(join(tempDir, quarantine ?? ''), 'utf-8')).resolves.toBe('{"selectedModules": [');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Malformed init state JSON'));
  });
});
