import type { EpisodicTrace, SemanticChunk } from '../types/index.js';
import { generateId } from '../types/index.js';
import type { ILlmClient } from './llm-client-interface.js';
import { buildLessonPrompt } from './prompts.js';

export class EpisodicLessonExtractor {
  constructor(private readonly llm: ILlmClient) {}

  async extract(traces: EpisodicTrace[]): Promise<SemanticChunk> {
    if (traces.length === 0) {
      throw new Error('EpisodicLessonExtractor.extract() requires at least one trace');
    }

    const prompt = buildLessonPrompt(traces);
    const lesson = await this.llm.complete(prompt);

    return {
      id: generateId(),
      type: 'semantic',
      projectId: traces[0]!.projectId,
      status: 'success',
      createdAt: Date.now(),
      source: 'lesson-learned',
      content: lesson,
    };
  }
}
