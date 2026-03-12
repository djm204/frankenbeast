import type { ChunkSession } from './chunk-session.js';
import type { ICliProvider } from '../skills/providers/cli-provider.js';

export interface RenderedChunkSession {
  readonly prompt: string;
  readonly sessionContinue: boolean;
  readonly maxTurns: number;
  readonly model?: string;
}

export class ChunkSessionRenderer {
  render(session: ChunkSession, provider: ICliProvider): RenderedChunkSession {
    const sessionContinue =
      provider.supportsNativeSessionResume() &&
      session.activeProvider === provider.name &&
      session.iterations > 0;

    // Prune transcript to prevent context bloating:
    // 1. Always keep the 'objective' (first entry)
    // 2. Keep the most recent 'compaction_summary'
    // 3. Keep only the last 3 turns of active conversation
    const objective = session.transcript.find((e) => e.kind === 'objective');
    const latestCompaction = [...session.transcript].reverse().find((e) => e.kind === 'compaction_summary');
    
    // Turns are pairs of (usually) assistant output and potential user feedback.
    // For autonomous loops, they are mostly assistant blocks.
    const RECENT_LIMIT = 3;
    const recentTurns = session.transcript
      .filter((e) => e.kind !== 'objective' && e.kind !== 'compaction_summary')
      .slice(-RECENT_LIMIT);

    const prunedTranscript = [
      ...(objective ? [objective] : []),
      ...(latestCompaction ? [latestCompaction] : []),
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
