import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ReplayContentStore } from './replay-content-store.js';
import { DeterministicReplayer } from './deterministic-replayer.js';
import type { ReplayRecord } from './replay-record.js';

describe('DeterministicReplayer', () => {
  it('replays a saved llm.response without calling a live provider', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-'));
    const store = new ReplayContentStore(root);
    const ref = store.put(JSON.stringify({ text: 'cached answer' }));
    const replayer = new DeterministicReplayer(store);
    const manifest: ReplayRecord[] = [{ version: 1, kind: 'llm.response', runId: 'r1', timestamp: 't', contentRef: ref }];

    const out = replayer.replayLlmResponse(manifest, 'r1', 0);

    expect(JSON.parse(out).text).toBe('cached answer');
  });

  it('throws if a referenced blob fails hash verification', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-'));
    const store = new ReplayContentStore(root);
    const ref = store.put('x');
    store.__corruptForTest(ref, 'y');
    const replayer = new DeterministicReplayer(store);

    expect(() => replayer.replayLlmResponse(
      [{ version: 1, kind: 'llm.response', runId: 'r1', timestamp: 't', contentRef: ref }],
      'r1',
      0,
    )).toThrow(/hash mismatch/i);
  });

  it('replays a saved tool.result by run and ordinal', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-'));
    const store = new ReplayContentStore(root);
    const first = store.put(JSON.stringify({ ok: true }));
    const second = store.put(JSON.stringify({ ok: false }));
    const replayer = new DeterministicReplayer(store);
    const manifest: ReplayRecord[] = [
      { version: 1, kind: 'tool.result', runId: 'r1', timestamp: 't1', contentRef: first },
      { version: 1, kind: 'tool.result', runId: 'r1', timestamp: 't2', contentRef: second },
    ];

    expect(JSON.parse(replayer.replayToolResult(manifest, 'r1', 1)).ok).toBe(false);
  });
});
