# Live CLI Benchmark Pipeline Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. If subagents are unavailable, use executing-plans and commit each chunk before starting the next.

**Goal:** Build a recurring real-client benchmark runner that compares Codex CLI and Gemini CLI behavior in baseline mode versus Frankenbeast-enabled mode across a stable, versioned task corpus.

**Architecture:** Add a dedicated workspace package, `@franken/live-bench`, above `@franken/mcp-suite`; the suite remains the system under test and does not own benchmark orchestration. The package defines versioned corpus files, isolated workspace provisioning, client adapters for real Codex/Gemini processes, deterministic-first scoring, append-only SQLite history, run evidence directories, reports, and gate decisions.

**Tech Stack:** TypeScript, Node `child_process`/`fs`/`path`, `better-sqlite3`, Vitest, existing `@franken/observer` deterministic evals, real Codex CLI and Gemini CLI binaries.

---

## Chunking Strategy

Implement this in independently reviewable chunks:

1. Package skeleton and typed domain model.
2. Corpus loader + fixture/workspace provisioning.
3. Client adapter contracts and dry-run/fake adapters.
4. Real Codex/Gemini adapter launch paths and fbeast/baseline config isolation.
5. Deterministic scoring + normalized SQLite warehouse.
6. Matrix runner + evidence collection.
7. Reporting + regression gate command.
8. Docs, sample corpus, and scheduled-run handoff.

Each chunk must have tests, typecheck, and its own commit. Do not add broad real-client e2e tests to default CI; mark them opt-in with an environment flag because they require local CLIs and model credentials.

---

## Task 1: Create `@franken/live-bench` Package Skeleton

**Objective:** Add the benchmark package without changing product runtime packages.

**Files:**
- Create: `packages/live-bench/package.json`
- Create: `packages/live-bench/tsconfig.json`
- Create: `packages/live-bench/src/index.ts`
- Create: `packages/live-bench/src/types.ts`
- Create: `packages/live-bench/tests/types.test.ts`

**Step 1: Write the package metadata**

Create `packages/live-bench/package.json`:

```json
{
  "name": "@franken/live-bench",
  "version": "0.1.0",
  "description": "Live Codex/Gemini CLI benchmark runner for Frankenbeast MCP suite A/B comparisons",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "fbeast-live-bench": "./dist/cli/main.js"
  },
  "files": ["dist", "corpus"],
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:live": "FBEAST_LIVE_BENCH_E2E=1 vitest run tests/live"
  },
  "dependencies": {
    "@franken/observer": "*",
    "better-sqlite3": "^12.6.2",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^25.3.0",
    "typescript": "^5.9.3",
    "vitest": "^4.0.18"
  }
}
```

Create `packages/live-bench/tsconfig.json` matching the repo's ESM package style:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules", "tests"]
}
```

**Step 2: Write core type definitions**

Create `packages/live-bench/src/types.ts`:

```ts
export type BenchClient = 'codex-cli' | 'gemini-cli';
export type BenchMode = 'baseline' | 'fbeast';
export type FbeastTopology = 'none' | 'proxy' | 'split';
export type CorpusTier = 'core' | 'candidate' | 'stress';
export type TaskClass = 'tool-critical' | 'workflow-critical' | 'artifact-critical';

export interface BenchmarkTask {
  readonly taskId: string;
  readonly tier: CorpusTier;
  readonly taskClass: TaskClass;
  readonly projectFixture: string;
  readonly prompt: string;
  readonly expectedArtifacts: readonly string[];
  readonly requiredChecks: readonly BenchmarkCheck[];
  readonly timeoutMs: number;
  readonly allowedNondeterminism: readonly string[];
  readonly baselineSupported: boolean;
  readonly notes?: string;
}

export type BenchmarkCheck =
  | { readonly type: 'file-exists'; readonly path: string }
  | { readonly type: 'file-contains'; readonly path: string; readonly text: string }
  | { readonly type: 'exit-code'; readonly code: number }
  | { readonly type: 'tool-call'; readonly tool: string; readonly requiredParams: readonly string[] };

export interface BenchmarkMatrixRow {
  readonly runId: string;
  readonly taskId: string;
  readonly client: BenchClient;
  readonly mode: BenchMode;
  readonly fbeastTopology: FbeastTopology;
  readonly model: string;
  readonly clientVersion: string;
  readonly commitSha: string;
  readonly hostClass: string;
  readonly runTimestamp: string;
}

export interface ClientRunResult {
  readonly row: BenchmarkMatrixRow;
  readonly workspaceDir: string;
  readonly evidenceDir: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly wallClockMs: number;
  readonly artifacts: readonly string[];
}
```

Create `packages/live-bench/src/index.ts`:

```ts
export type {
  BenchClient,
  BenchMode,
  FbeastTopology,
  CorpusTier,
  TaskClass,
  BenchmarkTask,
  BenchmarkCheck,
  BenchmarkMatrixRow,
  ClientRunResult,
} from './types.js';
```

**Step 3: Write a compile smoke test**

Create `packages/live-bench/tests/types.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { BenchmarkTask } from '../src/types.js';

describe('live-bench types', () => {
  it('represents a core artifact-critical task', () => {
    const task: BenchmarkTask = {
      taskId: 'write-readme',
      tier: 'core',
      taskClass: 'artifact-critical',
      projectFixture: 'tiny-node',
      prompt: 'Create README.md with project summary.',
      expectedArtifacts: ['README.md'],
      requiredChecks: [{ type: 'file-exists', path: 'README.md' }],
      timeoutMs: 120_000,
      allowedNondeterminism: [],
      baselineSupported: true,
    };

    expect(task.taskId).toBe('write-readme');
  });
});
```

**Step 4: Verify**

Run:

```bash
cd packages/live-bench
npm test -- --run tests/types.test.ts
npm run typecheck
```

Expected: tests and typecheck exit `0`.

**Step 5: Commit**

```bash
git add packages/live-bench
git commit -m "feat(live-bench): add benchmark package skeleton"
```

---

## Task 2: Corpus Loader And Validation

**Objective:** Define a versioned corpus format with validation and fairness guards.

**Files:**
- Create: `packages/live-bench/src/corpus/schema.ts`
- Create: `packages/live-bench/src/corpus/loader.ts`
- Create: `packages/live-bench/corpus/core/write-readme.task.json`
- Create: `packages/live-bench/tests/corpus-loader.test.ts`

**Step 1: Write failing loader tests**

`tests/corpus-loader.test.ts` should assert:

- valid JSON loads as `BenchmarkTask`
- invalid tier/check type throws a helpful error
- `tier: "core"` with `baselineSupported: false` throws because core A/B gates must be fair

**Step 2: Implement Zod schema**

`src/corpus/schema.ts` should use `zod` and export `BenchmarkTaskSchema`. Use `.strict()` objects. Add a refinement:

```ts
.refine((task) => task.tier !== 'core' || task.baselineSupported, {
  message: 'core tasks must be baselineSupported for fair A/B gating',
})
```

**Step 3: Implement loader**

`src/corpus/loader.ts`:

- `loadTaskFile(path: string): BenchmarkTask`
- `loadCorpus(root: string, tiers?: CorpusTier[]): BenchmarkTask[]`
- recursively read `*.task.json`, parse, validate, sort by `taskId`

Use `fs`/`path` only; avoid a glob dependency.

**Step 4: Add sample task**

`corpus/core/write-readme.task.json` should use the task contract from the design and include deterministic artifact checks only.

**Step 5: Verify**

```bash
cd packages/live-bench
npm test -- --run tests/corpus-loader.test.ts
npm run typecheck
```

Expected: pass.

**Step 6: Commit**

```bash
git add packages/live-bench/src/corpus packages/live-bench/corpus packages/live-bench/tests/corpus-loader.test.ts
git commit -m "feat(live-bench): load validated benchmark corpus"
```

---

## Task 3: Fixture Workspace Provisioning

**Objective:** Create fresh isolated workspaces from versioned fixtures for every run.

**Files:**
- Create: `packages/live-bench/src/workspace/fixture-store.ts`
- Create: `packages/live-bench/src/workspace/workspace-provisioner.ts`
- Create: `packages/live-bench/fixtures/tiny-node/package.json`
- Create: `packages/live-bench/fixtures/tiny-node/src/index.js`
- Create: `packages/live-bench/tests/workspace-provisioner.test.ts`

**Step 1: Write failing tests**

Test that provisioning:

- copies a fixture into a unique run workspace
- refuses fixture names containing `..` or path separators
- removes any pre-existing `.fbeast` directory for baseline runs
- writes `environment.json` with fixture name, commit sha, client, mode, topology, and timestamps

**Step 2: Implement path containment**

`FixtureStore.resolveFixture(name)` must resolve under `fixturesRoot` and throw if the resolved path escapes.

**Step 3: Implement workspace provisioner**

`WorkspaceProvisioner.provision(row, task)` should create:

```text
benchmarks/runs/YYYY-MM-DD/<runId>/workspace/
benchmarks/runs/YYYY-MM-DD/<runId>/evidence/
benchmarks/runs/YYYY-MM-DD/<runId>/environment.json
```

Copy fixture contents with `fs.cpSync(..., { recursive: true })`.

**Step 4: Verify**

```bash
cd packages/live-bench
npm test -- --run tests/workspace-provisioner.test.ts
npm run typecheck
```

Expected: pass.

**Step 5: Commit**

```bash
git add packages/live-bench/src/workspace packages/live-bench/fixtures packages/live-bench/tests/workspace-provisioner.test.ts
git commit -m "feat(live-bench): provision isolated benchmark workspaces"
```

---

## Task 4: Client Adapter Contract And Fake Adapter Harness

**Objective:** Define the runner/client boundary before launching real CLIs.

**Files:**
- Create: `packages/live-bench/src/clients/types.ts`
- Create: `packages/live-bench/src/clients/fake-client-adapter.ts`
- Create: `packages/live-bench/src/clients/process-runner.ts`
- Create: `packages/live-bench/tests/client-adapter.test.ts`

**Step 1: Write failing tests**

Tests should assert:

- fake adapter returns a `ClientRunResult` and writes stdout/stderr files to evidence
- process runner returns `timedOut: true` and kills a process after timeout
- process runner captures stdout/stderr/exit code for a short Node command

**Step 2: Implement interfaces**

```ts
export interface ClientAdapter {
  readonly client: BenchClient;
  version(): Promise<string>;
  run(input: ClientRunInput): Promise<ClientRunResult>;
}

export interface ClientRunInput {
  readonly row: BenchmarkMatrixRow;
  readonly task: BenchmarkTask;
  readonly workspaceDir: string;
  readonly evidenceDir: string;
  readonly timeoutMs: number;
}
```

**Step 3: Implement process runner**

Use `spawn` with:

- explicit `cwd`
- explicit `env`
- stdout/stderr collection with max bytes guard
- timeout kill with SIGTERM then SIGKILL fallback

Do not pass host env wholesale; the adapter must opt in to variables.

**Step 4: Verify**

```bash
cd packages/live-bench
npm test -- --run tests/client-adapter.test.ts
npm run typecheck
```

Expected: pass.

**Step 5: Commit**

```bash
git add packages/live-bench/src/clients packages/live-bench/tests/client-adapter.test.ts
git commit -m "feat(live-bench): define client adapter harness"
```

---

## Task 5: Baseline/Fbeast Client Configuration Isolation

**Objective:** Generate separate client config roots for baseline and fbeast runs without contaminating workspaces.

**Files:**
- Create: `packages/live-bench/src/config/client-config.ts`
- Create: `packages/live-bench/src/config/fbeast-install.ts`
- Create: `packages/live-bench/tests/client-config.test.ts`

**Step 1: Write failing tests**

Tests should assert:

- baseline config contains no fbeast MCP registration or hooks
- fbeast `proxy` config includes `fbeast-proxy` / `@franken/mcp-suite` registration metadata
- fbeast `split` config includes separate MCP server entries
- generated config roots are under the run evidence directory

**Step 2: Implement config writers**

Define config plans as JSON/text files under `evidenceDir/client-config/<client>/<mode>/`. Keep client-specific details behind functions:

- `writeCodexConfig(input)`
- `writeGeminiConfig(input)`

If exact CLI config paths are uncertain, implement the file plan and leave one tracked `live-client-smoke` follow-up comment for the later live smoke task; tests should verify the plan shape rather than pretending to know unverified CLI internals.

**Step 3: Implement fbeast install plan**

`fbeast-install.ts` should expose a dry-run-friendly plan:

- npm package spec (`@franken/mcp-suite` or local workspace dist)
- topology (`proxy` or `split`)
- environment variables required
- generated config files

Do not run npm install in unit tests.

**Step 4: Verify**

```bash
cd packages/live-bench
npm test -- --run tests/client-config.test.ts
npm run typecheck
```

Expected: pass.

**Step 5: Commit**

```bash
git add packages/live-bench/src/config packages/live-bench/tests/client-config.test.ts
git commit -m "feat(live-bench): isolate baseline and fbeast client configs"
```

---

## Task 6: Real Codex And Gemini CLI Adapters

**Objective:** Launch real Codex/Gemini CLIs in scripted mode, but keep live tests opt-in.

**Files:**
- Create: `packages/live-bench/src/clients/codex-cli-adapter.ts`
- Create: `packages/live-bench/src/clients/gemini-cli-adapter.ts`
- Create: `packages/live-bench/tests/clients-real-command-shape.test.ts`
- Create: `packages/live-bench/tests/live/codex-cli.live.test.ts`
- Create: `packages/live-bench/tests/live/gemini-cli.live.test.ts`

**Step 1: Write command-shape tests**

Without invoking real CLIs, assert command construction for:

- binary override path
- model argument
- prompt passing strategy
- config root environment
- timeout propagation

**Step 2: Implement adapters**

Each adapter should:

- expose `version()` by running `<binary> --version`
- use `ProcessRunner` for execution
- write prompt to a run-local prompt file when supported, otherwise pass via stdin
- write raw stdout/stderr/transcript files to evidence
- never inherit host env except allowlisted variables needed by the client

**Step 3: Add live tests guarded by env**

`tests/live/*.live.test.ts` should skip unless `FBEAST_LIVE_BENCH_E2E=1` and the required binary exists. Live tests should run a tiny fixture with a short timeout and assert evidence files exist, not exact model output.

**Step 4: Verify default suite**

```bash
cd packages/live-bench
npm test -- --run tests/clients-real-command-shape.test.ts
npm run typecheck
```

Expected: pass without Codex/Gemini installed.

**Step 5: Optional live smoke**

```bash
cd packages/live-bench
FBEAST_LIVE_BENCH_E2E=1 npm run test:live
```

Expected: pass only on machines with configured Codex/Gemini CLIs; otherwise skipped or documented failure.

**Step 6: Commit**

```bash
git add packages/live-bench/src/clients packages/live-bench/tests/clients-real-command-shape.test.ts packages/live-bench/tests/live
git commit -m "feat(live-bench): add real CLI client adapters"
```

---

## Task 7: Deterministic Scoring Pipeline

**Objective:** Score run outputs with deterministic checks before any judge-based logic.

**Files:**
- Create: `packages/live-bench/src/scoring/check-runner.ts`
- Create: `packages/live-bench/src/scoring/scoring-model.ts`
- Create: `packages/live-bench/tests/scoring.test.ts`

**Step 1: Write failing tests**

Tests should cover:

- `file-exists` pass/fail
- `file-contains` pass/fail
- `exit-code` pass/fail
- aggregate `taskPass = true` only when every required check passes
- optional tool-call check delegates to `ToolCallAccuracyEval` for parsed tool summaries

**Step 2: Implement check runner**

Return structured check results:

```ts
interface CheckResult {
  checkType: string;
  passed: boolean;
  message: string;
  score: number;
}
```

**Step 3: Implement aggregate scoring**

Emit metric groups from the design:

- outcome: `taskPass`, `accuracyScore`, `rubricFailures`, `artifactDiff`
- speed: wall-clock and observable timing fields
- cost: client-reported, fbeast-observed, unattributed flag
- behavior: tool usage score, hallucinated tool calls, policy interventions, timeout/error count

Missing telemetry should be `null` plus an explicit `unattributedCostFlag`, not silently zero.

**Step 4: Verify**

```bash
cd packages/live-bench
npm test -- --run tests/scoring.test.ts
npm run typecheck
```

Expected: pass.

**Step 5: Commit**

```bash
git add packages/live-bench/src/scoring packages/live-bench/tests/scoring.test.ts
git commit -m "feat(live-bench): score runs with deterministic checks"
```

---

## Task 8: Append-only Benchmark Warehouse

**Objective:** Persist normalized benchmark history outside `.fbeast/beast.db`.

**Files:**
- Create: `packages/live-bench/src/storage/schema.sql`
- Create: `packages/live-bench/src/storage/benchmark-store.ts`
- Create: `packages/live-bench/tests/benchmark-store.test.ts`

**Step 1: Write failing tests**

Tests should assert:

- `BenchmarkStore` creates schema under `benchmarks/history/benchmarks.db`
- inserting a run stores row, metric groups, check results, and A/B pairing metadata
- inserting the same `runId` twice fails or is idempotent by explicit policy
- query for latest core runs returns newest first

**Step 2: Implement schema**

Tables:

- `runs(run_id primary key, task_id, client, mode, topology, model, client_version, commit_sha, host_class, run_timestamp, evidence_dir)`
- `outcome_metrics(run_id, task_pass, accuracy_score, rubric_failures_json, artifact_diff_json)`
- `speed_metrics(run_id, wall_clock_ms, time_to_first_tool_ms, time_to_last_output_ms, tool_count, tool_round_trips)`
- `cost_metrics(run_id, client_prompt_tokens, client_completion_tokens, client_cost_usd, fbeast_prompt_tokens, fbeast_completion_tokens, fbeast_cost_usd, unattributed_cost_flag)`
- `behavior_metrics(run_id, expected_tool_usage_score, hallucinated_tool_call_count, golden_trace_score, policy_intervention_count, error_count, timeout)`
- `check_results(run_id, check_type, passed, score, message)`
- `ab_pairs(pair_id, baseline_run_id, fbeast_run_id, task_id, client, model, commit_sha)`

**Step 3: Implement store**

Use transactions for inserting a full run result. Store complex fields as JSON strings with explicit parse helpers.

**Step 4: Verify**

```bash
cd packages/live-bench
npm test -- --run tests/benchmark-store.test.ts
npm run typecheck
```

Expected: pass.

**Step 5: Commit**

```bash
git add packages/live-bench/src/storage packages/live-bench/tests/benchmark-store.test.ts
git commit -m "feat(live-bench): persist benchmark history"
```

---

## Task 9: Matrix Runner And Evidence Collection

**Objective:** Execute the A/B matrix over corpus tasks and persist raw + normalized evidence.

**Files:**
- Create: `packages/live-bench/src/runner/matrix.ts`
- Create: `packages/live-bench/src/runner/evidence.ts`
- Create: `packages/live-bench/src/runner/run-benchmark.ts`
- Create: `packages/live-bench/tests/matrix-runner.test.ts`

**Step 1: Write failing tests**

Using fake adapters, assert:

- one core task expands to four rows: Codex baseline, Codex fbeast, Gemini baseline, Gemini fbeast
- unsupported baseline tasks are excluded from core A/B gates but can run in candidate/stress exploratory mode
- each run writes stdout, stderr, environment manifest, artifacts list, score JSON
- normalized result is inserted into `BenchmarkStore`

**Step 2: Implement matrix expansion**

`expandMatrix(tasks, options)` should accept:

- clients
- modes
- topologies
- model map
- commit sha
- host class
- retry policy

Default required matrix: both clients × baseline/fbeast; baseline always uses topology `none`.

**Step 3: Implement evidence collector**

Copy or summarize:

- client stdout/stderr
- transcript/response log if available
- generated artifacts matching `expectedArtifacts`
- environment manifest
- fbeast `.fbeast` evidence for fbeast runs only

**Step 4: Implement runner**

`runBenchmark(options)` should:

1. load corpus
2. expand matrix
3. provision workspace/evidence dirs
4. write baseline or fbeast config
5. execute adapter
6. collect evidence
7. score
8. persist history
9. return run summary

**Step 5: Verify**

```bash
cd packages/live-bench
npm test -- --run tests/matrix-runner.test.ts
npm run typecheck
```

Expected: pass.

**Step 6: Commit**

```bash
git add packages/live-bench/src/runner packages/live-bench/tests/matrix-runner.test.ts
git commit -m "feat(live-bench): run benchmark matrix"
```

---

## Task 10: CLI Command, Report, And Gate Policy

**Objective:** Provide user-facing commands for runs, reports, and release gates.

**Files:**
- Create: `packages/live-bench/src/cli/main.ts`
- Create: `packages/live-bench/src/report/report.ts`
- Create: `packages/live-bench/src/report/gate.ts`
- Create: `packages/live-bench/tests/report-gate.test.ts`
- Modify: `packages/live-bench/package.json`

**Step 1: Write failing report/gate tests**

Tests should assert:

- report groups by task/client/mode and includes pass rate, latency, cost, and behavior deltas
- gate fails when fbeast core accuracy regresses beyond threshold
- gate fails when fbeast loses to baseline core pass rate beyond threshold
- gate warns, not fails, for latency/cost regressions unless hard ceilings are configured
- gate ignores judge-only metrics for pass/fail

**Step 2: Implement CLI**

Supported commands:

```bash
fbeast-live-bench run --corpus packages/live-bench/corpus --out benchmarks --clients codex-cli,gemini-cli --modes baseline,fbeast --topology proxy
fbeast-live-bench report --db benchmarks/history/benchmarks.db --format markdown
fbeast-live-bench gate --db benchmarks/history/benchmarks.db --tier core --accuracy-regression-threshold 0.05 --baseline-loss-threshold 0.05
```

Use a minimal argument parser if the repo has no CLI parser dependency; do not add a large dependency for this.

**Step 3: Implement report**

Output markdown and JSON. Include:

- per-task A/B table
- per-client summary
- trend versus previous run set
- regression/improvement flags
- links/paths to evidence dirs

**Step 4: Implement gate**

Exit codes:

- `0`: pass
- `1`: fail threshold exceeded
- `2`: invalid config/no comparable core data

**Step 5: Verify**

```bash
cd packages/live-bench
npm test -- --run tests/report-gate.test.ts
npm run typecheck
```

Expected: pass.

**Step 6: Commit**

```bash
git add packages/live-bench/src/cli packages/live-bench/src/report packages/live-bench/tests/report-gate.test.ts packages/live-bench/package.json
git commit -m "feat(live-bench): add report and gate CLI"
```

---

## Task 11: Documentation And Recurring-Run Handoff

**Objective:** Document operation, live prerequisites, and how to schedule the benchmark without hardcoding secrets into repo scripts.

**Files:**
- Create: `docs/guides/live-cli-benchmark.md`
- Create: `packages/live-bench/README.md`
- Modify: `tasks/complete-remaining-gates-progress.md`

**Step 1: Write docs**

Document:

- product boundary: benchmark runner above `@franken/mcp-suite`
- required CLIs: Codex CLI, Gemini CLI
- baseline/fbeast fairness rules
- corpus tiers and task contract
- environment variables / credential expectations
- default non-live tests versus opt-in `FBEAST_LIVE_BENCH_E2E=1` tests
- storage layout: `benchmarks/runs/...` and `benchmarks/history/benchmarks.db`
- report/gate commands
- scheduling recommendation: external cron/Hermes job should call CLI command and archive generated report; do not embed scheduler-specific code in the package

**Step 2: Update progress doc**

Mark the Live CLI Benchmark plan chunk complete only after the implementation plan or implementation docs are committed. If implementation continues immediately, create a new progress doc `tasks/live-cli-benchmark-progress.md` before coding.

**Step 3: Verify docs and package**

```bash
cd packages/live-bench
npm test
npm run typecheck
```

Expected: default package tests pass without live CLIs.

**Step 4: Commit**

```bash
git add docs/guides/live-cli-benchmark.md packages/live-bench/README.md tasks/complete-remaining-gates-progress.md
git commit -m "docs(live-bench): document live CLI benchmark operations"
```

---

## Acceptance Criteria

- The benchmark runner is a dedicated package above `@franken/mcp-suite`, not benchmark logic embedded in the suite.
- The core corpus is versioned and validates fairness with `baselineSupported`.
- Baseline runs have no fbeast MCP registration/hooks/runtime setup.
- Fbeast runs explicitly choose `proxy` or `split` topology.
- Real Codex CLI and Gemini CLI adapters exist; live tests are opt-in and skipped by default.
- Raw evidence and normalized SQLite history are both persisted.
- Deterministic scoring drives `taskPass`; judge metrics, if later added, remain advisory.
- Reports show per-task/client A/B deltas, trends, and regression flags.
- Gate command fails release only on deterministic core-corpus thresholds.

## Verification Bundle For Final PR

```bash
cd packages/live-bench
npm test
npm run typecheck
npm run build

# Optional on configured benchmark host only:
FBEAST_LIVE_BENCH_E2E=1 npm run test:live
```

Also run root-level checks before PR if time allows:

```bash
npm run typecheck
npm test
```

## Out Of Scope

- Claude Code benchmarking in this pipeline.
- Provider-only API replay as primary evidence.
- Synthetic microbenchmarks as the benchmark record of truth.
- Full determinism of live models.
- Folding benchmark history into `.fbeast/beast.db`.
- Scheduler-specific implementation inside the benchmark package.
