# Provider outage recovery drill

Use this drill to rehearse a model-provider outage before a real rate-limit or provider incident. It is a tabletop and fixture-driven exercise: the default commands read repository files or print deterministic sample liveness data, and they do not start workers, modify Kanban state, post to GitHub, trigger Codex, merge PRs, or replay approvals.

Related references:

- [Issue runner backpressure and degraded-mode routing](../guides/fix-github-issues.md#backpressure)
- [Incident command checklist for automation failures](incident-command-checklist.md)
- [PM-swarm runtime glossary](../onboarding/pm-swarm-runtime-glossary.md)
- [Provider failover guidance](../guides/add-llm-provider.md)

## Drill goals

- Practice the first 15 minutes of a primary model-provider outage.
- Validate that fallback-only mode preserves in-flight work instead of starving it with fresh tickets.
- Confirm PM/liveness output is specific enough for an operator to compare actual behavior with expected drill steps.
- Rehearse the recovery probe and resume order before broad primary-provider traffic is restored.

## Preconditions

| Item | Required state | Verification |
| --- | --- | --- |
| Incident channel | A Discord thread, Kanban card, or incident room is named before the drill starts. | Record it in the decision log below. |
| Scope | One repo/environment and one provider route are selected. | Example scope: `djm204/frankenbeast`, `primary=Codex`, `fallback=Ollama Cloud`. |
| Mutations | Production mutations are frozen for the drill unless the incident commander explicitly approves a sandbox action. | Merges, force-pushes, branch deletion, approval replay, broad unblocks, and live worker starts stay out of scope. |
| Fixture | Operators can run the fixture command locally. | `node scripts/provider-outage-drill-fixture.mjs --scenario provider-outage` prints JSON only. |
| Evidence | A scribe captures commands, output snippets, and decision rows. | No raw secrets, tokens, or private prompt/session dumps are pasted into the drill record. |

## Read-only fixture commands

The fixture script is safe to run from any checkout because it only prints deterministic sample events:

```bash
node scripts/provider-outage-drill-fixture.mjs --scenario provider-outage
node scripts/provider-outage-drill-fixture.mjs --scenario fallback-paths
node scripts/provider-outage-drill-fixture.mjs --scenario recovery
```

Optional read-only live inventory commands, when an incident commander wants to compare a real environment with the fixture:

```bash
gh pr list --repo <owner/repo> --state open --json number,title,headRefOid,mergeStateStatus,statusCheckRollup

gh issue list --repo <owner/repo> --state open --label P2 --json number,title,labels
```

Do not run commands that start, unblock, merge, force-push, delete branches, replay approvals, or post `@codex review` as part of the default drill. If a sandbox mutation is intentionally exercised, add a decision-log row first and use a throwaway repo/card.

## Scenario timeline

### Phase 1 — Primary failure declared

Trigger condition: the primary provider returns rate-limit, outage, authentication, or repeated transient failure signals.

Expected PM/liveness behavior:

- Declares `provider_outage_declared` with the provider name, first-failure time, and evidence source.
- Freezes fresh ticket starts and broad worker refills.
- Keeps read-only inventory and already-safe monitors alive.
- Parks high-risk or mutation-heavy work such as merges, force-pushes, production deploys, approval replay, broad issue creation, and destructive cleanup.
- Records active owners for in-flight PRs/cards so a fallback worker does not duplicate them.

Failure interpretations:

- If liveness keeps creating fresh issue workers, the fresh-start freeze is not working.
- If a second owner starts on an issue that already has an active PR, active-owner detection is failing.
- If the output says only `provider down` without the evidence source, operators cannot distinguish outage, quota, auth, or local config failure.

### Phase 2 — Fallback-only mode

Fallback-only mode is for bounded, low-risk work while the primary is unavailable. It should preserve already-started backlog and avoid opening a wave of fresh tickets that hides urgent in-flight closeout.

Expected PM/liveness behavior:

- Routes checkpointed or in-progress issue work to `resume-checkpointed` or `complete-checkpointed` before launching new work.
- Routes fresh unstarted issues to `defer-fresh-start` unless the lane is explicitly classified as low-risk fallback work.
- Caps fallback lanes to the configured width and labels them as fallback-owned in liveness output.
- Allows read-only triage, documentation fixture checks, status summaries, and other sandbox-safe tasks.
- Blocks or parks work that requires the unavailable provider, a real Codex gate, or production mutation.

Fallback lane examples:

| Lane | Allowed during drill | Not allowed during drill |
| --- | --- | --- |
| Triage | Read issue/PR state and summarize blockers. | File or enrich live issues without approval. |
| Documentation | Check docs and fixture output. | Merge docs PRs without normal CI/Codex gates. |
| PR closeout | Poll existing checks and review state. | Merge on stale Codex clean, provider silence, or usage-limit text. |
| Implementation | Continue an already-owned, checkpointed low-risk branch if tests are local-only. | Start unrelated fresh implementation tickets just because fallback capacity is idle. |

Failure interpretations:

- If in-flight backlog count grows while fresh fallback tickets start, the policy is starving closeout.
- If fallback output omits lane width, owners, or stop criteria, operators cannot tell whether capacity is safe.
- If fallback mode tries to satisfy a real Codex gate with a local/self-review substitute, the review gate is being bypassed.

### Phase 3 — Recovery probe

Run one small primary-provider probe before resuming broad traffic. The probe should be observable, reversible, and isolated from production mutation.

Expected PM/liveness behavior:

- Marks `recovery_probe_started` with the primary provider, reset/quota evidence, and one owner.
- Keeps fallback-only routing active until the probe passes.
- Uses a small read-only or sandbox prompt where possible.
- Requires a second consecutive healthy signal before reopening fresh starts if the outage was flapping.
- Records probe result as `passed`, `failed`, or `inconclusive` with the next retry time.

Failure interpretations:

- If one successful probe immediately unleashes broad worker refill after a flapping outage, resume ordering is too aggressive.
- If the probe mutates production state, the exercise is not safe by default.
- If the output lacks the provider, model/route, timestamp, and retry clock, later operators cannot audit the decision.

### Phase 4 — Resume order

Resume primary-provider work in this order:

1. Keep the fresh-start freeze in place while a second health signal is captured.
2. Unpark existing active PR/card owners that only needed the provider back.
3. Finish or harden in-flight backlog with known owners and current worktrees.
4. Re-run any stale review gates on the current head; do not treat older clean comments as current.
5. Drain fallback-only lanes that are already running to a safe checkpoint, then stop refilling them.
6. Re-enable fresh issue refill at a reduced width for one liveness tick.
7. Restore normal lane width only after the backlog, provider health, and gate status remain stable.

Failure interpretations:

- If fresh work resumes before active PR closeout, operators can create duplicate PRs and leave older work stranded.
- If fallback lanes are killed without checkpoint handoff, useful sandbox work can be lost.
- If stale Codex or CI state is reused after a head change, the merge gate is unsafe.

## Expected fixture output

`node scripts/provider-outage-drill-fixture.mjs --scenario provider-outage` should print JSON containing:

- `scenario: "provider-outage"`
- a `provider_outage_declared` event;
- a `fresh_start_freeze` event;
- `fallback_only_mode` with lane width and allowed lanes;
- backlog routes that include `resume-checkpointed`, `complete-checkpointed`, and `defer-fresh-start`;
- `failureInterpretations` for fresh-start starvation, duplicate owners, unsafe gate bypass, and missing retry clock.

`node scripts/provider-outage-drill-fixture.mjs --scenario fallback-paths` should print JSON containing:

- `scenario: "fallback-paths"` and `safety.liveProviderCalls: false`;
- fixtures named `primary-unavailable`, `spark-budget-exhausted`, `ollama-only-continuity`, and `primary-restored`;
- transitions that park fresh backlog during primary outage, refuse Spark refill after budget exhaustion, keep Ollama Cloud fallback at five low-risk lanes, and resume primary blocked owners before new tickets;
- `workerCounts` and `summaryLines` that expose primary, Spark, Ollama, and parked worker counts for every route transition;
- `toolRestrictions` for Ollama-only continuity so fallback lanes cannot perform fresh implementation, production mutation, or live gate substitution.

`node scripts/provider-outage-drill-fixture.mjs --scenario recovery` should print JSON containing:

- `scenario: "recovery"`
- `recovery_probe_started`;
- `recovery_probe_passed`;
- `resume_order` steps matching Phase 4;
- a final `normal_refill_restored` event only after the stability check.

## Decision log

| Time (UTC) | Decision | Owner | Evidence | Expiry / revisit |
| --- | --- | --- | --- | --- |
| `<HH:MM>` | `declare primary outage` | `<incident commander>` | `<provider error, usage-limit text, or fixture event>` | `<retry/probe time>` |
| `<HH:MM>` | `enter fallback-only mode` | `<PM/liveness owner>` | `<lane width, allowed lanes, parked high-risk work>` | `<health check interval>` |
| `<HH:MM>` | `start recovery probe` | `<gate operator>` | `<quota reset or provider status evidence>` | `<second healthy signal>` |
| `<HH:MM>` | `resume fresh refill` | `<PM/liveness owner>` | `<probe passed, backlog stable, fallback lanes drained>` | `<next liveness tick>` |

## Pass/fail criteria

Pass the drill only if all of these are true:

- Primary failure, fallback-only mode, in-flight backlog freeze, recovery probe, and resume order were all exercised.
- Every default command was read-only or fixture/sandbox-based.
- PM/liveness output had expected events, owners, route decisions, and retry/resume clocks.
- Fresh issue starts did not starve in-flight backlog.
- High-risk work stayed parked until explicit recovery or human approval.
- Links to the backpressure, incident-command, PM-swarm, and provider-failover docs were included in the drill record.

Fail and file follow-up work if any of these occur:

- A production mutation happened without a decision-log row.
- A fresh worker/PR duplicated an active owner.
- Fallback mode bypassed Codex, CI, or approval gates instead of parking them.
- Resume restored broad fresh-start capacity before the recovery probe and backlog stability checks completed.
