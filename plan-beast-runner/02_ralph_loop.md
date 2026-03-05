# Chunk 02: RalphLoop Core + Tests

## Objective

Implement the RalphLoop class — the core loop that spawns a CLI tool (claude/codex), feeds it a prompt, and repeats until a `<promise>TAG</promise>` is detected in stdout or max iterations is reached. TDD: write tests first.

## Files

- Create: `franken-orchestrator/tests/unit/skills/ralph-loop.test.ts`
- Create: `franken-orchestrator/src/skills/ralph-loop.ts`
- Read (context): `franken-orchestrator/src/skills/cli-types.ts` (from chunk 01)
- Read (context): `plan-2026-03-05/build-runner.ts` lines 228-563 (existing spawn + promise logic to extract from)

## Context (read these first)

- `franken-orchestrator/src/skills/cli-types.ts` — RalphLoopConfig, RalphLoopResult types
- `franken-orchestrator/tests/unit/skills/llm-skill-handler.test.ts` — test pattern to follow
- `plan-2026-03-05/build-runner.ts` — reference implementation (spawnClaude at line 228, spawnCodex at line 345, promise detection at line 551)

## Success Criteria

- [ ] Test file exists with at least 6 test cases covering: successful promise detection, max iterations exhaustion, timeout handling, provider switching (claude/codex), non-zero exit code handling, promise-without-changes rejection
- [ ] Tests are written FIRST and fail before implementation
- [ ] `RalphLoop` class with constructor taking no args
- [ ] `RalphLoop.run(config: RalphLoopConfig)` returns `Promise<RalphLoopResult>`
- [ ] Internally spawns `claude --print --dangerously-skip-permissions --output-format stream-json --verbose <prompt> --max-turns <N>` for claude provider
- [ ] Internally spawns `codex exec --full-auto --json --color never <prompt>` for codex provider
- [ ] Strips `CLAUDECODE` env var before spawning claude (prevents nested-session detection)
- [ ] Detects `<promise>TAG</promise>` in stdout via regex
- [ ] Returns `completed: true` when promise detected, `completed: false` when max iterations hit
- [ ] Estimates tokens: `stdout.length / 4` for claude, `stdout.length / 16` for codex
- [ ] Rate limit detection: pattern matching on stderr/stdout for 429, "rate limit", "too many requests", etc. (port from build-runner.ts line 166-171)
- [ ] Rate-limited iterations don't count against maxIterations (decrement counter)
- [ ] Provider fallback: on rate limit, switch to alternate provider if available (callback `onRateLimit?: (provider: string) => string | undefined` on config)
- [ ] All tests pass

## Verification Command

```bash
cd franken-orchestrator && npx vitest run tests/unit/skills/ralph-loop.test.ts
```

## Hardening Requirements

- Mock `child_process.spawn` in tests — do NOT actually spawn Claude or Codex
- Use `vi.mock('node:child_process')` for spawn mocking
- The `run()` method must accept a `workingDir` via config for `cwd` option to spawn
- Timeout: kill child with SIGTERM, then SIGKILL after 5 seconds if still alive
- stdin must be `'ignore'` (no interactive input)
- Do NOT import from `@frankenbeast/observer` — RalphLoop is pure execution, observer is wired by CliSkillExecutor (chunk 04)
- Do NOT handle git operations — that's GitBranchIsolator (chunk 03)
- Each iteration is independent — no state carried between iterations except the iteration counter
- Emit events or return intermediate results so the caller can trace per-iteration spans (use a callback `onIteration?: (iteration: number, result: IterationResult) => void` on the config)
