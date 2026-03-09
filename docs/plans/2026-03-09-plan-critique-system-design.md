# Plan Critique System Design

> Date: 2026-03-09
> Status: Approved
> Supersedes: Existing chunk-validator.ts + chunk-remediator.ts

## Problem

The planner produces structurally correct but qualitatively shallow plans. The current validation pipeline (chunk-validator + chunk-remediator) only checks 7 structural categories — it never asks "is this plan good?" Plans with repetitive formulaic chunks, missing hardening, shallow architecture, no integration story, and no operational concerns pass validation without issue.

## Goal

Replace the existing structural-only validation with a pluggable plan critique system that evaluates both structural correctness and qualitative depth. The system must be extensible — new evaluators can be added without modifying the runner.

## Architecture

### Core Interface (franken-types)

```typescript
// packages/franken-types/src/plan-evaluator.ts

export type PlanIssueSeverity = 'error' | 'warning';

export interface PlanCritiqueIssue {
  evaluator: string;
  severity: PlanIssueSeverity;
  chunkId: string | null;
  category: string;
  description: string;
  suggestion: string;
}

export interface PlanEvaluationResult {
  issues: PlanCritiqueIssue[];
  revisedChunks?: ChunkDefinition[];
}

export interface PlanEvaluationContext {
  chunks: ChunkDefinition[];
  designDoc: string;
  rampUp: string;
  relevantSignatures: Array<{ path: string; signatures: string }>;
  packageDeps: Record<string, string[]>;
}

export interface IPlanEvaluator {
  readonly name: string;
  evaluateLocal(ctx: PlanEvaluationContext): PlanCritiqueIssue[];
  buildPromptSection(ctx: PlanEvaluationContext): string | null;
  parseResponse(section: string): PlanEvaluationResult;
}
```

`ChunkDefinition` relocates from `franken-orchestrator/src/cli/file-writer.ts` to `franken-types/src/plan-evaluator.ts`. The file-writer keeps writing logic but imports the type from `@franken/types`.

### Hybrid Evaluator Pattern

Each evaluator has two evaluation paths:

- **`evaluateLocal()`** — deterministic checks, no LLM, no cost. Runs first.
- **`buildPromptSection()` + `parseResponse()`** — LLM-based analysis for semantic/qualitative checks. Returns `null` to skip the LLM pass entirely.

This keeps structural checks and simple heuristics free while reserving LLM calls for qualitative analysis.

### PlanCritiqueRunner (franken-orchestrator)

Replaces `ChunkValidator` + `ChunkRemediator`.

```typescript
export interface PlanCritiqueRunnerOptions {
  maxIterations: number;          // default: 2
  maxTokensPerBatch: number;      // context window budget per LLM call
  llm: ILlmClient;
  evaluators: IPlanEvaluator[];
}

export interface PlanCritiqueResult {
  chunks: ChunkDefinition[];
  issues: PlanCritiqueIssue[];
  iterations: number;
  resolved: boolean;
}
```

**Flow per iteration:**

1. Run `evaluateLocal()` on all evaluators — collect local issues (free)
2. Collect `buildPromptSection()` from evaluators that return non-null
3. Smart-batch: estimate token cost per section (`Math.ceil(text.length / 4)`), group into batches that fit under `maxTokensPerBatch`
4. For each batch, build a combined prompt with section markers per evaluator
5. Parse response — split by evaluator name, pass each section to corresponding `parseResponse()`
6. Merge local issues + LLM issues
7. If any error-severity issues and iteration < max: remediate (LLM call to patch chunks), loop to step 1
8. If clean or max iterations reached: return `PlanCritiqueResult`

**Smart-batching:** The runner estimates tokens per prompt section and groups evaluators into batches that stay under `maxTokensPerBatch` (default 80k). Small plans fit all evaluators in one call. Large plans with rich codebase context may split into 2-3 calls. This avoids overwhelming the context window.

**Batched prompt structure:**

```
You are reviewing an implementation plan. Evaluate EACH section independently.

## Plan Context
<design doc + codebase context>

## Chunks
<chunks JSON>

## Evaluation: repetition
<repetition evaluator prompt section>

## Evaluation: completeness
<completeness evaluator prompt section>

...

Respond in JSON with one key per evaluation section name.
```

## Evaluators (v1)

### 1. StructuralEvaluator

Replaces the existing 7 structural checks.

**Local:** missing required fields, dependency references to non-existent chunks, cycle detection (DFS), `chunk_too_thin` (missing context/edgeCases/interfaceContract on chunks touching >3 files)

**LLM:** `missing_component`, `wrong_dependency`, `design_gap`, `parallelizable`, `missing_interface`

Categories: `missing_field`, `cycle_detected`, `missing_component`, `wrong_dependency`, `parallelizable`, `missing_interface`, `design_gap`, `chunk_too_thin`

### 2. RepetitionEvaluator

Detects formulaic chunks that should be consolidated.

**Local:** Jaccard similarity on chunk objectives (flag pairs >0.6), file path pattern detection (same directory, different names), shared verificationCommand templates across 3+ chunks

**LLM:** "Given these flagged chunks, should they be consolidated? How?"

Categories: `formulaic_chunks`, `consolidation_recommended`

### 3. CompletenessEvaluator

Checks for missing plan-level concerns.

**Local:** No chunk with "e2e"/"harden"/"integration" in ID/objective → `missing_hardening`. No chunk mentioning "error"/"recovery" → `missing_error_recovery`.

**LLM:** "What is this plan missing? Consider: E2E testing, error recovery, observability, security hardening, migration steps."

Categories: `missing_hardening`, `missing_error_recovery`, `missing_observability`, `missing_security`, `missing_migration`

### 4. DepthEvaluator

Identifies shallow boilerplate chunks.

**Local:** Chunks with empty designDecisions AND empty edgeCases that touch >2 files → flag as candidates

**LLM:** "For each flagged chunk: is this pure wiring/boilerplate, or genuine design work? If boilerplate, suggest merging with an adjacent chunk."

Categories: `shallow_chunk`, `missing_design_decisions`, `merge_recommended`

### 5. IntegrationEvaluator

Checks whether the plan connects to relevant existing modules.

**Local:** None (needs semantic understanding)

**LLM:** Given RAMP_UP + package deps: "Which existing modules should this feature integrate with? Are there chunks creating those integration points?"

Categories: `missing_module_integration`, `unused_existing_capability`

### 6. OperationalEvaluator

Probes for production-readiness concerns.

**Local:** None (needs semantic understanding)

**LLM:** "Review for operational gaps: retry/backoff, rate limiting, graceful degradation, monitoring/alerting, configuration management."

Categories: `missing_retry_strategy`, `missing_rate_limiting`, `missing_graceful_degradation`, `missing_monitoring`, `missing_configuration`

### LLM usage summary

| Evaluator | Local | LLM | Typical batch weight |
|-----------|-------|-----|---------------------|
| Structural | heavy | light | small |
| Repetition | medium | light | small |
| Completeness | light | heavy | medium |
| Depth | light | heavy | medium |
| Integration | none | heavy | large (uses RAMP_UP) |
| Operational | none | heavy | medium |

## Integration into LlmGraphBuilder

Current flow:
```
Decompose → Validate → Remediate → Re-validate → buildGraph
```

New flow:
```
Decompose → PlanCritiqueRunner.run() → buildGraph
```

`LlmGraphBuilder.build()` simplifies to:

```typescript
async build(intent: PlanIntent): Promise<PlanGraph> {
  const context = this.contextGatherer
    ? await this.contextGatherer.gather(intent.goal)
    : emptyContext;

  const decomposer = new ChunkDecomposer(this.llm, { maxChunks: this.maxChunks });
  let chunks = await decomposer.decompose(intent.goal, context);

  if (!this.options?.skipValidation) {
    const runner = new PlanCritiqueRunner({
      llm: this.llm,
      evaluators: createDefaultEvaluators(),
      maxIterations: 2,
      maxTokensPerBatch: 80_000,
    });
    const result = await runner.run(chunks, intent.goal, context);
    chunks = result.chunks;
    this.lastValidationIssues = result.issues;
  }

  this.lastChunks = chunks;
  return this.buildGraph(chunks);
}
```

`createDefaultEvaluators()` returns all 6 evaluators. Custom evaluators can be passed via options.

## Changes Summary

**Deleted:**
- `packages/franken-orchestrator/src/planning/chunk-validator.ts`
- `packages/franken-orchestrator/src/planning/chunk-remediator.ts`

**Moved:**
- `ChunkDefinition` interface → `packages/franken-types/src/plan-evaluator.ts`

**Modified:**
- `packages/franken-orchestrator/src/planning/llm-graph-builder.ts` — simplified pipeline
- `packages/franken-orchestrator/src/planning/chunk-decomposer.ts` — remove hard truncation, maxChunks becomes prompt hint only
- All files importing `ChunkDefinition` from file-writer → import from `@franken/types`
- All files importing `ValidationIssue` → import `PlanCritiqueIssue` from `@franken/types`

**New:**
- `packages/franken-types/src/plan-evaluator.ts` — IPlanEvaluator, PlanCritiqueIssue, PlanEvaluationContext, PlanEvaluationResult, ChunkDefinition
- `packages/franken-orchestrator/src/planning/plan-critique-runner.ts`
- `packages/franken-orchestrator/src/planning/evaluators/structural-evaluator.ts`
- `packages/franken-orchestrator/src/planning/evaluators/repetition-evaluator.ts`
- `packages/franken-orchestrator/src/planning/evaluators/completeness-evaluator.ts`
- `packages/franken-orchestrator/src/planning/evaluators/depth-evaluator.ts`
- `packages/franken-orchestrator/src/planning/evaluators/integration-evaluator.ts`
- `packages/franken-orchestrator/src/planning/evaluators/operational-evaluator.ts`

## Design Decisions

1. **Hybrid local+LLM** over pure-LLM: keeps deterministic checks free, reserves LLM for semantic analysis
2. **Smart-batching** over individual calls: context-window-aware grouping, avoids both overwhelming the window and wasting calls
3. **Replace** validator/remediator over alongside: one unified system, no overlapping concerns
4. **No hard chunk count limits**: quality over quantity — a 50-chunk plan is fine if every chunk is meaningful
5. **Interface in franken-types**: evaluators can come from any package in the future
6. **Iterative with max 2**: first pass catches issues, second catches anything remediation introduced. Configurable for future tuning.

## Success Criteria

- All 6 evaluators pass their unit tests (local checks + prompt building + response parsing)
- PlanCritiqueRunner correctly iterates, batches, and remediates
- Channel-integrations-quality plans produce errors (repetitive chunks, missing hardening)
- Chatbot-quality plans pass with warnings at most
- Existing LlmGraphBuilder tests still pass with new pipeline
- No regression in build/typecheck across monorepo
