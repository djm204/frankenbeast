# PM-swarm runtime glossary

Use this glossary when a PM, doctor, or issue worker handoff mentions PM-swarm runtime state. The terms are intentionally operational: each row says what the signal means, how to verify it, and what to do next without creating duplicate work.

## Quick use

1. Identify the term in the Kanban comment, liveness report, GitHub PR, or worker handoff.
2. Read the row's **What it means** and **What to verify first** columns before taking action.
3. Apply the **What to do when you see it** guidance, then record the exact evidence in the task comment or PR handoff.
4. If evidence is stale or contradictory, re-check live Kanban, GitHub PR, CI, Codex, and worktree state before editing code or spawning more workers.

For an outage rehearsal that uses these terms in sequence, run the [provider outage recovery drill](../dr/provider-outage-recovery-drill.md). It covers primary provider failure, fallback-only mode, in-flight backlog freeze, recovery probe, and resume order with fixture/sandbox commands by default.

## Runtime term table

| Term | What it means | What to verify first | What to do when you see it |
| --- | --- | --- | --- |
| PM shard | A coordinator card responsible for a bounded group of issue workers, usually one PM per several workers. | The shard's current worker list, open issue coverage, and whether any child cards are blocked or stale. | Update the shard with concise bullet status and route only scoped follow-up cards to fresh workers. |
| Worker card | A one-issue Kanban card that owns one issue/branch/worktree/PR lifecycle. | The linked issue number, branch name, PR URL, current heartbeat, and whether another card already owns the same issue. | Keep it focused on that issue; after merge or blocker, write reusable lessons and stop. |
| Root blackboard | The parent coordination card or shared thread where PMs record swarm-wide state, policies, and blockers. | Whether the blackboard state is newer than live GitHub/Kanban evidence. | Post swarm-wide evidence there, but treat live PR/issue/check state as authoritative before acting. |
| Liveness check | A periodic status pass that verifies workers, heartbeats, PRs, Codex state, and capacity. | The timestamp, target worker ids, and whether it used live GitHub/Kanban queries or stale progress files. | Use it to find stuck work; do not treat it as permission to duplicate an active issue owner. |
| Refill | Adding fresh one-issue worker cards when active capacity drops below the desired lane width. | Open issues, existing PRs, duplicate issue assignments, and provider/budget limits. | Create only non-overlapping worker cards and record the new `worker_ids` on the PM shard. |
| `worker_ids` | The current active-worker roster for a PM shard or liveness script. | Whether each listed card is live, blocked, terminal, or replaced by a newer worker. | Keep it current for active capacity; move terminal/stale workers out instead of accumulating history. |
| Active PR guard | A dispatcher or PM-swarm suppression that prevents a duplicate worker from starting while a PR already owns the issue. | The PR's branch, linked issue, checks, mergeability, Codex status, and unresolved review threads. | Continue or close out the existing PR path; do not spawn a second issue worker. |
| Codex gate | The required GitHub `@codex review` connector pass for the current PR head. | Latest trigger timestamp, reviewed commit/head SHA, bot comments, reviews, inline findings, and unresolved Codex threads. | Fix/reply/resolve findings and retrigger until the current head is clean, or block on usage-limit/stall/cap evidence. |
| Approval-cop | Automation that executes explicit, allowlisted approval commands after a human approves them. | The exact command, target worktree, approval token/status, and whether the command is still safe for the current head. | Use it only for the recorded command; if the command is missing or stale, ask for a precise approval instead of inventing one. |
| Doctor card | A repair/supervision card assigned to diagnose blocked, stale, crashed, or churned workers. | Live worker PID/heartbeat, current issue/PR state, local worktree diff, CI, Codex, and prior doctor comments. | Treat the disease, not the symptom: close terminal cards, unblock stale blockers, or leave exact next actions for the active owner. |
| Shared lessons file | Repo-local durable guidance such as `tasks/resolve-issues-shared-lessons.md` that fresh workers read before coding. | Whether the lesson is reusable and not just stale task progress. | Append compact process lessons after merge/blocker so the next fresh worker avoids the same miss. |
| Worktree | An isolated checkout tied to one issue branch or PR closeout branch. | Path, branch, clean/dirty status, ahead/behind status, and whether another live worker owns uncommitted changes. | Make issue-specific edits there only; avoid staging or pushing over another live owner's dirty worktree. |
| Parked worker | A worker intentionally stopped or blocked because a provider, approval, Codex, or dependency gate is unavailable. | The blocker kind, retry criteria, and whether a monitor or PM has ownership. | Do not churn respawns; wake it only when the blocker has changed or the exact approved action can run. |
| Handoff | A durable comment, PR body, or Kanban completion/block note describing state for the next worker/operator. | Issue/PR ids, exact commands run, results, remaining gate, and owner. | Make it machine-checkable and human-readable; avoid vague status like "almost done." |

## Negative and edge-case guidance

- Do not start a second branch, worktree, or PR for the same issue when an active PR guard, live heartbeat, or linked PR already owns it.
- Do not merge on Codex silence, an eyes reaction, or a clean response from an older head; the clean gate must name or follow the current PR head and unresolved Codex threads must be zero.
- Do not treat `worker_ids` as a historical audit log; it is an active roster, so stale and terminal workers should move to comments or run history.
- Do not use approval-cop to invent a missing command; it should execute only an explicit allowlisted command with current-head evidence.
- Do not roll a completed worker into the next issue; PM-swarm reliability depends on fresh context per issue/PR lifecycle.
- Do not delete dirty worktrees or force-push over another live worker unless the handoff explicitly gives ownership and the live evidence proves it is safe.
- Do not rely on progress files alone for liveness; compare them with live Kanban, GitHub PR, CI, and Codex state.

## Handoff checklist

Include these fields when you reference PM-swarm runtime terms in a Kanban comment, PM update, or PR closeout note:

```text
Issue/PR: #<issue> / #<pr or none>
Term observed: <liveness check | active PR guard | Codex gate | ...>
Live evidence: <heartbeat timestamp, PR head SHA, check state, Codex trigger timestamp, unresolved thread count>
Owner: <worker card, PM shard, doctor card, monitor, or human>
Next safe action: <one concrete command or decision>
Duplicate-work guard: <why a second worker/PR is or is not safe>
```

If any field is unknown, write `unknown` and name the query needed to resolve it. That makes the failure mode explicit for the next operator instead of hiding ambiguity in prose.
