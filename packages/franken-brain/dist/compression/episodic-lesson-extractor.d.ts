import type { EpisodicTrace, SemanticChunk } from '../types/index.js';
import type { ILlmClient } from './llm-client-interface.js';
export declare class EpisodicLessonExtractor {
    private readonly llm;
    constructor(llm: ILlmClient);
    extract(traces: EpisodicTrace[]): Promise<SemanticChunk>;
}
//# sourceMappingURL=episodic-lesson-extractor.d.ts.map