# MOD-06 Implementation Plan: Self-Critique & Reflection

## Repository Layout

```
franken-critique/
├── src/
│   ├── index.ts                    # Public API barrel export
│   ├── types/
│   │   ├── evaluation.ts           # EvaluationInput, EvaluationResult, CritiqueResult
│   │   ├── contracts.ts            # Port interfaces for MOD-01, MOD-03, MOD-05, MOD-07
│   │   ├── loop.ts                 # LoopState, LoopConfig, CritiqueLoopResult, CorrectionRequest
│   │   └── common.ts               # Shared primitives (Severity, Verdict, etc.)
│   ├── errors/
│   │   └── index.ts                # CritiqueError hierarchy (ADR-005)
│   ├── evaluators/
│   │   ├── evaluator.ts            # Evaluator interface
│   │   ├── factuality.ts           # FactualityEvaluator
│   │   ├── safety.ts               # SafetyEvaluator
│   │   ├── conciseness.ts          # ConcisenessEvaluator
│   │   ├── scalability.ts          # ScalabilityEvaluator
│   │   ├── ghost-dependency.ts     # GhostDependencyEvaluator
│   │   ├── complexity.ts           # ComplexityEvaluator
│   │   ├── logic-loop.ts           # LogicLoopEvaluator
│   │   └── adr-compliance.ts       # ADRComplianceEvaluator
│   ├── pipeline/
│   │   └── critique-pipeline.ts    # CritiquePipeline (ADR-002)
│   ├── breakers/
│   │   ├── circuit-breaker.ts      # CircuitBreaker interface
│   │   ├── max-iteration.ts        # MaxIterationBreaker
│   │   ├── token-budget.ts         # TokenBudgetBreaker
│   │   └── consensus-failure.ts    # ConsensusFailureBreaker
│   ├── loop/
│   │   └── critique-loop.ts        # CritiqueLoop engine (ADR-006)
│   └── memory/
│       └── lesson-recorder.ts      # Records successful critiques to MOD-03
├── tests/
│   ├── unit/
│   │   ├── errors/
│   │   │   └── errors.test.ts
│   │   ├── evaluators/
│   │   │   ├── factuality.test.ts
│   │   │   ├── safety.test.ts
│   │   │   ├── conciseness.test.ts
│   │   │   ├── scalability.test.ts
│   │   │   ├── ghost-dependency.test.ts
│   │   │   ├── complexity.test.ts
│   │   │   ├── logic-loop.test.ts
│   │   │   └── adr-compliance.test.ts
│   │   ├── pipeline/
│   │   │   └── critique-pipeline.test.ts
│   │   ├── breakers/
│   │   │   ├── max-iteration.test.ts
│   │   │   ├── token-budget.test.ts
│   │   │   └── consensus-failure.test.ts
│   │   ├── loop/
│   │   │   └── critique-loop.test.ts
│   │   └── memory/
│   │       └── lesson-recorder.test.ts
│   └── integration/
│       └── critique-loop-full.test.ts
├── docs/
│   ├── adr/
│   │   ├── ADR-000-template.md
│   │   ├── ADR-001-typescript-strict-mode.md
│   │   ├── ADR-002-evaluator-pipeline-architecture.md
│   │   ├── ADR-003-circuit-breaker-strategy.md
│   │   ├── ADR-004-module-integration-contracts.md
│   │   ├── ADR-005-custom-error-hierarchy.md
│   │   └── ADR-006-critique-loop-engine.md
│   └── implementation-plan.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── vitest.integration.config.ts
├── eslint.config.js
├── .prettierrc.json
└── CLAUDE.md
```

---

## Methodology

- **TDD (Red-Green-Refactor):** Every feature starts with a failing test. Write the minimum code to pass. Refactor while green.
- **Atomic commits:** Each commit compiles and passes all tests. One logical change per commit.
- **Conventional Commits:** `feat(scope): subject`, `test(scope): subject`, `refactor(scope): subject`
- **Small PRs:** Each phase is one PR, max ~400 lines changed. Phases with independent components may be split into sub-PRs.
- **Coverage gates:** Minimum 90% line coverage, 80% branch coverage per PR.

---

## Dependency Graph

```
Phase 0 (Scaffold)
    │
Phase 1 (Types & Interfaces)
    │
    ├── Phase 2 (Errors)
    │
    ├── Phase 3a (Deterministic Evaluators)
    │         │
    ├── Phase 3b (Heuristic Evaluators)
    │         │
    ├── Phase 4 (Circuit Breakers)
    │         │
    │         ▼
    ├── Phase 5 (Critique Pipeline)
    │         │
    │         ▼
    └── Phase 6 (Critique Loop Engine)
              │
              ▼
        Phase 7 (Lesson Recorder / Memory Integration)
              │
              ▼
        Phase 8 (Public API & Integration Tests)
```

Phases 2, 3a, 3b, and 4 are **independent** after Phase 1 and can be developed on separate branches in parallel.

---

## Phase 0: Project Scaffold

**Branch:** `chore/project-scaffold`
**PR:** #1
**Estimated size:** ~150 lines (config files only)

### What
- Initialize `package.json` with `@franken/critique`
- Create `tsconfig.json` (strict mode, NodeNext — ADR-001)
- Create `vitest.config.ts` and `vitest.integration.config.ts`
- Create `eslint.config.js` (flat config with typescript-eslint + prettier)
- Create `.prettierrc.json`
- Create directory structure (`src/`, `tests/unit/`, `tests/integration/`, `docs/`)
- Add `src/index.ts` placeholder (empty barrel export)
- Verify `npm run build`, `npm test`, `npm run lint` all pass on empty project

### Commits
1. `chore(scaffold): initialize package.json with @franken/critique`
2. `chore(scaffold): add tsconfig.json with strict NodeNext config`
3. `chore(scaffold): add vitest and eslint configuration`
4. `chore(scaffold): create directory structure and placeholder index`

### Definition of Done
- [ ] `npm run build` succeeds
- [ ] `npm test` succeeds (no tests, zero failures)
- [ ] `npm run lint` passes
- [ ] All directories exist

---

## Phase 1: Types & Interfaces

**Branch:** `feat/types-and-interfaces`
**PR:** #2
**Estimated size:** ~200 lines
**Depends on:** Phase 0
**ADRs:** ADR-002, ADR-004

### What
Define all core types and port interfaces. No implementation code.

### Files
- `src/types/common.ts` — `Severity`, `Verdict`, `Score`
- `src/types/evaluation.ts` — `EvaluationInput`, `EvaluationResult`, `CritiqueResult`, `Evaluator` interface
- `src/types/contracts.ts` — `GuardrailsPort`, `MemoryPort`, `ObservabilityPort`, `EscalationPort`
- `src/types/loop.ts` — `LoopState`, `LoopConfig`, `CritiqueLoopResult`, `CorrectionRequest`, `CritiqueIteration`, `CircuitBreaker` interface

### TDD Approach
- Write type-level tests: create objects conforming to each interface, assert assignability
- Use `expectTypeOf` from Vitest for compile-time type assertions

### Commits
1. `feat(types): add common primitives (Severity, Verdict, Score)`
2. `feat(types): add evaluation types and Evaluator interface`
3. `feat(types): add module integration port interfaces`
4. `feat(types): add loop state, config, and result types`

### Definition of Done
- [ ] All types compile with no errors
- [ ] Type tests pass
- [ ] No `any` types
- [ ] Exported from `src/index.ts`

---

## Phase 2: Custom Error Hierarchy

**Branch:** `feat/error-hierarchy`
**PR:** #3
**Estimated size:** ~150 lines
**Depends on:** Phase 1
**ADR:** ADR-005

### What
Implement the `CritiqueError` hierarchy.

### Files
- `src/errors/index.ts` — All error classes
- `tests/unit/errors/errors.test.ts`

### TDD Approach
1. RED: Test that `CritiqueError` extends `Error`, has `code` and `context`
2. GREEN: Implement `CritiqueError` base class
3. RED: Test each subclass (`EvaluationError`, `CircuitBreakerError`, etc.)
4. GREEN: Implement each subclass
5. RED: Test `cause` chaining
6. GREEN: Implement cause forwarding

### Commits
1. `test(errors): add tests for CritiqueError base class`
2. `feat(errors): implement CritiqueError base class`
3. `test(errors): add tests for error subclasses`
4. `feat(errors): implement EvaluationError, CircuitBreakerError, and others`

### Definition of Done
- [ ] All error classes instantiable with correct `code`, `context`, and `cause`
- [ ] `instanceof` checks work correctly
- [ ] 100% coverage on error module

---

## Phase 3a: Deterministic Evaluators

**Branch:** `feat/deterministic-evaluators`
**PR:** #4
**Estimated size:** ~300 lines
**Depends on:** Phase 1, Phase 2
**ADR:** ADR-002

### What
Implement evaluators that perform deterministic (non-LLM) checks:
- `SafetyEvaluator` — checks input against safety rules from `GuardrailsPort`
- `GhostDependencyEvaluator` — detects imports not present in the skill registry
- `LogicLoopEvaluator` — detects obvious infinite recursion patterns (AST-free heuristics: self-calling functions, while(true) without break)

### TDD Approach (per evaluator)
1. RED: Test that evaluator implements `Evaluator` interface
2. RED: Test with clean input → expect pass
3. GREEN: Implement pass case
4. RED: Test with violation → expect fail with details
5. GREEN: Implement detection logic
6. REFACTOR: Extract shared patterns

### Commits
1. `test(evaluators): add SafetyEvaluator tests`
2. `feat(evaluators): implement SafetyEvaluator`
3. `test(evaluators): add GhostDependencyEvaluator tests`
4. `feat(evaluators): implement GhostDependencyEvaluator`
5. `test(evaluators): add LogicLoopEvaluator tests`
6. `feat(evaluators): implement LogicLoopEvaluator`

### Definition of Done
- [ ] All three evaluators implement `Evaluator` interface
- [ ] Category is `'deterministic'` for all
- [ ] Tests cover pass, fail, and edge cases
- [ ] Port dependencies are injected, not imported directly

---

## Phase 3b: Heuristic Evaluators

**Branch:** `feat/heuristic-evaluators`
**PR:** #5
**Estimated size:** ~350 lines
**Depends on:** Phase 1, Phase 2
**ADR:** ADR-002

### What
Implement evaluators that perform heuristic (judgment-based) checks:
- `FactualityEvaluator` — cross-references claims against ADRs and docs via `MemoryPort`
- `ConcisenessEvaluator` — flags over-engineered solutions (line count ratios, abstraction depth)
- `ScalabilityEvaluator` — evaluates 0-to-1 build readiness (hardcoded values, missing config)
- `ComplexityEvaluator` — flags bloat (function length, nesting depth, parameter count)
- `ADRComplianceEvaluator` — checks proposed code against stored architectural rules via `MemoryPort`

### TDD Approach (per evaluator)
Same pattern as Phase 3a. Each evaluator gets:
1. Interface conformance test
2. Pass case test → implementation
3. Fail case test → detection logic
4. Edge case tests → refinement

### Commits
1. `test(evaluators): add FactualityEvaluator tests`
2. `feat(evaluators): implement FactualityEvaluator`
3. `test(evaluators): add ConcisenessEvaluator tests`
4. `feat(evaluators): implement ConcisenessEvaluator`
5. `test(evaluators): add ComplexityEvaluator tests`
6. `feat(evaluators): implement ComplexityEvaluator`
7. `test(evaluators): add ScalabilityEvaluator and ADRComplianceEvaluator tests`
8. `feat(evaluators): implement ScalabilityEvaluator and ADRComplianceEvaluator`

### Note
If this PR exceeds ~400 lines, split into two PRs:
- PR #5a: FactualityEvaluator + ConcisenessEvaluator + ComplexityEvaluator
- PR #5b: ScalabilityEvaluator + ADRComplianceEvaluator

### Definition of Done
- [ ] All five evaluators implement `Evaluator` interface
- [ ] Category is `'heuristic'` for all
- [ ] MemoryPort interactions are tested with mocks
- [ ] Scoring logic is deterministic given the same input

---

## Phase 4: Circuit Breakers

**Branch:** `feat/circuit-breakers`
**PR:** #6
**Estimated size:** ~250 lines
**Depends on:** Phase 1, Phase 2
**ADR:** ADR-003

### What
Implement the three circuit breakers:
- `MaxIterationBreaker` — configurable cap, default 3, max 5
- `TokenBudgetBreaker` — tracks cumulative token spend via `ObservabilityPort`
- `ConsensusFailureBreaker` — detects repeated failures without improvement

### TDD Approach
1. RED: Test MaxIterationBreaker with iteration count below limit → not tripped
2. GREEN: Implement
3. RED: Test with iteration count at limit → tripped with 'halt'
4. GREEN: Implement
5. RED: Test with invalid config (limit < 1 or > 5) → ConfigurationError
6. GREEN: Implement validation
7. Repeat pattern for TokenBudgetBreaker and ConsensusFailureBreaker

### Commits
1. `test(breakers): add MaxIterationBreaker tests`
2. `feat(breakers): implement MaxIterationBreaker`
3. `test(breakers): add TokenBudgetBreaker tests`
4. `feat(breakers): implement TokenBudgetBreaker`
5. `test(breakers): add ConsensusFailureBreaker tests`
6. `feat(breakers): implement ConsensusFailureBreaker`

### Definition of Done
- [ ] All three breakers implement `CircuitBreaker` interface
- [ ] MaxIterationBreaker enforces 1-5 range
- [ ] TokenBudgetBreaker integrates with ObservabilityPort mock
- [ ] ConsensusFailureBreaker detects repeated same-category failures
- [ ] All return correct `action` ('halt' or 'escalate')

---

## Phase 5: Critique Pipeline

**Branch:** `feat/critique-pipeline`
**PR:** #7
**Estimated size:** ~200 lines
**Depends on:** Phase 3a, Phase 3b
**ADR:** ADR-002

### What
Implement `CritiquePipeline` that orchestrates evaluators:
- Accepts evaluator list at construction
- Runs deterministic evaluators first, then heuristic
- Aggregates results into a single `CritiqueResult`
- Short-circuits on critical safety failures

### TDD Approach
1. RED: Test pipeline with zero evaluators → pass (vacuous truth)
2. GREEN: Implement empty pipeline
3. RED: Test with one passing evaluator → pass
4. GREEN: Implement single evaluator execution
5. RED: Test with one failing evaluator → fail with details
6. GREEN: Implement failure aggregation
7. RED: Test ordering (deterministic before heuristic)
8. GREEN: Implement sorting
9. RED: Test short-circuit on safety failure
10. GREEN: Implement short-circuit logic

### Commits
1. `test(pipeline): add CritiquePipeline basic tests`
2. `feat(pipeline): implement CritiquePipeline with evaluator orchestration`
3. `test(pipeline): add ordering and short-circuit tests`
4. `feat(pipeline): implement deterministic-first ordering and safety short-circuit`
5. `refactor(pipeline): extract result aggregation logic`

### Definition of Done
- [ ] Pipeline runs all evaluators and aggregates results
- [ ] Deterministic evaluators run before heuristic
- [ ] Safety failures short-circuit remaining evaluators
- [ ] Empty pipeline returns pass
- [ ] Failed evaluations include actionable feedback strings

---

## Phase 6: Critique Loop Engine

**Branch:** `feat/critique-loop`
**PR:** #8
**Estimated size:** ~250 lines
**Depends on:** Phase 4, Phase 5
**ADR:** ADR-006

### What
Implement `CritiqueLoop` that orchestrates pipeline + breakers across iterations.

### TDD Approach
1. RED: Test single iteration that passes → `{ verdict: 'pass' }`
2. GREEN: Implement single-pass path
3. RED: Test single iteration that fails → `{ verdict: 'fail', correction }`
4. GREEN: Implement fail path with CorrectionRequest construction
5. RED: Test breaker trips before first iteration → `{ verdict: 'halted' }`
6. GREEN: Implement pre-check
7. RED: Test escalation path → `{ verdict: 'escalated' }`
8. GREEN: Implement escalation
9. RED: Test multi-iteration convergence (fail → pass)
10. GREEN: Implement iteration loop
11. REFACTOR: Clean up loop state management

### Commits
1. `test(loop): add CritiqueLoop single-iteration tests`
2. `feat(loop): implement CritiqueLoop pass and fail paths`
3. `test(loop): add circuit breaker integration tests`
4. `feat(loop): implement breaker checks and halt/escalate paths`
5. `test(loop): add multi-iteration convergence tests`
6. `feat(loop): implement iteration loop with history tracking`

### Definition of Done
- [ ] All four verdict types tested and reachable
- [ ] Iteration history fully captured
- [ ] CorrectionRequest contains specific, actionable feedback
- [ ] Breakers checked before each iteration
- [ ] Loop state is immutable between iterations (no mutation)

---

## Phase 7: Lesson Recorder (Memory Integration)

**Branch:** `feat/lesson-recorder`
**PR:** #9
**Estimated size:** ~150 lines
**Depends on:** Phase 6
**ADR:** ADR-004

### What
Implement `LessonRecorder` that feeds successful critiques back to MOD-03 episodic memory.

### TDD Approach
1. RED: Test that a passed critique with no corrections records nothing
2. GREEN: Implement no-op for clean passes
3. RED: Test that a multi-iteration pass (fail → pass) extracts a lesson
4. GREEN: Implement lesson extraction from iteration history
5. RED: Test lesson structure (contains evaluator name, failure description, correction that fixed it)
6. GREEN: Implement structured lesson format
7. RED: Test MemoryPort.recordLesson is called with correct data
8. GREEN: Wire up MemoryPort integration

### Commits
1. `test(memory): add LessonRecorder tests`
2. `feat(memory): implement LessonRecorder with lesson extraction`
3. `test(memory): add MemoryPort integration tests`
4. `feat(memory): wire LessonRecorder to MemoryPort`

### Definition of Done
- [ ] Only multi-iteration passes produce lessons
- [ ] Lessons contain evaluator name, failure description, and successful correction
- [ ] MemoryPort.recordLesson called with correct CritiqueLesson
- [ ] Errors from MemoryPort are caught and logged (non-fatal)

---

## Phase 8: Public API & Integration Tests

**Branch:** `feat/public-api`
**PR:** #10
**Estimated size:** ~200 lines
**Depends on:** Phase 7

### What
- Wire all components together in `src/index.ts` barrel export
- Create factory function `createReviewer(config)` that assembles the full pipeline
- Write integration tests that exercise the full loop with mock ports
- Add `vitest.integration.config.ts` test execution

### TDD Approach
1. RED: Test `createReviewer()` returns a working reviewer instance
2. GREEN: Implement factory
3. RED: Integration test: clean input → pass on first iteration
4. GREEN: Verify wiring
5. RED: Integration test: bad input → fail → corrected input → pass
6. GREEN: Verify multi-iteration flow
7. RED: Integration test: repeated failure → breaker trips → escalation
8. GREEN: Verify circuit breaker integration

### Commits
1. `feat(api): add createReviewer factory function`
2. `test(integration): add full critique loop integration tests`
3. `feat(api): finalize barrel exports in index.ts`
4. `docs: update CLAUDE.md with final architecture and usage`

### Definition of Done
- [ ] `createReviewer()` produces a fully configured reviewer
- [ ] Integration tests cover pass, fail+correct, and breaker-trip scenarios
- [ ] All types and key classes exported from `src/index.ts`
- [ ] `npm run build`, `npm test`, `npm run lint` all pass
- [ ] Coverage meets 90% line / 80% branch thresholds

---

## PR Summary

| PR | Phase | Branch | Depends On | ~Lines |
|----|-------|--------|------------|--------|
| #1 | 0 - Scaffold | `chore/project-scaffold` | — | 150 |
| #2 | 1 - Types | `feat/types-and-interfaces` | #1 | 200 |
| #3 | 2 - Errors | `feat/error-hierarchy` | #2 | 150 |
| #4 | 3a - Deterministic Evaluators | `feat/deterministic-evaluators` | #2, #3 | 300 |
| #5 | 3b - Heuristic Evaluators | `feat/heuristic-evaluators` | #2, #3 | 350 |
| #6 | 4 - Circuit Breakers | `feat/circuit-breakers` | #2, #3 | 250 |
| #7 | 5 - Pipeline | `feat/critique-pipeline` | #4, #5 | 200 |
| #8 | 6 - Loop Engine | `feat/critique-loop` | #6, #7 | 250 |
| #9 | 7 - Lesson Recorder | `feat/lesson-recorder` | #8 | 150 |
| #10 | 8 - Public API | `feat/public-api` | #9 | 200 |
| **Total** | | | | **~2,200** |

PRs #3, #4, #5, and #6 can be developed in parallel after #2 merges.
