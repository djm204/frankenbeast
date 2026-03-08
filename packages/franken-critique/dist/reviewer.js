import { CritiquePipeline } from './pipeline/critique-pipeline.js';
import { CritiqueLoop } from './loop/critique-loop.js';
import { LessonRecorder } from './memory/lesson-recorder.js';
import { SafetyEvaluator } from './evaluators/safety.js';
import { GhostDependencyEvaluator } from './evaluators/ghost-dependency.js';
import { LogicLoopEvaluator } from './evaluators/logic-loop.js';
import { FactualityEvaluator } from './evaluators/factuality.js';
import { ConcisenessEvaluator } from './evaluators/conciseness.js';
import { ComplexityEvaluator } from './evaluators/complexity.js';
import { ScalabilityEvaluator } from './evaluators/scalability.js';
import { ADRComplianceEvaluator } from './evaluators/adr-compliance.js';
import { MaxIterationBreaker } from './breakers/max-iteration.js';
import { TokenBudgetBreaker } from './breakers/token-budget.js';
import { ConsensusFailureBreaker } from './breakers/consensus-failure.js';
export function createReviewer(config) {
    const evaluators = [
        new SafetyEvaluator(config.guardrails),
        new GhostDependencyEvaluator(config.knownPackages),
        new LogicLoopEvaluator(),
        new FactualityEvaluator(config.memory),
        new ConcisenessEvaluator(),
        new ComplexityEvaluator(),
        new ScalabilityEvaluator(),
        new ADRComplianceEvaluator(config.memory),
    ];
    const pipeline = new CritiquePipeline(evaluators);
    const breakers = [
        new MaxIterationBreaker(),
        new TokenBudgetBreaker(config.observability),
        new ConsensusFailureBreaker(),
    ];
    const loop = new CritiqueLoop(pipeline, breakers);
    const recorder = new LessonRecorder(config.memory);
    return {
        async review(input, loopConfig) {
            const result = await loop.run(input, loopConfig);
            await recorder.record(result, loopConfig.taskId);
            return result;
        },
    };
}
//# sourceMappingURL=reviewer.js.map