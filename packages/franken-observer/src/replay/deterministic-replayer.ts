import type { ReplayContentStore } from './replay-content-store.js';
import type { ReplayRecord } from './replay-record.js';

export class DeterministicReplayer {
  constructor(private readonly store: ReplayContentStore) {}

  replayLlmResponse(manifest: readonly ReplayRecord[], runId: string, index: number): string {
    return this.replayByKind(manifest, runId, 'llm.response', index);
  }

  replayToolResult(manifest: readonly ReplayRecord[], runId: string, index: number): string {
    return this.replayByKind(manifest, runId, 'tool.result', index);
  }

  private replayByKind(
    manifest: readonly ReplayRecord[],
    runId: string,
    kind: ReplayRecord['kind'],
    index: number,
  ): string {
    const matches = manifest.filter((record) => record.runId === runId && record.kind === kind);
    const record = matches[index];
    if (!record) {
      throw new Error(`No saved ${kind} at index ${index} for run ${runId}`);
    }
    return this.store.get(record.contentRef);
  }
}
