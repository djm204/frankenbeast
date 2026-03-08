import type { ReflectionResult } from '../core/types.js';
import type { IMemoryModule } from '../modules/memory.js';
import type { IObservabilityModule } from '../modules/observability.js';
import type { ILlmClient, Result } from './types.js';
import { buildReflectionPrompt } from './prompt-builder.js';
import { parseReflectionResponse } from './response-parser.js';

export interface ReflectionEngineDeps {
  readonly llm: ILlmClient;
  readonly memory: IMemoryModule;
  readonly observability: IObservabilityModule;
  readonly maxReflectionTokens: number;
}

export class ReflectionEngine {
  private readonly deps: ReflectionEngineDeps;

  constructor(deps: ReflectionEngineDeps) {
    this.deps = deps;
  }

  async reflect(projectId: string): Promise<Result<ReflectionResult>> {
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
