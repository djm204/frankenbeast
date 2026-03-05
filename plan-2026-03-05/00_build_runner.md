# Chunk 00: Observer-Powered Build Runner

## Objective

Create a TypeScript build runner that replaces the bash `run-build.sh` as the RALPH loop orchestrator. It uses `@frankenbeast/observer` as "context police" — tracking token burn, enforcing budgets, detecting loops, persisting traces to SQLite, and serving a live trace viewer. This chunk runs FIRST (before all others) to set up the build infrastructure.

## Files

- Create: `plan-2026-03-05/build-runner.ts`
- Modify: `plan-2026-03-05/run-build.sh` (thin wrapper that calls the TypeScript runner)

## Context

`@frankenbeast/observer` exports (from `franken-observer/src/index.ts`):
```typescript
// Tracing
TraceContext.createTrace(goal: string): Trace
TraceContext.startSpan(trace: Trace, { name }): Span
TraceContext.endSpan(span: Span, opts?, loopDetector?): void
TraceContext.endTrace(trace: Trace): void
SpanLifecycle.recordTokenUsage(span, { promptTokens, completionTokens, model }, counter?): void
SpanLifecycle.setMetadata(span, data): void

// Cost
TokenCounter — .record(), .grandTotal(), .totalsFor(model), .allModels()
CostCalculator — .calculate(entry), .totalCost(entries)
CircuitBreaker — .check(spendUsd), .on('limit-reached', handler)
DEFAULT_PRICING — pricing table

// Storage
SQLiteAdapter — .flush(trace), .queryByTraceId(id), .close()

// Live viewer
TraceServer — .start(), .stop(), .url

// Safety
LoopDetector — .check(spanName), .on('loop-detected', handler), .reset()
PostMortemGenerator — .generate(trace, signal), .generateContent(trace, signal)
```

### Ralph Loop Mechanism

The core technique: feed the **same prompt** to `claude --print` repeatedly. Each iteration, Claude sees its own previous work in the files and git history (because it committed changes). The loop exits when the completion `<promise>` tag is detected in stdout.

```
┌─────────────────────────────────────────┐
│ Ralph Loop (per stage)                  │
│                                         │
│  while promise not detected:            │
│    1. spawn claude --print <PROMPT>     │
│    2. Claude sees files from last run   │
│    3. Claude works, commits changes     │
│    4. Capture stdout                    │
│    5. Check for <promise>TAG</promise>  │
│    6. Observer records span per iter    │
│    7. If rate limited → sleep & retry   │
│    8. If max iterations → fail chunk    │
│  end                                    │
└─────────────────────────────────────────┘
```

**Implementation loop prompt** (same every iteration):
```
Read <CHUNK_FILE>. Implement ALL features described. Use TDD: write failing tests first, then implement, then commit atomically. Run the verification command. Output <promise>IMPL_<CHUNK_ID>_DONE</promise> when all success criteria are met and verification passes.
```

**Hardening loop prompt** (same every iteration):
```
Review work on branch '<BRANCH>' for chunk '<CHUNK_FILE>'. Read the chunk file first. Check ALL success criteria checkboxes and hardening requirements. Fix any issues found. Add missing tests. Commit fixes. Run the full test suite: cd franken-orchestrator && npx vitest run && npx tsc --noEmit. Output <promise>HARDEN_<CHUNK_ID>_DONE</promise> when everything is stable and all criteria are met.
```

Each iteration is a **fresh Claude context** (new `claude --print` process). Self-reference comes from Claude seeing its own commits in the working tree, not from passing output back as input.

## Success Criteria

- [ ] `build-runner.ts` is a standalone TypeScript script runnable via `npx tsx plan-2026-03-05/build-runner.ts`
- [ ] Accepts CLI flags: `--reset` (clear checkpoint + DB), `--budget <usd>` (default: $10), `--port <n>` (trace viewer port, default: 4040), `--no-viewer` (skip trace server), `--max-iterations <n>` (default: 10 per loop)
- [ ] Creates a root trace: `TraceContext.createTrace('RALPH Build: close-execution-gap')`
- [ ] For each chunk file (sorted): creates a parent span `chunk:<chunk_id>`
- [ ] **Ralph loop for impl**: runs `claude --print` with the SAME prompt repeatedly until `<promise>IMPL_<CHUNK_ID>_DONE</promise>` detected in stdout
- [ ] **Ralph loop for harden**: runs `claude --print` with the SAME prompt repeatedly until `<promise>HARDEN_<CHUNK_ID>_DONE</promise>` detected in stdout
- [ ] Each iteration creates a child span: `impl:<chunk_id>:iter-<N>` or `harden:<chunk_id>:iter-<N>`
- [ ] Promise detection: scan stdout for `<promise>...</promise>` regex after each iteration
- [ ] Max iterations per loop (default: 10) — if promise not found after max iterations, fail the stage
- [ ] Captures Claude's stdout/stderr and estimates token usage from output character count (rough heuristic: ~4 chars per token)
- [ ] `SpanLifecycle.recordTokenUsage()` called after each iteration with estimated tokens
- [ ] `TokenCounter` accumulates across all iterations and chunks — logged after each chunk
- [ ] `CostCalculator` computes running cost — logged after each chunk
- [ ] `CircuitBreaker` checked after each iteration — if budget exceeded, stops build gracefully
- [ ] `LoopDetector` tracks iteration span names — detects if same iteration pattern repeats without progress
- [ ] `SQLiteAdapter` persists trace to `plan-2026-03-05/build-traces.db` after each chunk
- [ ] `TraceServer` serves live viewer at `http://localhost:4040` (unless `--no-viewer`)
- [ ] Checkpoint file (`.checkpoint`) tracks completed chunks — resume on restart
- [ ] Git operations: branch creation, checkout, merge
- [ ] Rate limit detection: parse stderr for `rate limit`, `429`, `Retry-After`, `overloaded` patterns
- [ ] Rate limit auto-resume: sleep until reset time + 3 minutes, then retry (unlimited, doesn't count as iteration)
- [ ] Rate limit spans recorded in trace with `{ resetAfterMs, sleepUntil, chunkId }` metadata
- [ ] Final summary: total tokens, total cost, per-model breakdown, duration, iterations per chunk, pass/fail per chunk, rate limit count
- [ ] `run-build.sh` is NOT modified by this chunk — `run-build.sh` handles bootstrapping chunk 00 and then exec's into the runner
- [ ] TypeScript compiles (standalone, no build step needed — tsx runs directly)

## Verification Command

```bash
npx tsx plan-2026-03-05/build-runner.ts --help
```

## Hardening Requirements

### Ralph Loop Execution
- Core function: `runRalphLoop(prompt: string, promiseTag: string, maxIterations: number): Promise<{ completed: boolean, iterations: number, output: string }>`
- Each iteration:
  1. Spawn `claude --print <prompt> --max-turns 30` using `child_process.spawn()` with `{ stdio: ['ignore', 'pipe', 'pipe'] }`
  2. Stream stdout/stderr to both the log file and the console in real-time
  3. Accumulate stdout into a buffer
  4. When process exits, scan buffer for `<promise>${promiseTag}</promise>` regex
  5. If promise found → loop complete, return success
  6. If promise not found and exit code 0 → Claude finished but didn't complete the task, iterate again (it'll see its own commits)
  7. If exit code non-zero → check for rate limit (see below), otherwise count as failed iteration
  8. Create an observer span for this iteration: `SpanLifecycle.recordTokenUsage()` with estimated tokens
  9. Check `CircuitBreaker` — if budget exceeded, abort
  10. If iteration count >= maxIterations → fail the stage
- Set a per-iteration timeout (configurable, default: 10 minutes)
- Kill child process on timeout with `SIGTERM`, then `SIGKILL` after 5s grace
- Log each iteration: `[beast] impl:chunk_id iter 3/10 — promise not yet detected, iterating...`

### Rate Limit Detection & Auto-Resume
- Monitor Claude's stderr output for rate limit indicators:
  - Look for patterns: `rate limit`, `429`, `Too Many Requests`, `Retry-After`, `retry after`, `overloaded`
  - Also check Claude CLI exit codes that indicate rate limiting
- When a rate limit is detected:
  1. Parse the reset time from the error output:
     - Look for `Retry-After: <seconds>` header value in stderr
     - Look for patterns like `try again in <N> seconds/minutes` or `resets at <timestamp>`
     - If no reset time found, default to 60 seconds
  2. Calculate sleep duration: `resetTime + 3 minutes` (180 seconds buffer)
  3. Log at `warn` level: `[beast:warn] Rate limited. Reset in <N>s. Sleeping until <ISO timestamp> (reset + 3min buffer)...`
  4. Record a `rate-limit` span in the trace with metadata: `{ resetAfterMs, sleepUntil, chunkId }`
  5. Sleep for the calculated duration (use `setTimeout` with a promise wrapper)
  6. Log at `info` level: `[beast] Rate limit cooldown complete. Resuming...`
  7. Retry the failed Claude session (does NOT count against the retry limit)
- Rate limit retries are unlimited — the runner should keep waiting and retrying as long as rate limits persist
- Do NOT count rate-limit retries as failures — they are expected pauses, not errors
- Log a running count of rate limit hits for the build summary

### Token Estimation
- `claude --print` does NOT expose token counts in stdout
- Estimate: count output characters, divide by 4 (rough token approximation)
- Use the model from the chunk's provider config (default: 'claude-sonnet-4-6')
- This is a heuristic — real token tracking happens inside the Beast Loop (ObserverPortAdapter)
- Log a warning that token counts are estimated, not exact

### Budget Enforcement
- Default budget: $10 USD (configurable via `--budget`)
- `CircuitBreaker` fires `limit-reached` event → log warning, flush trace, stop build gracefully
- Do NOT hard-kill running Claude sessions — wait for current session to finish, then stop
- Log cumulative cost after every span

### Checkpoint / Resume
- Same `.checkpoint` file format as run-build.sh: `<chunk_id>:impl_done`, `<chunk_id>:harden_done`, `<chunk_id>:merged`
- On startup: read checkpoint, skip already-merged chunks
- On each stage completion: write checkpoint immediately (crash-safe)

### Git Operations
- Same branch strategy as run-build.sh:
  - Base branch: `feat/close-execution-gap`
  - Per-chunk branch: `feat/<chunk_id>`
  - Merge back to base after hardening
- Use `child_process.execSync()` for git commands (synchronous, simpler)
- Handle merge conflicts: abort merge, log error, continue to next chunk

### Trace Viewer
- Start `TraceServer` before processing chunks
- Flush trace to SQLite after each chunk (not just at the end)
- Print viewer URL at startup: `Trace viewer: http://localhost:4040`
- Stop server on build completion or SIGINT

### Logging
- Use console output with prefixes matching the bash version: `[beast]`, `[beast:debug]`, `[beast:warn]`, `[beast:error]`
- Log to both console and `plan-2026-03-05/build.log`
- Log after each chunk: chunk ID, status, tokens used, cost, duration

### Dependencies
- Import from `@frankenbeast/observer` (already installed as gitlink)
- Use `tsx` for running TypeScript directly (no compile step)
- Verify `tsx` is available: `npx tsx --version` at script start

### Chunk Discovery
- Glob for `plan-2026-03-05/*.md` and sort alphabetically
- **SKIP `00_build_runner.md`** — the runner must NOT process itself (it's bootstrapped by run-build.sh)
- Process chunks 01 through 12 only

### What NOT to Do
- Do NOT import from `franken-orchestrator` — this is a standalone build tool
- Do NOT try to parse Claude's internal context window usage — it's not exposed
- Do NOT block on TraceServer — run it in the background
- Do NOT persist API keys or sensitive data in traces or SQLite
- Do NOT process chunk 00 — that's the runner itself, bootstrapped by run-build.sh
