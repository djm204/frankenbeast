# Fix GitHub Issues with Frankenbeast

## Prerequisites

- `gh` CLI authenticated (`gh auth status`)
- `frankenbeast` available from the current checkout. From the repo root, run:

  ```bash
  npm install
  npm run local:link
  npm run local:verify-cli
  ```

  `local:link` builds the repo and links the workspaces that expose the `fbeast` and `frankenbeast` binaries. If you do not want global links, build the full checkout first and use `--help` as the setup smoke test:

  ```bash
  npm run build
  npm --workspace @franken/orchestrator exec -- frankenbeast issues --help
  ```

  For preview or real issue runs through the workspace fallback, include both `--base-dir` and `--repo`: `--base-dir` points generated branches, plans, and artifacts at the repository whose issues you want to fix, while `--repo` prevents GitHub repo inference from using the Frankenbeast checkout selected by `npm --workspace`. Keep `--dry-run` for triage previews, and remove it when you are ready to execute approved fixes.

  ```bash
  # Preview only
  npm --workspace @franken/orchestrator exec -- frankenbeast issues --base-dir /path/to/target-repo --repo owner/repo --dry-run

  # Execute approved fixes
  npm --workspace @franken/orchestrator exec -- frankenbeast issues --base-dir /path/to/target-repo --repo owner/repo --label critical
  ```

  See [Running the CLI Beast Harness](./run-cli-beast.md) for the full local CLI setup, including the paired `fbeast` MCP flow.
- A GitHub repository with open issues

## How It Works

The `frankenbeast issues` subcommand runs a 4-stage pipeline:

1. **Fetch** — queries GitHub issues via `gh issue list` with your filters
2. **Triage** — LLM classifies each issue as `one-shot` (simple) or `chunked` (multi-file)
3. **Review** — displays a severity-sorted table for human approval (or `--dry-run` to preview only)
4. **Execute** — for each approved issue: builds a PlanGraph, runs implementation + hardening tasks via MartinLoop, creates a PR

Each issue gets its own git branch (`issue-{number}`) and PR with `Fixes #{number}` in the body.

## Examples

### Fix all critical issues

```bash
frankenbeast issues --label critical
```

Fetches all issues labelled `critical`, triages them, presents a review table, and (on approval) fixes each one with a dedicated PR.

### Use GitHub search syntax

```bash
frankenbeast issues --search "label:bug label:high"
```

Passes the query directly to `gh issue list --search`. Supports any [GitHub search qualifier](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests).

### Preview triage without executing

```bash
frankenbeast issues --label build --dry-run
```

Fetches and triages issues, displays the severity/complexity table, then exits without executing. Use this to verify the triage output before committing to a run.

### Target the upstream repo from a fork

```bash
frankenbeast issues --target-upstream
```

Resolves the GitHub `upstream` remote from the current fork checkout and uses that repository as the canonical target for issue fetch, branch context, and PR creation. This cannot be combined with `--repo`.

## All Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--label <labels>` | Comma-separated label filter | — |
| `--search <query>` | GitHub search syntax query | — |
| `--milestone <name>` | Filter by milestone | — |
| `--assignee <user>` | Filter by assignee | — |
| `--limit <n>` | Max issues to fetch | 30 |
| `--repo <owner/repo>` | Target repository | auto-inferred |
| `--target-upstream` | Use the fork upstream as the canonical target repo | false |
| `--dry-run` | Preview triage, skip execution | false |
| `--budget <n>` | Max spend in USD | 10 |
| `--no-pr` | Skip PR creation | false |
| `--provider <name>` | CLI agent provider | claude |
| `--providers <list>` | Fallback chain for rate limits | — |

## Review Flow

After triage, you see a table:

```
#     Title                              Severity   Complexity  Rationale
---   -----                              --------   ----------  ---------
42    Fix login validation                critical   one-shot    Single file, clear criteria
87    Refactor auth middleware            medium     chunked     Multi-file, architectural
```

Prompts: `Approve all? [Y/n/edit]`

- **Y** — execute all listed issues
- **n** — abort
- **edit** — enter issue numbers to remove, then re-approve

## Budget

The `--budget` flag sets a USD spending cap across all issues (default: $10). When the budget is exhausted, remaining issues are skipped with status `skipped`. Budget tracking converts USD to tokens at 1 USD = 1,000,000 tokens.

## Backpressure

Issue execution has a programmatic backpressure policy for orchestrator/refill callers that need to pause fresh issue starts before they create an availability incident. Callers can pass capacity signals for active processes, failed starts, in-flight backlog, pending queue depth, oldest queue age, provider budget remaining, and system load. When a configured threshold is exceeded, the runner skips the fresh issue start with status `skipped`, logs `[issues] Backpressure paused issue #<n>`, and includes a `backpressure: ...` reason in the issue outcome so refill/liveness output explains why work was paused. Once later signals fall below threshold, the next eligible issue is allowed automatically; no manual reset is required.

During degraded mode, the worker routing policy is explicit and machine-readable through `routeIssueWorkerForDegradedMode(...)` and the logged `workerRoute` payload. Fresh issues with no checkpoint progress are routed to `defer-fresh-start`, while checkpointed/in-progress issues are routed to `resume-checkpointed` so the runner can finish or harden already-started work without launching duplicate fresh workers. Completed checkpoints route to `complete-checkpointed`. Each route includes `mode`, `action`, `reason`, and `guidance` fields for PM/liveness tooling.

The deterministic burst-load fixture at `packages/franken-orchestrator/tests/unit/issues/fixtures/burst-dispatch-load.json` captures an overloaded dispatch tick, a recovered-capacity tick, and a queue-depth edge case. Use it when changing availability/refill policy so tests can prove both the pause reason and the automatic recovery behavior remain machine-readable.

For live operator awareness before a hard pause, set `thresholds.capacityWatermarkRatio` to a value between `0` and `1` (for example `0.8`). The runner then emits `[issues] Capacity watermark alert for issue #<n>` with structured `alerts[]` whenever capacity-style signals such as `activeProcesses`, `inFlightBacklog`, `pendingIssueCount`, `oldestQueueAgeMs`, or `systemLoadAverage` reach that percentage of their configured threshold. Watermark alerts do not skip the issue; they are warning telemetry for PM/liveness tooling. Values below the watermark remain quiet so normal refill output is not noisy.

Dependency-specific circuit breakers are available under `thresholds.dependencyCircuitBreakers`. Each key is an external dependency name reported by `signals().dependencyStatuses[]`, so callers can pause only the work that depends on GitHub, Slack, Chroma, or another named service instead of applying a global stop. A breaker opens when its configured dependency reports a paused status such as `unavailable`, reaches `maxConsecutiveFailures`, or carries a future `openUntil` timestamp; unrelated dependency signals are ignored unless they have their own configured breaker. Open breakers add structured `dependencyCircuitBreakers[]` data to the decision and a `backpressure: <dependency> ...` skip reason for operator/liveness output.

Example:

```ts
await evaluateIssueBackpressure({
  thresholds: {
    dependencyCircuitBreakers: {
      github: { maxConsecutiveFailures: 3, pauseOnStatuses: ['unavailable'] },
    },
  },
  signals: () => ({
    activeProcesses: 0,
    failedStarts: 0,
    inFlightBacklog: 0,
    dependencyStatuses: [
      { dependency: 'github', status: 'degraded', consecutiveFailures: 3 },
    ],
  }),
}, context)
```

## Scheduler fairness report

Before execution starts, `IssueRunner` emits `[issues] Scheduler fairness report` with structured data that PM/liveness tooling can consume without parsing prose. The report includes:

- `totalIssues`: number of approved issues considered for this run.
- `scheduledIssueNumbers`: the actual severity-ordered execution order.
- `buckets[]`: counts and issue numbers for `critical`, `high`, `medium`, `low`, and `unprioritized` work.
- `warnings[]`: explicit edge cases, such as unprioritized issues that will run after prioritized work or approved issues missing triage results.

Library callers can produce the same deterministic payload directly with `buildIssueSchedulerFairnessReport(issues, triageResults)`. Treat non-empty `warnings[]` as operator guidance: either add the missing labels/triage data before approving the run, or record why the fallback order is acceptable.
