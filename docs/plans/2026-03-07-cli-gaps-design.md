# Design Doc: Close All Frankenbeast CLI Gaps

**Date**: 2026-03-07
**Branch**: `feat/cli-gaps-marathon`
**Base**: `main` (after `feat/llm-commit-pr-messages` merges)
**Plan Dir**: `plan-2026-03-07-cli-gaps/`

## Problem

The frankenbeast CLI (`franken-orchestrator`) has 5 gaps compared to the old `plan-approach-c/` build runner scripts. Most critically, the `interview` and `plan` subcommands crash at runtime because `session.ts` casts `CliSkillExecutor as never` into `AdapterLlmClient`, which expects a completely different interface. Additionally, all observer functionality is stubbed (0 tokens, 0 cost, budget never enforced), CLI output is hard to read, config file loading is dead code, and the trace viewer was removed.

Full gap analysis: `docs/cli-gap-analysis.md`

## Goals

1. Make `frankenbeast --design-doc <path>` work end-to-end (interview, plan, execute, PR)
2. Real token counting, cost tracking, and budget enforcement
3. Clean, service-attributed CLI output
4. Config file loading from `--config` flag
5. Trace viewer on `:4040` with `--verbose`
6. All docs factually up to date

## Non-Goals

- LLM commit messages (already on `feat/llm-commit-pr-messages`)
- Wiring real franken-* module implementations (firewall, brain, etc.) — stubs stay for those
- New CLI subcommands or flags beyond what exists

## Execution Strategy

One `plan-2026-03-07-cli-gaps/` directory with 12 chunks. Build runner uses **feature-level branching** — chunks are grouped into 6 features, each gets its own branch off main, merged back as a reviewable unit.

```
main
  -> feat/cli-llm-adapter       (chunks 01-03, merge -> main)
  -> feat/cli-observer           (chunks 04-06, merge -> main)
  -> feat/cli-output-polish      (chunks 07-08, merge -> main)
  -> feat/cli-config-loading     (chunk 09, merge -> main)
  -> feat/cli-trace-viewer       (chunk 10, merge -> main)
  -> feat/cli-e2e-proof          (chunks 11-12, merge -> main)
```

Within each feature, each chunk gets a `feat/<chunk-id>` sub-branch that merges back to the feature branch.

---

## Feature 1: CLI LLM Adapter (GAP-1)

### Problem

`session.ts:71,124` creates `new AdapterLlmClient(deps.cliExecutor as never)`. `AdapterLlmClient` expects `IAdapter` with `transformRequest`/`execute`/`transformResponse`/`validateCapabilities`. `CliSkillExecutor` has none of these. Runtime crash: `this.adapter.transformRequest is not a function`.

### Solution

New `CliLlmAdapter` class that implements `IAdapter` by spawning `claude --print` (or codex) for single-shot LLM completions.

### API

```typescript
// franken-orchestrator/src/adapters/cli-llm-adapter.ts

export interface CliLlmAdapterConfig {
  provider: 'claude' | 'codex';
  claudeCmd: string;   // default: 'claude'
  codexCmd: string;    // default: 'codex'
  workingDir?: string;
  timeoutMs?: number;  // default: 120_000
}

export class CliLlmAdapter implements IAdapter {
  constructor(config: CliLlmAdapterConfig) {}

  transformRequest(request: UnifiedRequest): CliLlmRequest {
    // Extract last user message as prompt
    // Return { prompt, maxTurns: 1 }
  }

  async execute(request: CliLlmRequest): Promise<string> {
    // Spawn provider CLI with --print --max-turns 1
    // Clear CLAUDE* env vars (freeze bug fix)
    // Add --plugin-dir /dev/null --no-session-persistence
    // Capture stdout, return raw output
  }

  transformResponse(raw: string, requestId: string): UnifiedResponse {
    // Parse stream-json output, extract text content
    // Return { content: extractedText }
  }

  validateCapabilities(feature: string): boolean {
    return feature === 'text-completion';
  }
}
```

### Wiring

```typescript
// dep-factory.ts — add to createCliDeps()
const cliLlmAdapter = new CliLlmAdapter({
  provider: options.provider,
  claudeCmd: 'claude',
  codexCmd: 'codex',
  workingDir: paths.root,
});

// session.ts — replace broken cast
const adapterLlm = new AdapterLlmClient(cliLlmAdapter);
```

### Files

| Action | File |
|--------|------|
| Create | `franken-orchestrator/src/adapters/cli-llm-adapter.ts` |
| Create | `franken-orchestrator/test/adapters/cli-llm-adapter.test.ts` |
| Edit | `franken-orchestrator/src/cli/dep-factory.ts` |
| Edit | `franken-orchestrator/src/cli/session.ts` |

---

## Feature 2: Observer Integration (GAP-2)

### Problem

`dep-factory.ts` creates stub observer: tokens always 0, cost always 0, circuit breaker never trips, loop detector not wired. Budget is unenforced.

### Solution

`CliObserverBridge` class that wraps real `@frankenbeast/observer` classes behind the two interfaces the orchestrator needs:

1. `IObserverModule` — for `BeastLoopDeps.observer`
2. `ObserverDeps` — for `CliSkillExecutor` constructor

### API

```typescript
// franken-orchestrator/src/adapters/cli-observer-bridge.ts

export class CliObserverBridge implements IObserverModule {
  readonly observerDeps: ObserverDeps;

  constructor(config: { budgetLimitUsd: number }) {
    // Internally creates:
    // - TokenCounter (no args)
    // - CostCalculator(DEFAULT_PRICING)
    // - CircuitBreaker({ limitUsd: config.budgetLimitUsd })
    // - LoopDetector()
    // - TraceContext for session
  }

  // IObserverModule interface
  startTrace(sessionId: string): void {}
  startSpan(name: string): SpanHandle {}
  async getTokenSpend(sessionId: string): Promise<TokenSpendData> {
    // Delegates to counter.grandTotal() + costCalc
  }
}
```

### Wiring

```typescript
// dep-factory.ts
import { CliObserverBridge } from '../adapters/cli-observer-bridge.js';

const observerBridge = new CliObserverBridge({ budgetLimitUsd: budget });
const observer = observerBridge;                    // IObserverModule
const observerDeps = observerBridge.observerDeps;   // ObserverDeps

const cliExecutor = new CliSkillExecutor(ralph, gitIso, observerDeps);
```

### Budget Enforcement Flow

```
RalphLoop iteration completes
  -> CliSkillExecutor.onIteration callback
    -> observerDeps.recordTokenUsage(span, usage, counter)
    -> costCalc.totalCost(counter entries) -> spendUsd
    -> breaker.check(spendUsd)
      -> if tripped: abort execution, log warning
```

### Files

| Action | File |
|--------|------|
| Create | `franken-orchestrator/src/adapters/cli-observer-bridge.ts` |
| Create | `franken-orchestrator/test/adapters/cli-observer-bridge.test.ts` |
| Edit | `franken-orchestrator/src/cli/dep-factory.ts` |
| Edit | `franken-orchestrator/package.json` (add `@frankenbeast/observer` dep) |

---

## Feature 3: CLI Output Polish

### Problem

1. Log lines have no source attribution — can't tell if output is from ralph, git, observer, or planner
2. RalphLoop's `stream-json` output can produce garbled JSON in terminal
3. Iteration progress is hard to follow

### Solution

#### Service Labels (chunk 07)

Add `source` parameter to `BeastLogger` methods. Each log line gets a colored badge:

```
[ralph]    Starting iteration 3/30 for chunk 04_observer-bridge...
[git]      Created branch feat/04_observer-bridge
[observer] Token spend: $1.23 / $10.00 (12%)
[planner]  Decomposed design into 6 chunks
```

Badge colors: ralph=cyan, git=yellow, observer=magenta, planner=blue, session=green, budget=red.

#### Clean JSON Output (chunk 08)

- Buffer partial JSON frames in RalphLoop before emitting to stdout
- Only display extracted text content, not raw `stream-json` frames
- Show clean iteration progress: spinner + chunk name + iteration count + duration
- Display token estimate per iteration in compact format

### Files

| Action | File |
|--------|------|
| Edit | `franken-orchestrator/src/logging/beast-logger.ts` |
| Create | `franken-orchestrator/test/logging/beast-logger.test.ts` |
| Edit | `franken-orchestrator/src/skills/ralph-loop.ts` |
| Edit | `franken-orchestrator/src/skills/cli-skill-executor.ts` |

---

## Feature 4: Config File Loading (GAP-5)

### Problem

`--config` flag is parsed in `args.ts`. `config-loader.ts` is fully implemented with `loadConfig(args)` that merges file > env > CLI. But `run.ts` never calls it.

### Solution

Call `loadConfig(args)` in `run.ts`, pass the merged config into `SessionConfig`. Map config fields to session options:

```typescript
// run.ts
const config = await loadConfig(args);

const session = new Session({
  ...existingFields,
  maxCritiqueIterations: config.maxCritiqueIterations,
  maxDurationMs: config.maxDurationMs,
  enableTracing: config.enableTracing,
  // etc.
});
```

### Files

| Action | File |
|--------|------|
| Edit | `franken-orchestrator/src/cli/run.ts` |
| Edit | `franken-orchestrator/src/cli/session.ts` (add config fields to SessionConfig) |
| Create | `franken-orchestrator/test/cli/config-loader.test.ts` |

---

## Feature 5: Trace Viewer (GAP-3)

### Problem

Old runner had `SQLiteAdapter` + `TraceServer` on `:4040` with `--verbose`. Removed in new CLI.

### Solution

When `--verbose` is set, instantiate `SQLiteAdapter(paths.tracesDb)` and `TraceServer({ adapter, port: 4040 })`. Start on session init, stop in `finalize()`.

```typescript
// dep-factory.ts (when verbose)
import { SQLiteAdapter, TraceServer } from '@frankenbeast/observer';

const sqliteAdapter = new SQLiteAdapter(paths.tracesDb);
const traceServer = new TraceServer({ adapter: sqliteAdapter, port: 4040 });
await traceServer.start();
logger.info('Trace viewer: http://localhost:4040', 'observer');

// finalize:
await traceServer.stop();
sqliteAdapter.close();
```

### Files

| Action | File |
|--------|------|
| Edit | `franken-orchestrator/src/cli/dep-factory.ts` |
| Edit | `franken-orchestrator/src/cli/session.ts` (lifecycle management) |
| Create | `franken-orchestrator/test/cli/trace-viewer.test.ts` |

---

## Feature 6: E2E Proof + Doc Update

### E2E Proof (chunk 11)

Create a minimal test design doc, run `frankenbeast --design-doc <path> --no-pr --budget 2` against it. Verify:
- Plan phase decomposes into chunks (no crash)
- Execution phase runs at least one chunk via RalphLoop
- Budget tracking shows non-zero values in summary
- Service labels appear in output
- If new gaps are discovered, document them in a `DISCOVERED_GAPS.md` for follow-up

### Doc Update (chunk 12)

Update these files to reflect the new state:

| File | Changes |
|------|---------|
| `docs/RAMP_UP.md` | Remove stale known limitations, add CLI LLM adapter, observer integration, config loading, trace viewer. Keep under 5000 tokens. |
| `docs/ARCHITECTURE.md` | Add CliLlmAdapter and CliObserverBridge to orchestrator diagram. Update CLI section. |
| `docs/PROGRESS.md` | Add entries for CLI gap closure PRs. |
| `docs/cli-gap-analysis.md` | Mark all gaps as closed with PR references. |

---

## Dependency Graph

```
Feature 1 (LLM Adapter)
  |
  v
Feature 2 (Observer) ──> Feature 5 (Trace Viewer)
  |
  v
Feature 3 (Output Polish)
  |
Feature 4 (Config Loading) ── independent
  |
  v
Feature 6 (E2E Proof + Docs) ── depends on all above
```

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| `claude --print` spawn fails in CI/headless | Tests mock `child_process.spawn`; E2E chunk is manual verification |
| `@frankenbeast/observer` API mismatch | Explorer agent verified exact constructors and method signatures |
| `better-sqlite3` native module issues | `SQLiteAdapter` only instantiated with `--verbose`; graceful fallback if import fails |
| Stream-json garbled output persists | Chunk 08 buffers frames; worst case falls back to line-by-line text extraction |
| Feature branch merge conflicts | Linear dependency order prevents parallel edits to same files |

## Success Criteria

1. `frankenbeast --design-doc <path>` runs without crash
2. Budget bar shows real USD spend in summary
3. Every log line has a colored `[service]` badge
4. No garbled JSON in terminal output
5. `--config config.json` applies settings
6. `--verbose` starts trace viewer on `:4040`
7. All docs are factually current
