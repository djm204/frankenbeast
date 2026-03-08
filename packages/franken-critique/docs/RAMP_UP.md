# franken-critique (MOD-06) -- Agent Ramp-Up

Self-critique and reflection module for the Frankenbeast orchestrator. Implements the Reflexion pattern: a pipeline of evaluators scores agent output, a loop retries with correction requests on failure, and circuit breakers prevent runaway iteration.

## Directory Structure

```
src/
  index.ts                    # barrel export (public API)
  reviewer.ts                 # createReviewer() factory — wires everything together
  types/
    common.ts                 # Score, SessionId; re-exports TaskId, Verdict, Severity from @franken/types
    evaluation.ts             # EvaluationInput, EvaluationFinding, EvaluationResult, CritiqueResult, Evaluator
    contracts.ts              # Port interfaces + DTOs for sibling modules
    loop.ts                   # LoopConfig, CritiqueIteration, CorrectionRequest, CritiqueLoopResult (union), CircuitBreaker
  pipeline/
    critique-pipeline.ts      # CritiquePipeline — runs evaluators in order, short-circuits on safety fail
  loop/
    critique-loop.ts          # CritiqueLoop — orchestrates pipeline + breakers in a while loop
  evaluators/
    evaluator.ts              # re-exports Evaluator interface from types
    safety.ts                 # SafetyEvaluator(guardrails: GuardrailsPort) — deterministic
    ghost-dependency.ts       # GhostDependencyEvaluator(knownPackages: string[]) — deterministic
    logic-loop.ts             # LogicLoopEvaluator() — deterministic, no constructor args
    factuality.ts             # FactualityEvaluator(memory: MemoryPort) — heuristic
    conciseness.ts            # ConcisenessEvaluator() — heuristic, no constructor args
    complexity.ts             # ComplexityEvaluator() — heuristic, no constructor args
    scalability.ts            # ScalabilityEvaluator() — heuristic, no constructor args
    adr-compliance.ts         # ADRComplianceEvaluator(memory: MemoryPort) — heuristic
  breakers/
    circuit-breaker.ts        # re-exports CircuitBreaker interface from types
    max-iteration.ts          # MaxIterationBreaker() — halts at maxIterations (1-5)
    token-budget.ts           # TokenBudgetBreaker(observability: ObservabilityPort) — sync check() always false, use checkAsync()
    consensus-failure.ts      # ConsensusFailureBreaker() — escalates when same evaluator fails >= consensusThreshold times
  memory/
    lesson-recorder.ts        # LessonRecorder(memory: MemoryPort) — records lessons from multi-iteration passes
  errors/
    index.ts                  # Error hierarchy
  server/
    app.ts, index.ts          # Hono HTTP server (not exported from barrel)
tests/
  unit/                       # mirrors src/ structure
  integration/                # critique-loop-full.test.ts
```

## Key Types

```ts
interface EvaluationInput { content: string; source?: string; metadata: Record<string, unknown> }
interface EvaluationResult { evaluatorName: string; verdict: Verdict; score: Score; findings: EvaluationFinding[] }
interface CritiqueResult { verdict: Verdict; overallScore: Score; results: EvaluationResult[]; shortCircuited: boolean }
interface Evaluator { name: string; category: 'deterministic' | 'heuristic'; evaluate(input: EvaluationInput): Promise<EvaluationResult> }
type CritiqueLoopResult = CritiqueLoopPass | CritiqueLoopFail | CritiqueLoopHalted | CritiqueLoopEscalated
// Each variant has { verdict: 'pass'|'fail'|'halted'|'escalated'; iterations: CritiqueIteration[] } + variant-specific fields
interface LoopConfig { maxIterations: number; tokenBudget: number; consensusThreshold: number; sessionId: string; taskId: TaskId }
interface CircuitBreaker { name: string; check(state: LoopState, config: LoopConfig): CircuitBreakerResult }
```

## Port Interfaces (Hexagonal)

| Port | Methods | Sibling Module |
|------|---------|---------------|
| `GuardrailsPort` | `getSafetyRules(): Promise<SafetyRule[]>`, `executeSandbox(code, timeout): Promise<SandboxResult>` | MOD-01 frankenfirewall |
| `MemoryPort` | `searchADRs(query, topK): Promise<ADRMatch[]>`, `searchEpisodic(taskId): Promise<EpisodicTrace[]>`, `recordLesson(lesson): Promise<void>` | MOD-03 franken-brain |
| `ObservabilityPort` | `getTokenSpend(sessionId): Promise<TokenSpend>` | MOD-05 franken-observer |
| `EscalationPort` | `requestHumanReview(request): Promise<void>` | MOD-07 franken-governor |

## CritiquePipeline

`new CritiquePipeline(evaluators)` -- auto-sorts deterministic-first, heuristic-second. `pipeline.run(input)` executes evaluators sequentially. Short-circuits immediately if the `safety` evaluator returns `fail`. Returns aggregated `CritiqueResult` with average score.

## CritiqueLoop

`new CritiqueLoop(pipeline, breakers)` -- `loop.run(input, config)` drives the while-loop:
1. Check all circuit breakers (may return `halted` or `escalated`)
2. Run pipeline
3. On `pass` -> return `{ verdict: 'pass' }`
4. On `fail` -> update failure history, check if `iterationCount >= maxIterations`
5. If max reached -> return `{ verdict: 'fail', correction: CorrectionRequest }`
6. Otherwise loop again

**CRITICAL GOTCHA:** When `maxIterations` is exhausted, `CritiqueLoop` returns verdict `'fail'` (with a `CorrectionRequest`), NOT `'halted'`. The `'halted'` verdict only comes from circuit breakers tripping *before* an iteration runs. The `MaxIterationBreaker` exists but the loop's own `iterationCount >= maxIterations` check fires first and returns `'fail'`.

## createReviewer() Factory

```ts
function createReviewer(config: ReviewerConfig): Reviewer
// ReviewerConfig: { guardrails: GuardrailsPort, memory: MemoryPort, observability: ObservabilityPort, knownPackages: string[] }
// Reviewer: { review(input: EvaluationInput, loopConfig: LoopConfig): Promise<CritiqueLoopResult> }
```

Wires all 8 evaluators + 3 breakers + pipeline + loop + LessonRecorder. The `review()` method runs the loop then records lessons for multi-iteration passes.

## Error Hierarchy

```
CritiqueError (base: code, context)
  EvaluationError       — code: EVALUATION_FAILED
  CircuitBreakerError   — code: CIRCUIT_BREAKER_TRIPPED
  EscalationError       — code: ESCALATION_TRIGGERED
  IntegrationError      — code: INTEGRATION_FAILED
  ConfigurationError    — code: CONFIGURATION_INVALID
```

All accept `CritiqueErrorOptions { context?: Record<string, unknown>; cause?: Error }`.

## Build and Test

```bash
npm run build            # tsc
npm test                 # vitest run (unit)
npm run test:coverage    # vitest run --coverage
npm run test:integration # vitest run --config vitest.integration.config.ts
npm run lint             # eslint src/ tests/
```

## Dependencies

- `@franken/types` (local): `TaskId`, `Verdict`, `CritiqueSeverity`, `TokenSpend`
- `zod` ^3.24: schema validation
- `hono` ^4.7: HTTP server (server/ only)
- Node.js >= 22, TypeScript ^5.7, Vitest ^3, ESM (`"type": "module"`)
