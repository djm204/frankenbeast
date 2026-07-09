import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ReplayContentStore } from './replay-content-store.js';
import { hashContent } from './replay-record.js';

function corruptReplayBlob(baseDir: string, ref: string, replacement: string): void {
  writeFileSync(join(baseDir, 'blobs', ref), replacement, 'utf8');
}

describe('ReplayContentStore', () => {
  it('stores content by sha256 and reads it back without exposing test-only mutators', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-'));
    const store = new ReplayContentStore(root);
    const ref = store.put('hello world');

    expect(ref).toBe(hashContent('hello world'));
    expect(ref).toMatch(/^[a-f0-9]{64}$/);
    expect(existsSync(join(root, 'blobs', ref))).toBe(true);
    expect(existsSync(join(root, 'blobs', `sha256:${ref}`))).toBe(false);
    expect(store.get(ref)).toBe('hello world');
    expect('__corruptForTest' in store).toBe(false);
  });

  it('detects tampering on read by checking the content hash', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-'));
    const store = new ReplayContentStore(root);
    const ref = store.put('original');

    corruptReplayBlob(root, ref, 'tampered');

    expect(() => store.get(ref)).toThrow(/hash mismatch/i);
  });

  it('rejects refs that are not exact lowercase sha256 hex before reading', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-'));
    const store = new ReplayContentStore(root);
    const ref = store.put('legacy content');

    const invalidRefs = [
      `sha256:${ref}`,
      ref.toUpperCase(),
      ref.slice(0, 63),
      `../${ref}`,
      `/tmp/${ref}`,
      `${ref.slice(0, 32)}/${ref.slice(32)}`,
      `${ref.slice(0, 32)}\\${ref.slice(32)}`,
      `${ref}00`,
    ];

    for (const invalidRef of invalidRefs) {
      expect(() => store.get(invalidRef)).toThrow(/exactly 64 lowercase sha256 hex/i);
    }
  });

  it('rejects traversal refs before reading parent-directory files', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-'));
    const store = new ReplayContentStore(root);
    const ref = store.put('secret');
    writeFileSync(join(root, ref), 'secret', 'utf8');

    expect(() => store.get(`../${ref}`)).toThrow(/exactly 64 lowercase sha256 hex/i);
  });

  it('rejects a blobs directory symlink that escapes the replay base directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-'));
    const outside = mkdtempSync(join(tmpdir(), 'replay-outside-'));
    symlinkSync(outside, join(root, 'blobs'), 'dir');

    try {
      expect(() => new ReplayContentStore(root)).toThrow(/replayBlobsDir resolves outside base directory/i);
      expect(existsSync(join(outside, hashContent('secret')))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('rejects dangling blob symlinks before writing content', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-'));
    const store = new ReplayContentStore(root);
    const ref = hashContent('secret');
    const danglingTarget = join(tmpdir(), `missing-replay-target-${Date.now()}`);
    symlinkSync(danglingTarget, join(root, 'blobs', ref));

    try {
      expect(() => store.put('secret')).toThrow(/replayBlobPath must not be a symbolic link/i);
      expect(existsSync(danglingTarget)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects existing blob symlinks before reading outside content', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-'));
    const outside = mkdtempSync(join(tmpdir(), 'replay-outside-'));
    const store = new ReplayContentStore(root);
    const ref = hashContent('secret');
    const outsideBlob = join(outside, ref);
    writeFileSync(outsideBlob, 'secret', 'utf8');
    symlinkSync(outsideBlob, join(root, 'blobs', ref));

    try {
      expect(() => store.get(ref)).toThrow(/replayBlobPath resolves outside base directory/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
