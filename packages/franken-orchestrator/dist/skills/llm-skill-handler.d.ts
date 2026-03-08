import type { ILlmClient } from '@franken/types';
import type { MemoryContext } from '../deps.js';
type LlmSkillResult = {
    output: string;
    tokensUsed: number;
};
export declare class LlmSkillHandler {
    private readonly llmClient;
    constructor(llmClient: ILlmClient);
    execute(objective: string, context: MemoryContext): Promise<LlmSkillResult>;
    private buildPrompt;
    private formatSection;
    private estimateTokens;
}
export {};
//# sourceMappingURL=llm-skill-handler.d.ts.map