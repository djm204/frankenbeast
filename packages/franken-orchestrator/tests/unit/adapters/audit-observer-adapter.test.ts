import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AuditTrail } from '@franken/observer';
import { ReplayContentStore } from '../../../src/replay/replay-content-store.js';
import { AuditTrailObserverAdapter } from '../../../src/adapters/audit-observer-adapter.js';

function makeInnerObserver() {
  return {
    startTrace: vi.fn(),
    startSpan: vi.fn(() => ({ end: vi.fn() })),
    getTokenSpend: vi.fn().mockResolvedValue({ inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 }),
  };
}

describe('AuditTrailObserverAdapter replay records', () => {
  it('hashes replay content into the store and exposes a manifest without raw content', () => {
    const root = mkdtempSync(join(tmpdir(), 'audit-observer-replay-'));
    const store = new ReplayContentStore(root);
    const adapter = new AuditTrailObserverAdapter(makeInnerObserver(), new AuditTrail(), 'planning', 'claude', store);

    adapter.recordReplay({
      kind: 'llm.response',
      runId: 'run-1',
      provider: 'claude',
      model: 'sonnet',
      content: JSON.stringify({ text: 'cached answer' }),
    });

    const manifest = adapter.getReplayManifest();
    expect(manifest).toHaveLength(1);
    expect(manifest[0]).toMatchObject({
      version: 1,
      kind: 'llm.response',
      runId: 'run-1',
      provider: 'claude',
      model: 'sonnet',
    });
    expect(manifest[0]!.contentRef).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(store.get(manifest[0]!.contentRef)).text).toBe('cached answer');
    expect(JSON.stringify(manifest)).not.toContain('cached answer');
  });
});
