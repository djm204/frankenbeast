import { generateId } from '../types/index.js';
import { buildLessonPrompt } from './prompts.js';
export class EpisodicLessonExtractor {
    llm;
    constructor(llm) {
        this.llm = llm;
    }
    async extract(traces) {
        if (traces.length === 0) {
            throw new Error('EpisodicLessonExtractor.extract() requires at least one trace');
        }
        const prompt = buildLessonPrompt(traces);
        const lesson = await this.llm.complete(prompt);
        return {
            id: generateId(),
            type: 'semantic',
            projectId: traces[0].projectId,
            status: 'success',
            createdAt: Date.now(),
            source: 'lesson-learned',
            content: lesson,
        };
    }
}
//# sourceMappingURL=episodic-lesson-extractor.js.map