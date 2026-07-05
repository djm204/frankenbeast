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

    expect(ref).toBe(hashContent('hello world'));
    expect(ref).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(existsSync(join(root, 'blobs', ref.replace(/^sha256:/, '')))).toBe(true);
    expect(existsSync(join(root, 'blobs', ref))).toBe(false);
    expect(store.get(ref)).toBe('hello world');
  });

  it('detects tampering on read by checking the content hash', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-'));
    const store = new ReplayContentStore(root);
    const ref = store.put('original');

    store.__corruptForTest(ref, 'tampered');

    expect(() => store.get(ref)).toThrow(/hash mismatch/i);
  });

  it('can read pre-prefix replay refs for existing durable artifacts', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-'));
    const store = new ReplayContentStore(root);
    const ref = store.put('legacy content');
    const legacyRef = ref.replace(/^sha256:/, '');

    store.__corruptForTest(legacyRef, 'legacy content');

    expect(store.get(legacyRef)).toBe('legacy content');
  });
});
