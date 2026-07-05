import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ReplayContentStore } from './replay-content-store.js';
import { hashContent } from './replay-record.js';

describe('ReplayContentStore', () => {
  it('stores content by sha256 and reads it back', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-'));
    const store = new ReplayContentStore(root);
    const ref = store.put('hello world');

    expect(ref).toBe(hashContent('hello world').replace(/^sha256:/, ''));
    expect(ref).toMatch(/^[a-f0-9]{64}$/);
    expect(existsSync(join(root, 'blobs', ref))).toBe(true);
    expect(existsSync(join(root, 'blobs', `sha256:${ref}`))).toBe(false);
    expect(store.get(ref)).toBe('hello world');
  });

  it('detects tampering on read by checking the content hash', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-'));
    const store = new ReplayContentStore(root);
    const ref = store.put('original');

    store.__corruptForTest(ref, 'tampered');

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
      `${ref}00`,
    ];

    for (const invalidRef of invalidRefs) {
      expect(() => store.get(invalidRef)).toThrow(/exactly 64 lowercase sha256 hex/i);
    }
  });
});
