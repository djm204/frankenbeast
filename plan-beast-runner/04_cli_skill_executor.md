# Chunk 04: CliSkillExecutor + Tests

## Objective

Implement the CliSkillExecutor class — the top-level orchestrator for CLI skill execution. Composes RalphLoop + GitBranchIsolator + observer tracing into a single `execute()` method that returns `SkillResult`. TDD: write tests first.

## Files

- Create: `franken-orchestrator/tests/unit/skills/cli-skill-executor.test.ts`
- Create: `franken-orchestrator/src/skills/cli-skill-executor.ts`
- Read (context): `franken-orchestrator/src/skills/cli-types.ts` (chunk 01)
- Read (context): `franken-orchestrator/src/skills/ralph-loop.ts` (chunk 02)
- Read (context): `franken-orchestrator/src/skills/git-branch-isolator.ts` (chunk 03)
- Read (context): `franken-orchestrator/src/deps.ts` — SkillInput, SkillResult
- Read (context): `franken-orchestrator/src/skills/llm-skill-handler.ts` — structural pattern to follow

## Context (read these first)

- `franken-orchestrator/src/deps.ts` — SkillInput (line 47-53), SkillResult (line 55-58)
- `franken-orchestrator/src/skills/llm-skill-handler.ts` — the structural precedent (constructor with dep, execute method, estimateTokens)
- `franken-observer/src/index.ts` — TraceContext, SpanLifecycle, TokenCounter, CostCalculator, CircuitBreaker exports

## Success Criteria

- [ ] Test file exists with at least 8 test cases covering: successful execution (promise detected), failed execution (max iterations), budget exceeded mid-loop, observer span creation per iteration, token recording per iteration, git branch isolation lifecycle, error propagation from RalphLoop, config validation
- [ ] Tests are written FIRST and fail before implementation
- [ ] `CliSkillExecutor` class with constructor: `constructor(ralph: RalphLoop, git: GitBranchIsolator, observer: ObserverDeps)`
- [ ] `ObserverDeps` type: `{ trace: Trace; counter: TokenCounter; costCalc: CostCalculator; breaker: CircuitBreaker; loopDetector: LoopDetector }`
- [ ] `execute(skillId: string, input: SkillInput, config: CliSkillConfig): Promise<SkillResult>` method
- [ ] Before loop: calls `git.isolate(chunkId)` where chunkId is extracted from skillId
- [ ] During loop: uses `config.ralph.onIteration` callback to create observer spans per iteration via `TraceContext.startSpan()`, record token usage via `SpanLifecycle.recordTokenUsage()`, check budget via `breaker.check()`
- [ ] After loop: calls `git.merge(chunkId)` and returns `SkillResult { output, tokensUsed }`
- [ ] If budget exceeded: stops loop early, returns partial result
- [ ] All tests pass

## Verification Command

```bash
cd franken-orchestrator && npx vitest run tests/unit/skills/cli-skill-executor.test.ts
```

## Hardening Requirements

- Mock RalphLoop and GitBranchIsolator in tests — use plain objects with `vi.fn()` methods
- Mock observer deps (TraceContext, SpanLifecycle, etc.) — use the patterns from `franken-observer` tests
- Do NOT import `@frankenbeast/observer` directly — accept observer dependencies via constructor injection (ObserverDeps type)
- `execute()` must catch and wrap errors from both RalphLoop and GitBranchIsolator
- Budget check happens BEFORE each iteration, not after (learned from build-runner bug)
- Token estimation: delegate to RalphLoop result (already computed in chunk 02)
- The `chunkId` for git isolation should come from the skillId (e.g., skillId `'cli:01_types'` → chunkId `'01_types'`)
- If `git.merge()` fails (merge conflict), still return `SkillResult` with the output but mark as incomplete
- This class is the productized version of `plan-2026-03-05/build-runner.ts` — it must support the same observer features: TraceContext spans per iteration, TokenCounter + CostCalculator per chunk, CircuitBreaker for budget, LoopDetector for stuck loops, and per-chunk cost snapshots (diff pre/post tokens)
- Accept `planDir` and `baseBranch` as config — chunk branches derive as `feat/{chunkId}` from the base branch (matching the build-runner.ts pattern)
