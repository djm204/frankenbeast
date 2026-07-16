import type {
  GuardrailsPort,
  LessonInjectionContext,
  MemoryPort,
  ObservabilityPort,
} from './types/contracts.js';
import type { EvaluationInput } from './types/evaluation.js';
import type { LoopConfig, CritiqueLoopResult } from './types/loop.js';
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

export interface ReviewerConfig {
  readonly guardrails: GuardrailsPort;
  readonly memory: MemoryPort;
  readonly observability: ObservabilityPort;
  readonly knownPackages: readonly string[];
}

export interface Reviewer {
  review(
    input: EvaluationInput,
    loopConfig: LoopConfig,
  ): Promise<CritiqueLoopResult>;
}

function readMetadataString(
  metadata: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function createLessonInjectionContextFromInput(
  input: EvaluationInput,
): LessonInjectionContext {
  const context: {
    repo?: string;
    role?: string;
    profile?: string;
  } = {};
  const repo = readMetadataString(input.metadata, ['repo', 'repository']);
  if (repo !== undefined) {
    context.repo = repo;
  }
  const role = readMetadataString(input.metadata, [
    'role',
    'reviewerRole',
    'agentRole',
  ]);
  if (role !== undefined) {
    context.role = role;
  }
  const profile = readMetadataString(input.metadata, ['profile', 'profileId']);
  if (profile !== undefined) {
    context.profile = profile;
  }
  return context;
}

export function createReviewer(config: ReviewerConfig): Reviewer {
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
    async review(
      input: EvaluationInput,
      loopConfig: LoopConfig,
    ): Promise<CritiqueLoopResult> {
      const result = await loop.run(input, loopConfig);
      await recorder.record(
        result,
        loopConfig.taskId,
        createLessonInjectionContextFromInput(input),
      );
      return result;
    },
  };
}
