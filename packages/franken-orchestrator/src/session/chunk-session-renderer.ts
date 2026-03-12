import type { ChunkSession, ChunkTranscriptEntry } from './chunk-session.js';
import type { ICliProvider } from '../skills/providers/cli-provider.js';

export interface RenderedChunkSession {
  readonly prompt: string;
  readonly sessionContinue: boolean;
  readonly maxTurns: number;
  readonly model?: string;
}

export interface ChunkSessionRendererConfig {
  readonly recentTurnLimit?: number;
}

export class ChunkSessionRenderer {
  constructor(private readonly config: ChunkSessionRendererConfig = {}) {}

  render(session: ChunkSession, provider: ICliProvider): RenderedChunkSession {
    const sessionContinue =
      provider.supportsNativeSessionResume() &&
      session.activeProvider === provider.name &&
      session.iterations > 0;

    // Prune transcript to prevent context bloating:
    // 1. Always keep the 'objective' (first entry)
    // 2. Keep the most recent 'compaction_summary'
    // 3. Always keep ALL 'error' entries (critical for debugging)
    // 4. Keep only the last N turns of active conversation
    const objective = session.transcript.find((e) => e.kind === 'objective');
    
    let latestCompaction: ChunkTranscriptEntry | undefined;
    for (let i = session.transcript.length - 1; i >= 0; i--) {
      const entry = session.transcript[i];
      if (entry && entry.kind === 'compaction_summary') {
        latestCompaction = entry;
        break;
      }
    }
    
    const errors = session.transcript.filter((e) => e.kind === 'error');
    
    const RECENT_LIMIT = this.config.recentTurnLimit ?? 3;
    const recentTurns = session.transcript
      .filter((e) => e.kind !== 'objective' && e.kind !== 'compaction_summary' && e.kind !== 'error')
      .slice(-RECENT_LIMIT);

    const prunedTranscript = [
      ...(objective ? [objective] : []),
      ...(latestCompaction ? [latestCompaction] : []),
      ...errors,
      ...recentTurns,
    ]
      .map((entry) => `[${entry.kind}] ${entry.content}`)
      .join('\n');

    const prompt = [
      `Chunk: ${session.chunkId}`,
      `Task: ${session.taskId}`,
      `Promise tag: ${session.promiseTag}`,
      `Compaction generation: ${session.compactionGeneration}`,
      prunedTranscript.length > 0 ? `Transcript (pruned for context):\n${prunedTranscript}` : 'Transcript:\n(none yet)',
      `IMPORTANT: To signal task completion, you MUST emit the promise tag exactly like this: <promise>${session.promiseTag}</promise>`,
    ].join('\n\n');

    return {
      prompt,
      sessionContinue,
      maxTurns: 1,
    };
  }
}
