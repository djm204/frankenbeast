# Agent coordination runtime glossary

Use this glossary when a coordinator, reviewer, repair owner, or issue worker handoff mentions runtime coordination state around Frankenbeast issue work. These terms describe the repository's operator workflow and external automation around GitHub, Kanban, CI, and review gates; they are not Frankenbeast product features or package names.

## Quick use

1. Identify the term in the Kanban comment, liveness report, GitHub PR, or worker handoff.
2. Read the row's **What it means** and **What to verify first** columns before taking action.
3. Apply the **What to do when you see it** guidance, then record the exact evidence in the task comment or PR handoff.
4. If evidence is stale or contradictory, re-check live Kanban, GitHub PR, CI, review, and worktree state before editing code or spawning more workers.

For an outage rehearsal that uses these terms in sequence, run the [provider outage recovery drill](../dr/provider-outage-recovery-drill.md). It covers primary provider failure, fallback-only mode, in-flight backlog freeze, recovery probe, and resume order with fixture/sandbox commands by default.

## Runtime term table

| Term | What it means | What to verify first | What to do when you see it |
| --- | --- | --- | --- |
| Coordination shard | A coordinator card or handoff responsible for a bounded group of issue workers. | The shard's current worker list, open issue coverage, and whether any child cards are blocked or stale. | Update the shard with concise bullet status and route only scoped follow-up cards to fresh workers. |
| Worker card | A one-issue Kanban card that owns one issue/branch/worktree/PR lifecycle. | The linked issue number, branch name, PR URL, current heartbeat, and whether another card already owns the same issue. | Keep it focused on that issue; after merge or blocker, write reusable lessons and stop. |
| Root blackboard | The parent coordination card or shared thread where operators record repo-wide state, policies, and blockers. | Whether the blackboard state is newer than live GitHub/Kanban evidence. | Post broad evidence there, but treat live PR/issue/check state as authoritative before acting. |
| Liveness check | A periodic status pass that verifies workers, heartbeats, PRs, review state, and capacity. | The timestamp, target worker ids, and whether it used live GitHub/Kanban queries or stale progress files. | Use it to find stuck work; do not treat it as permission to duplicate an active issue owner. |
| Refill | Adding fresh one-issue worker cards when active capacity drops below the desired lane width. | Open issues, existing PRs, duplicate issue assignments, and provider/budget limits. | Create only non-overlapping worker cards and record the new `worker_ids` on the coordination shard. |
| `worker_ids` | The current active-worker roster for a coordination shard or liveness script. | Whether each listed card is live, blocked, terminal, or replaced by a newer worker. | Keep it current for active capacity; move terminal/stale workers out instead of accumulating history. |
| Active PR guard | Dispatcher or coordination suppression that prevents a duplicate worker from starting while a PR already owns the issue. | The PR's branch, linked issue, checks, mergeability, review status, and unresolved review threads. | Continue or close out the existing PR path; do not spawn a second issue worker. |
| Provider route | The selected execution/provider path for a worker or gate, such as primary Codex, Spark fallback, or Ollama Cloud fallback. | Current provider health, quota/rate-limit state, allowed action class, and whether the route is approved for this issue. | Keep work on the approved route; if the provider is down or capped, park or reroute only after recording evidence. |
| Fallback lane | A bounded set of low-risk worker slots allowed to continue when the primary provider path is unavailable. | Lane width, issue risk class, tool restrictions, current worker count, and whether production mutation is forbidden. | Refill only within the lane policy; do not let fallback workers perform disallowed implementation, merge, or review-gate substitution. |
| Review gate | The required PR review pass for the current head, usually the GitHub `@codex review` connector when configured. | Latest trigger timestamp, reviewed commit/head SHA, bot comments, reviews, inline findings, and unresolved review threads. | Fix/reply/resolve findings and retrigger until the current head is clean, or block on usage-limit/stall/cap evidence. |
| HITL gate | A human-in-the-loop decision point required before a risky mutation, approval replay, bypass, restore, force-push, or merge. | The exact requested decision, approver, command/effect, expiry, and whether the evidence is still current. | Stop automated mutation until the decision is explicit; record the decision before executing the approved action. |
| Review cap | A configured or provider-imposed limit on review triggers, review attempts, or bot invocations for a PR/run. | Invocation count, cap source, latest trigger time, bot response, and whether another trigger would exceed policy. | Do not spam retries; wait for quota/reset, ask for bypass, or record the cap as the blocker. |
| Current-head clean | Evidence that the latest PR head, not an older commit, has green checks, no unresolved review threads, and a clean review response when required. | PR head SHA, status checks, latest review trigger/result, unresolved thread count, and mergeability. | Merge only when this evidence is current; otherwise retrigger review, fix findings, or leave an explicit blocker. |
| Approval runner | Automation that executes explicit, allowlisted approval commands after a human approves them. | The exact command, target worktree, approval token/status, and whether the command is still safe for the current head. | Use it only for the recorded command; if the command is missing or stale, ask for a precise approval instead of inventing one. |
| Repair card | A supervision card assigned to diagnose blocked, stale, crashed, or churned workers. | Live worker PID/heartbeat, current issue/PR state, local worktree diff, CI, review state, and prior repair comments. | Treat the disease, not the symptom: close terminal cards, unblock stale blockers, or leave exact next actions for the active owner. |
| Shared lessons file | Repo-local durable guidance such as `tasks/resolve-issues-shared-lessons.md` that fresh workers read before coding. | Whether the lesson is reusable and not just stale task progress. | Append compact process lessons after merge/blocker so the next fresh worker avoids the same miss. |
| Worktree | An isolated checkout tied to one issue branch or PR closeout branch. | Path, branch, clean/dirty status, ahead/behind status, and whether another live worker owns uncommitted changes. | Make issue-specific edits there only; avoid staging or pushing over another live owner's dirty worktree. |
| Parked worker | A worker intentionally stopped or blocked because a provider, approval, review, or dependency gate is unavailable. | The blocker kind, retry criteria, and whether a monitor or coordinator has ownership. | Do not churn respawns; wake it only when the blocker has changed or the exact approved action can run. |
| Handoff | A durable comment, PR body, or Kanban completion/block note describing state for the next worker/operator. | Issue/PR ids, exact commands run, results, remaining gate, and owner. | Make it machine-checkable and human-readable; avoid vague status like "almost done." |

## Negative and edge-case guidance

- Do not start a second branch, worktree, or PR for the same issue when an active PR guard, live heartbeat, or linked PR already owns it.
- Do not merge on review silence, an eyes reaction, or a clean response from an older head; the clean gate must name or follow the current PR head and unresolved review threads must be zero.
- Do not treat `worker_ids` as a historical audit log; it is an active roster, so stale and terminal workers should move to comments or run history.
- Do not use an approval runner to invent a missing command; it should execute only an explicit allowlisted command with current-head evidence.
- Do not roll a completed worker into the next issue; issue-worker reliability depends on fresh context per issue/PR lifecycle.
- Do not delete dirty worktrees or force-push over another live worker unless the handoff explicitly gives ownership and the live evidence proves it is safe.
- Do not rely on progress files alone for liveness; compare them with live Kanban, GitHub PR, CI, and review state.

## Handoff checklist

Include these fields when you reference coordination runtime terms in a Kanban comment, coordinator update, or PR closeout note:

```text
Issue/PR: #<issue> / #<pr or none>
Term observed: <liveness check | active PR guard | review gate | ...>
Live evidence: <heartbeat timestamp, PR head SHA, check state, review trigger timestamp, unresolved thread count>
Owner: <worker card, coordination shard, repair card, monitor, or human>
Next safe action: <one concrete command or decision>
Duplicate-work guard: <why a second worker/PR is or is not safe>
```

If any field is unknown, write `unknown` and name the query needed to resolve it. That makes the failure mode explicit for the next operator instead of hiding ambiguity in prose.
