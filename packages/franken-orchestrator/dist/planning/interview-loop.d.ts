import type { ILlmClient } from '@franken/types';
import type { PlanGraph, PlanIntent } from '../deps.js';
import type { GraphBuilder } from './chunk-file-graph-builder.js';
/**
 * IO abstraction for user interaction during interviews.
 * The build-runner provides a stdin/stdout implementation; tests provide mocks.
 */
export interface InterviewIO {
    ask(question: string): Promise<string>;
    display(message: string): void;
}
/**
 * GraphBuilder that interviews the user to gather requirements,
 * generates a design document via LLM, and delegates to LlmGraphBuilder
 * for decomposition into a PlanGraph.
 *
 * This is Mode 3 (interview input) — the full "idea to PR" pipeline.
 */
export declare class InterviewLoop implements GraphBuilder {
    private readonly llm;
    private readonly io;
    private readonly graphBuilder;
    constructor(llm: ILlmClient, io: InterviewIO, graphBuilder: GraphBuilder);
    build(intent: PlanIntent): Promise<PlanGraph>;
    private gatherAnswers;
    private parseQuestions;
    private generateDesignDoc;
    private reviseDesignDoc;
    private isApproved;
}
//# sourceMappingURL=interview-loop.d.ts.map