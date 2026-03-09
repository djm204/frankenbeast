import { createChunkTranscriptEntry, type ChunkSession, type ChunkTranscriptEntry } from './chunk-session.js';

export interface ChunkSessionCompactorDeps {
  summarize(prompt: string): Promise<string>;
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
    const now = new Date().toISOString();
    const retained = this.retainCriticalTranscript(session.transcript);
    const compactionEntry = createChunkTranscriptEntry('compaction_summary', summary);

    return {
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
