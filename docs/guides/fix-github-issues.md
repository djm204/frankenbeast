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

## Issue-to-worktree bootstrap helper

For one-issue/one-PR worker handoffs, use the root helper before coding so branch and worktree names are deterministic and easy for coordination/liveness tooling to audit:

```bash
npm run issue:worktree -- --dry-run --issue 1769 --title "feat(onboarding): add issue-to-worktree bootstrap helper"
npm run issue:worktree -- --issue 1769 --title "feat(onboarding): add issue-to-worktree bootstrap helper"
```

The dry run emits the issue number, `resolve/issue-<number>-<slug>` branch, target `../resolve-wt/issue-<number>` worktree, duplicate open-PR check, and exact git verification commands. A real run fetches the base ref, creates the branch/worktree from the selected remote's `main` branch, and configures the worktree commit identity as `David Mendez <me@davidmendez.dev>`. If a previous worker already created the branch, pass `--reuse --branch <existing-branch>` to attach a worktree without creating a duplicate branch; the helper rejects invalid issue numbers, unsafe branch names, and malformed `OWNER/REPO` values before running git.

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
| `--limit <n>` | Max issues to fetch | 1000 |
| `--repo <owner/repo>` | Target repository | auto-inferred |
| `--target-upstream` | Use the fork upstream as the canonical target repo | false |
| `--dry-run` | Preview triage, skip execution | false |
| `--budget <n>` | Max spend in USD | 10 |
| `--no-pr` | Skip PR creation | false |
| `--provider <name>` | CLI agent provider | claude |
| `--providers <list>` | Fallback chain for rate limits | — |

## Complexity routing

Before assigning or executing an issue, classify it with the [issue complexity rubric](../onboarding/issue-complexity-rubric.md). The rubric maps labels such as `docs`, `security`, `availability`, and priority tags to complexity/risk levels, allowed toolsets, recommended model lanes, verification depth, and escalation triggers.

When the work may affect a release, deployment, or post-merge ownership handoff, also read the [release and deployment mental model](../onboarding/release-deployment-mental-model.md). It explains the issue-to-PR-to-release path, release labels, CI/Codex merge gates, and rollback/monitoring responsibilities so PR handoffs do not stop at "merged" when rollout ownership still matters.

Use the rubric result as separate coordination handoff metadata or an issue comment alongside the CLI's existing review table. The current `frankenbeast issues` table still reports implementation complexity such as `one-shot` or `chunked`; the C0-C5 rubric is the assignment-risk overlay coordinators use to keep C0/C1 work in low-risk lanes while routing C3-C5 cross-package, security, disaster-recovery, or agent-coordination policy work to senior or coordinator-supervised lanes.

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

During degraded mode, the worker routing policy is explicit and machine-readable through `routeIssueWorkerForDegradedMode(...)` and the logged `workerRoute` payload. Fresh issues with no checkpoint progress are routed to `defer-fresh-start`, while checkpointed/in-progress issues are routed to `resume-checkpointed` so the runner can finish or harden already-started work without launching duplicate fresh workers. Completed checkpoints route to `complete-checkpointed`. Each route includes `mode`, `action`, `reason`, and `guidance` fields for coordination/liveness tooling.

The deterministic burst-load fixture at `packages/franken-orchestrator/tests/unit/issues/fixtures/burst-dispatch-load.json` captures an overloaded dispatch tick, a recovered-capacity tick, and a queue-depth edge case. Use it when changing availability/refill policy so tests can prove both the pause reason and the automatic recovery behavior remain machine-readable. For an operator tabletop that rehearses primary provider failure, fallback-only routing, backlog freeze, recovery probes, and resume order without mutating live state, use [`docs/dr/provider-outage-recovery-drill.md`](../dr/provider-outage-recovery-drill.md).

For live operator awareness before a hard pause, set `thresholds.capacityWatermarkRatio` to a value between `0` and `1` (for example `0.8`). The runner then emits `[issues] Capacity watermark alert for issue #<n>` with structured `alerts[]` whenever capacity-style signals such as `activeProcesses`, `inFlightBacklog`, `pendingIssueCount`, `oldestQueueAgeMs`, or `systemLoadAverage` reach that percentage of their configured threshold. Watermark alerts do not skip the issue; they are warning telemetry for coordination/liveness tooling. Values below the watermark remain quiet so normal refill output is not noisy.

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


## Duplicate worker-card process detector

Coordination and liveness callers that inventory worker-card processes can call `detectDuplicateWorkerCardProcesses(snapshots)` before starting or refilling issue work. Provide one snapshot per observed worker process with `cardId`, `pid`, optional string `runId`, `issueNumber`, `owner`, `status`, `alive`, `startedAt`, and `lastHeartbeatAt`. The detector ignores terminal/dead/invalid snapshots while preserving live blocked workers and reports only cards with two or more distinct live PIDs. Each finding is structured for automation: `cardId`, `processCount`, sorted `pids`, `runIds`, `owners`, `statuses`, timestamps, a `message`, and operator `guidance` telling the coordinator to keep one live owner, stop or park the duplicate, and record the survivor in liveness output.

## Idempotent Kanban state mutation planning

Retrying coordinator, repair owner, or watchdog updates should first call `planKanbanStateMutation(snapshot, request)` with a deterministic `idempotencyKey` and, when available, an `expectedRevision`. The planner returns `apply`, `skip`, or `conflict` with machine-readable evidence so repeated comment/block/unblock/complete attempts converge without duplicate noise while stale concurrent writes surface an explicit compare-and-set conflict.

Use stable keys derived from the business intent, not random attempts, for example `comment:<card-id>:liveness:<head-sha>`, `block:<card-id>:codex-usage-limit`, `unblock:<card-id>:repair-treatment`, or `complete:<card-id>:merged:<pr-number>`. Treat `skip` as success, `conflict` as a re-read-and-decide signal, and only execute the underlying Kanban mutation on `apply`.

## Scheduler fairness report

Before execution starts, `IssueRunner` emits `[issues] Scheduler fairness report` with structured data that coordination/liveness tooling can consume without parsing prose. The report includes:

- `totalIssues`: number of approved issues considered for this run.
- `scheduledIssueNumbers`: the actual severity-ordered execution order.
- `buckets[]`: counts and issue numbers for `critical`, `high`, `medium`, `low`, and `unprioritized` work.
- `warnings[]`: explicit edge cases, such as unprioritized issues that will run after prioritized work or approved issues missing triage results.

Library callers can produce the same deterministic payload directly with `buildIssueSchedulerFairnessReport(issues, triageResults)`. Treat non-empty `warnings[]` as operator guidance: either add the missing labels/triage data before approving the run, or record why the fallback order is acceptable.

### Large backlog liveness/refill scaling assumptions

Issue scheduler liveness output is intended to stay bounded even when a refill run sees hundreds or thousands of issues/cards. `buildIssueSchedulerFairnessReport()` samples issue-number lists and warnings while keeping authoritative counts (`totalIssues`, bucket `count`, omitted counts, and `warningSummary`). Operators should rely on the counts and summaries for backlog health, then drill into GitHub/Kanban for the full list only when a specific bucket or warning class needs action. Callers that need a tighter UI payload can pass `maxIssueNumbersPerList` and `maxWarnings`; the defaults keep output concise without hiding blocker classes.
