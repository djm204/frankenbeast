import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
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
