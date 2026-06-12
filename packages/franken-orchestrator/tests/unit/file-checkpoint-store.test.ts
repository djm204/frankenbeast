import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileCheckpointStore } from '../../src/checkpoint/file-checkpoint-store.js';
import type { ICheckpointStore } from '../../src/deps.js';

describe('FileCheckpointStore', () => {
  let tmpDir: string;
  let filePath: string;
  let store: FileCheckpointStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'checkpoint-test-'));
    filePath = join(tmpDir, 'checkpoint.log');
    store = new FileCheckpointStore(filePath);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('implements ICheckpointStore', () => {
    const _check: ICheckpointStore = store;
    expect(_check).toBeDefined();
  });

  describe('has()', () => {
    it('returns false for unknown key', () => {
      expect(store.has('unknown-key')).toBe(false);
    });

    it('returns true for written key', () => {
      store.write('task-1:plan');
      expect(store.has('task-1:plan')).toBe(true);
    });
  });

  describe('write()', () => {
    it('appends key to file one per line', () => {
      store.write('key-a');
      store.write('key-b');
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toBe('key-a\nkey-b\n');
    });

    it('creates file if missing', () => {
      expect(existsSync(filePath)).toBe(false);
      store.write('first-key');
      expect(existsSync(filePath)).toBe(true);
    });

    it('creates parent directories for nested checkpoint paths', () => {
      const nestedPath = join(tmpDir, 'issues', 'issue-89', 'checkpoint.log');
      const nestedStore = new FileCheckpointStore(nestedPath);

      nestedStore.write('first-key');

      expect(existsSync(nestedPath)).toBe(true);
      expect(readFileSync(nestedPath, 'utf-8')).toBe('first-key\n');
    });
  });

  describe('readAll()', () => {
    it('returns empty set when file does not exist', () => {
      const result = store.readAll();
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });

    it('returns set of all written keys', () => {
      store.write('a');
      store.write('b');
      store.write('c');
      const result = store.readAll();
      expect(result).toEqual(new Set(['a', 'b', 'c']));
    });

    it('tolerates trailing newlines', () => {
      store.write('x');
      store.write('y');
      // File already has trailing newline from write()
      const result = store.readAll();
      expect(result.size).toBe(2);
      expect(result.has('x')).toBe(true);
      expect(result.has('y')).toBe(true);
    });

    it('tolerates empty lines', () => {
      // Simulate a partial write with empty lines
      const { writeFileSync } = require('node:fs');
      writeFileSync(filePath, 'a\n\n\nb\n\n');
      const freshStore = new FileCheckpointStore(filePath);
      const result = freshStore.readAll();
      expect(result).toEqual(new Set(['a', 'b']));
    });
  });

  describe('clear()', () => {
    it('truncates the file', () => {
      store.write('key-1');
      store.write('key-2');
      store.clear();
      expect(store.has('key-1')).toBe(false);
      expect(store.readAll().size).toBe(0);
    });

    it('handles clear on non-existent file', () => {
      expect(() => store.clear()).not.toThrow();
    });
  });

  describe('atomicity', () => {
    it('leaves no temp or lock files behind after writes', () => {
      store.write('key-a');
      store.write('key-b');
      store.clear();
      store.write('key-c');
      const leftovers = readdirSync(tmpDir).filter((f) => f !== 'checkpoint.log');
      expect(leftovers).toEqual([]);
    });

    it('reaps an unreadable lock file only after the age fallback', () => {
      writeFileSync(`${filePath}.lock`, '');
      const past = new Date(Date.now() - 60_000);
      const { utimesSync } = require('node:fs');
      utimesSync(`${filePath}.lock`, past, past);

      store.write('key-after-stale-lock');

      expect(store.has('key-after-stale-lock')).toBe(true);
      expect(existsSync(`${filePath}.lock`)).toBe(false);
    });

    it('reaps a lock whose owner process is dead', async () => {
      const { execFile } = require('node:child_process') as typeof import('node:child_process');
      const deadPid: number = await new Promise((res, rej) => {
        const child = execFile(process.execPath, ['-e', ''], (err: unknown) =>
          err ? rej(err) : res(child.pid!),
        );
      });
      writeFileSync(`${filePath}.lock`, `${deadPid}:deadbeefdeadbeef`);

      store.write('key-after-dead-owner');

      expect(store.has('key-after-dead-owner')).toBe(true);
      expect(existsSync(`${filePath}.lock`)).toBe(false);
    });

    it('recovers from an empty lock within the acquisition timeout', () => {
      // Crash window: lock created but owner record never written. The reap
      // age must sit below the lock timeout or the first post-crash write
      // times out instead of recovering.
      writeFileSync(`${filePath}.lock`, '');
      const past = new Date(Date.now() - 3_000);
      const { utimesSync } = require('node:fs');
      utimesSync(`${filePath}.lock`, past, past);

      const writer = new FileCheckpointStore(filePath, { lockTimeoutMs: 5_000 });
      writer.write('recovered');

      expect(writer.has('recovered')).toBe(true);
    });

    it('never breaks a lock held by a live process; write times out instead', () => {
      // Our own pid is alive; a different token means another holder.
      writeFileSync(`${filePath}.lock`, `${process.pid}:0123456789abcdef`);
      const impatient = new FileCheckpointStore(filePath, { lockTimeoutMs: 200 });

      expect(() => impatient.write('blocked')).toThrow(/Timed out acquiring checkpoint lock/);
      // The live holder's lock must still be there, untouched.
      expect(readFileSync(`${filePath}.lock`, 'utf-8')).toBe(`${process.pid}:0123456789abcdef`);
    });
  });

  describe('write-side key validation', () => {
    it('rejects keys readAll would drop, instead of writing then losing them', () => {
      expect(() => store.write('x'.repeat(5000))).toThrow(/Invalid checkpoint key/);
      expect(() => store.write('')).toThrow(/Invalid checkpoint key/);
      expect(() => store.write('two\nlines')).toThrow(/Invalid checkpoint key/);
      expect(store.readAll().size).toBe(0);
    });
  });

  describe('lock owner records', () => {
    it('treats a truncated numeric owner record as reapable, not as live PID', () => {
      // Crash mid-write can leave "1" — must not pin the lock to live PID 1.
      writeFileSync(`${filePath}.lock`, '1');
      const past = new Date(Date.now() - 60_000);
      const { utimesSync } = require('node:fs');
      utimesSync(`${filePath}.lock`, past, past);

      store.write('recovered-from-truncated-owner');

      expect(store.has('recovered-from-truncated-owner')).toBe(true);
    });
  });

  describe('corruption recovery', () => {
    it('drops lines containing NUL bytes and keeps valid entries', () => {
      writeFileSync(filePath, 'good-1\nbad\u0000entry\ngood-2\n');
      const result = store.readAll();
      expect(result).toEqual(new Set(['good-1', 'good-2']));
    });

    it('drops lines containing control characters', () => {
      writeFileSync(filePath, 'good\nbroken\u0001line\n');
      expect(store.readAll()).toEqual(new Set(['good']));
      expect(store.has('good')).toBe(true);
    });

    it('drops absurdly long lines from torn writes', () => {
      writeFileSync(filePath, `good\n${'x'.repeat(5000)}\n`);
      expect(store.readAll()).toEqual(new Set(['good']));
    });

    it('rewrites a clean file on the next write after corruption', () => {
      writeFileSync(filePath, 'good\nbad\u0000entry\n');
      store.write('new-key');
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toBe('good\nnew-key\n');
    });
  });

  describe('concurrent writers', () => {
    it('does not lose or corrupt entries under concurrent multi-process writes', async () => {
      const ts = await import('typescript');
      const { pathToFileURL, fileURLToPath } = await import('node:url');
      const srcPath = fileURLToPath(
        new URL('../../src/checkpoint/file-checkpoint-store.ts', import.meta.url),
      );
      const js = ts.transpileModule(readFileSync(srcPath, 'utf-8'), {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText;
      const modPath = join(tmpDir, 'file-checkpoint-store.mjs');
      writeFileSync(modPath, js);

      const execFileAsync = promisify(execFile);
      const WRITERS = 4;
      const KEYS_PER_WRITER = 25;
      const childScript = (proc: number) => `
        import { FileCheckpointStore } from ${JSON.stringify(pathToFileURL(modPath).href)};
        const store = new FileCheckpointStore(${JSON.stringify(filePath)});
        for (let i = 0; i < ${KEYS_PER_WRITER}; i++) {
          store.write('proc-${proc}-key-' + i);
        }
      `;

      await Promise.all(
        Array.from({ length: WRITERS }, (_, proc) =>
          execFileAsync(process.execPath, ['--input-type=module', '-e', childScript(proc)]),
        ),
      );

      const all = store.readAll();
      expect(all.size).toBe(WRITERS * KEYS_PER_WRITER);
      for (let proc = 0; proc < WRITERS; proc++) {
        for (let i = 0; i < KEYS_PER_WRITER; i++) {
          expect(all.has(`proc-${proc}-key-${i}`)).toBe(true);
        }
      }
      // Every raw line must be a known key — no torn/merged lines.
      const rawLines = readFileSync(filePath, 'utf-8').split('\n').filter((l) => l.length > 0);
      expect(rawLines).toHaveLength(WRITERS * KEYS_PER_WRITER);
    }, 30_000);
  });

  describe('recordCommit()', () => {
    it('writes commit in expected format', () => {
      store.recordCommit('task-1', 'impl', 2, 'abc123');
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toBe('task-1:impl:iter_2:commit_abc123\n');
    });

    it('records multiple commits', () => {
      store.recordCommit('task-1', 'impl', 1, 'aaa');
      store.recordCommit('task-1', 'impl', 2, 'bbb');
      const all = store.readAll();
      expect(all.has('task-1:impl:iter_1:commit_aaa')).toBe(true);
      expect(all.has('task-1:impl:iter_2:commit_bbb')).toBe(true);
    });
  });

  describe('lastCommit()', () => {
    it('returns undefined when no commits recorded', () => {
      expect(store.lastCommit('task-1', 'impl')).toBeUndefined();
    });

    it('returns most recent commit hash for taskId+stage', () => {
      store.recordCommit('task-1', 'impl', 1, 'aaa');
      store.recordCommit('task-1', 'impl', 2, 'bbb');
      store.recordCommit('task-1', 'impl', 3, 'ccc');
      expect(store.lastCommit('task-1', 'impl')).toBe('ccc');
    });

    it('distinguishes between different taskId+stage combinations', () => {
      store.recordCommit('task-1', 'impl', 1, 'aaa');
      store.recordCommit('task-2', 'impl', 1, 'bbb');
      store.recordCommit('task-1', 'test', 1, 'ccc');
      expect(store.lastCommit('task-1', 'impl')).toBe('aaa');
      expect(store.lastCommit('task-2', 'impl')).toBe('bbb');
      expect(store.lastCommit('task-1', 'test')).toBe('ccc');
    });

    it('returns undefined for non-existent file', () => {
      expect(store.lastCommit('nope', 'nope')).toBeUndefined();
    });
  });
});
