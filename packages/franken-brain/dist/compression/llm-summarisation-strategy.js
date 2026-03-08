import { generateId } from '../types/index.js';
import { TruncationStrategy } from './truncation-strategy.js';
import { buildSummarisationPrompt } from './prompts.js';
// Approximate token count: 1 token ≈ 4 characters
const CHARS_PER_TOKEN = 4;
function approxTokens(text) {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}
export class LlmSummarisationStrategy {
    llm;
    fallback = new TruncationStrategy();
    constructor(llm) {
        this.llm = llm;
    }
    async compress(candidates, budget) {
        try {
            const prompt = buildSummarisationPrompt(candidates);
            const summaryText = await this.llm.complete(prompt);
            return {
                summary: {
                    id: generateId(),
                    type: 'working',
                    projectId: candidates[0]?.projectId ?? 'system',
                    status: 'compressed',
                    createdAt: Date.now(),
                    role: 'assistant',
                    content: summaryText,
                    tokenCount: approxTokens(summaryText),
                },
                droppedCount: candidates.length,
            };
        }
        catch {
            // LLM unavailable — degrade gracefully to truncation
            return this.fallback.compress(candidates, budget);
        }
    }
}
//# sourceMappingURL=llm-summarisation-strategy.js.map