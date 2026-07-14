import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReplayContentStore } from '../../../src/replay/replay-content-store.js';

function newStore(): ReplayContentStore {
  return new ReplayContentStore(mkdtempSync(join(tmpdir(), 'orchestrator-replay-store-')));
}

describe('ReplayContentStore', () => {
  it('round-trips content by generated sha256 content ref', () => {
    const store = newStore();
    const ref = store.put(JSON.stringify({ text: 'cached answer' }));

    expect(ref).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(store.get(ref))).toEqual({ text: 'cached answer' });
  });

  it.each([
    '',
    '../manifest.json',
    '/tmp/manifest.json',
    'ABCDEF'.padEnd(64, '0'),
    'g'.repeat(64),
    'a'.repeat(63),
    'a'.repeat(65),
  ])('rejects invalid replay content ref %j before reading blobs', (contentRef) => {
    const store = newStore();

    expect(() => store.get(contentRef)).toThrow(/replay content ref/i);
  });
});
