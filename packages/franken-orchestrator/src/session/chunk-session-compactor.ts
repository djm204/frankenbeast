import { createChunkTranscriptEntry, type ChunkSession, type ChunkTranscriptEntry } from './chunk-session.js';
import { isoNow } from '@franken/types';

export type ChunkCompactionTriggerReason = 'threshold' | 'manual';

export interface ChunkCompactionObservation {
  readonly sessionId: string;
  readonly generation: number;
  readonly triggerReason: ChunkCompactionTriggerReason;
  readonly tokensBefore: number;
  readonly tokensAfter: number;
  readonly timestamp: number;
}

export interface ChunkSessionCompactorDeps {
  summarize(prompt: string): Promise<string>;
  measureCompactedTokens?: ((session: ChunkSession) => number) | undefined;
  onCompaction?: ((event: ChunkCompactionObservation) => Promise<void>) | undefined;
}

export class ChunkSessionCompactor {
  constructor(private readonly deps: ChunkSessionCompactorDeps) {}

  buildCompactionPrompt(session: ChunkSession): string {
    const transcript = session.transcript
      .map((entry) => `[${entry.kind}] ${entry.content}`)
      .join('\n');

    return [
      `Summarize chunk session ${session.chunkId}.`,
      `Promise tag: ${session.promiseTag}`,
      'Retain completed work, important file actions, unresolved errors, and remaining objective.',
      transcript,
    ].join('\n\n');
  }

  async compact(
    session: ChunkSession,
    triggerReason: ChunkCompactionTriggerReason = 'manual',
  ): Promise<ChunkSession> {
    const summary = await this.deps.summarize(this.buildCompactionPrompt(session));
    const now = isoNow();
    const retained = this.retainCriticalTranscript(session.transcript);
    const compactionEntry = createChunkTranscriptEntry('compaction_summary', summary);

    const compacted: ChunkSession = {
      ...session,
      compactionGeneration: session.compactionGeneration + 1,
      transcript: [...retained, compactionEntry],
      compactions: [
        ...session.compactions,
        {
          generation: session.compactionGeneration + 1,
          summary,
          createdAt: now,
        },
      ],
      contextWindow: {
        ...session.contextWindow,
        lastCompactedAtIteration: session.iterations,
      },
      updatedAt: now,
    };

    if (this.deps.onCompaction) {
      await this.deps.onCompaction({
        sessionId: compacted.sessionId,
        generation: compacted.compactionGeneration,
        triggerReason,
        tokensBefore: session.contextWindow.usedTokens,
        tokensAfter: this.deps.measureCompactedTokens?.(compacted) ?? compacted.contextWindow.usedTokens,
        timestamp: Date.parse(now),
      });
    }

    return compacted;
  }

  private retainCriticalTranscript(entries: readonly ChunkTranscriptEntry[]): ChunkTranscriptEntry[] {
    const latestObjective = [...entries].reverse().find((entry) => entry.kind === 'objective');
    const unresolvedErrors = entries.filter((entry) => entry.kind === 'error');
    const retained = [
      ...(latestObjective ? [latestObjective] : []),
      ...unresolvedErrors,
    ];

    return retained;
  }
}
