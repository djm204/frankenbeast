import { createChunkTranscriptEntry, type ChunkSession, type ChunkTranscriptEntry } from './chunk-session.js';
import { isoNow, wallClockNow } from '@franken/types';

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
  measureSessionTokens?: ((session: ChunkSession) => number) | undefined;
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

  async compact(session: ChunkSession): Promise<ChunkSession> {
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

    return compacted;
  }

  async recordCompaction(
    previous: ChunkSession,
    compacted: ChunkSession,
    triggerReason: ChunkCompactionTriggerReason = 'manual',
  ): Promise<void> {
    if (!this.deps.onCompaction) return;
    await this.deps.onCompaction({
      sessionId: compacted.sessionId,
      generation: compacted.compactionGeneration,
      triggerReason,
      tokensBefore: this.deps.measureSessionTokens?.(previous) ?? previous.contextWindow.usedTokens,
      tokensAfter: this.deps.measureSessionTokens?.(compacted) ?? compacted.contextWindow.usedTokens,
      timestamp: wallClockNow(),
    });
  }

  async compactAndRecord(
    session: ChunkSession,
    persist: (compacted: ChunkSession) => void | Promise<void>,
    triggerReason: ChunkCompactionTriggerReason = 'manual',
  ): Promise<ChunkSession> {
    const compacted = await this.compact(session);
    await persist(compacted);
    try {
      await this.recordCompaction(session, compacted, triggerReason);
    } catch {
      // Operational telemetry must not abort a successfully committed compaction.
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
