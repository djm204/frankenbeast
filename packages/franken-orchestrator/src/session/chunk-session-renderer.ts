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

    const transcript = session.transcript
      .map((entry) => `[${entry.kind}] ${entry.content}`)
      .join('\n');

    const prompt = [
      `Chunk: ${session.chunkId}`,
      `Task: ${session.taskId}`,
      `Promise tag: ${session.promiseTag}`,
      `Compaction generation: ${session.compactionGeneration}`,
      transcript.length > 0 ? `Transcript:\n${transcript}` : 'Transcript:\n(none yet)',
      `Continue until the promise tag is emitted exactly as: ${session.promiseTag}`,
    ].join('\n\n');

    return {
      prompt,
      sessionContinue,
      maxTurns: 1,
    };
  }
}
