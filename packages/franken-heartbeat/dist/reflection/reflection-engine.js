import { buildReflectionPrompt } from './prompt-builder.js';
import { parseReflectionResponse } from './response-parser.js';
export class ReflectionEngine {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async reflect(projectId) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [traces, failures, successes] = await Promise.all([
            this.deps.observability.getTraces(since),
            this.deps.memory.getFailures(projectId),
            this.deps.memory.getSuccesses(projectId),
        ]);
        const prompt = buildReflectionPrompt({ traces, failures, successes });
        const llmResult = await this.deps.llm.complete(prompt, {
            maxTokens: this.deps.maxReflectionTokens,
        });
        if (!llmResult.ok) {
            return { ok: false, error: new Error(`LLM call failed: ${llmResult.error.message}`) };
        }
        return parseReflectionResponse(llmResult.value);
    }
}
//# sourceMappingURL=reflection-engine.js.map