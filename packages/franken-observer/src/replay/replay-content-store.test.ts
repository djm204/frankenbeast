import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
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
    expect(store.get(ref)).toBe('hello world');
  });

  it('detects tampering on read by checking the content hash', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-'));
    const store = new ReplayContentStore(root);
    const ref = store.put('original');

    store.__corruptForTest(ref, 'tampered');

    expect(() => store.get(ref)).toThrow(/hash mismatch/i);
  });
});
