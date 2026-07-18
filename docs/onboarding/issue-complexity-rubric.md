# Issue complexity rubric for agent assignment

Use this rubric when triaging GitHub issues, refilling coordination lanes, or deciding whether a low-risk fallback agent may take a task. It complements the repository ownership manifest and agent role responsibility map: labels describe priority and topic, while this rubric describes execution risk, required tools, verification depth, and the agent/model lane that should own the work.

## Fast assignment flow

1. Read the issue title, labels, acceptance criteria, and linked files.
2. Pick the highest matching complexity/risk level below. When two levels match, use the higher level.
3. Match repository ownership entries for the likely touched paths.
4. Assign only to a lane whose allowed toolsets and model capability cover the level.
5. Include the chosen level, ownership entries, expected verification, and escalation triggers in the Kanban or PR handoff.

## Complexity and risk levels

| Level | Use when | Examples | Allowed toolsets | Recommended model lane | Verification depth | Escalate when |
| --- | --- | --- | --- | --- | --- | --- |
| C0 — Triage / no-code | The issue needs classification, duplicate checks, labeling, or a decision comment without repo mutations. | Duplicate issue closure; missing-acceptance-criteria triage; stale issue audit. | GitHub read-only, file read/search, Kanban comments. | Low-cost triage or fallback lane. | Live GitHub issue/PR search plus concise evidence comment. | Any code/doc change is needed, duplicate status is uncertain, or labels conflict with the body. |
| C1 — Docs-only / low risk | The change is narrow prose, link, or onboarding guidance with no runtime behavior and deterministic doc verification. | Add a guide section; fix stale setup wording; update a README command. | File read/search/write, git, targeted docs tests, GitHub PR. | Low-risk docs lane; fallback agents are allowed if they can run checks and open PRs. | Targeted docs regression or markdown/content verifier; optional root docs test. | The doc describes future behavior not present in code, changes operator/security advice, or touches CI/workflow scripts. |
| C2 — Localized implementation | The issue changes one package or one small workflow with clear acceptance criteria and bounded tests. | CLI flag validation; one route validation fix; a small UI state bug. | Repo file tools, package test/typecheck/build, GitHub PR, Codex gate. | Standard coding lane. | Failing/regression test first when practical, package-level test/typecheck/build. | More than one package boundary changes, public API shape changes, or package checks expose shared failures. |
| C3 — Cross-package / integration | The issue spans multiple packages, shared schemas, runtime contracts, or a UI/backend flow. | Shared DTO migration; dashboard route plus orchestrator API; issue runner behavior plus docs. | Full repo search/edit, package and root tests, typecheck/build, CI review, GitHub PR/Codex. | Senior coding lane or coordinator-supervised issue worker. | Cross-package tests plus root or CI-equivalent checks that cover every owner surface. | Ownership is unclear, another active PR touches the same contract, or CI failure appears unrelated but blocks the PR. |
| C4 — Security / data integrity / recovery | The issue can expose secrets, unsafe filesystem/process behavior, auth boundaries, durable state, backups, or disaster recovery paths. | Path containment, token redaction, approval/session integrity, backup encryption, restore rollback. | Security scan, targeted exploit/regression tests, package/root gates, GitHub PR/Codex, optional manual reviewer. | Security/high-capability lane only; fallback agents must not take implementation work. | Negative tests for abuse cases, typecheck/build, security-focused self-review, current-head Codex clean. | Secrets/PII could be exposed, destructive operations are possible, approval is denied, or a migration/rollback decision is needed. |
| C5 — System / agent coordination / release-critical | The issue affects orchestration policy, coordination capacity, provider fallback, CI/release automation, migrations, or broad runtime availability. | Queue starvation, provider circuit breakers, release/deploy policy, multi-agent handoff quality, disaster-recovery workflows. | Full GitHub/Kanban state, repo-wide tests as feasible, CI/release checks, coordinator coordination, Codex gate, human approval for side effects. | Primary model / senior coordinator-supervised lane; split into child cards when separable. | Design note or structured handoff, broad verification plan, CI evidence, current-head Codex clean before merge. | Scope crosses unrelated owners, rollout could strand workers/users, provider limits block review, or human approval is required. |

## Label-to-rubric mapping

Labels are routing hints, not final authority. Always read the issue body and acceptance criteria before assignment.

| Label signal | Default level | Routing note |
| --- | --- | --- |
| `docs`, `documentation`, `dx` | C1 | Promote to C2/C3 if the doc must be generated from code, alters scripts, or needs a new verifier. |
| `test`, `ci` | C2 | Promote to C3/C5 when touching shared CI workflows, Turbo/root scripts, or release gates. |
| `bug`, `fix` | C2 | Promote when the bug crosses packages, involves data loss, auth, process cleanup, or durable state. |
| `feat` | C2 or C3 | Use C3+ when the feature adds a cross-package contract, UI/backend flow, or operator workflow. |
| `security`, `vulnerability`, `auth`, `secrets` | C4 | Never route implementation to low-risk fallback lanes; require security-negative tests. |
| `availability`, `stability`, `dr`, `memory`, `learning` | C3 by default | Promote to C4 for data integrity/recovery and to C5 for orchestration policy, provider, or release-critical behavior. |
| Priority labels (`P0`, `P1`, `P2`, etc.) | No direct level | Priority controls ordering; complexity controls lane assignment and verification depth. A P2 security issue can still be C4. |
| `enriched` | No direct level | Treat it as a quality signal that acceptance criteria exist, not as a risk downgrade. |

## Topic examples from the 2026-07-11 strategic issue set

These examples show how to classify existing issues from each requested topic without broadening a worker beyond one issue.

| Topic | Example issue | Suggested level | Why |
| --- | --- | --- | --- |
| Onboarding | #1733 — docs(onboarding): add issue complexity rubric for agent assignment | C1 | Documentation-only routing guide with a targeted docs verifier. |
| Security | #1739 — Security: add per-lane network egress policy | C4 | Network policy can change safety boundaries and requires negative tests. |
| Vulnerabilities | #1740 — Security: protect against regex denial-of-service in scanners and parsers | C4 | Abuse-case protection around parser/scanner behavior. |
| Stability | #1745 — fix(stability): add heartbeat monotonicity checks | C3 | Runtime behavior and liveness semantics likely span worker/dispatcher state. |
| Availability | #1750 — feat(availability): add partial dependency outage status in dashboard | C3 | Crosses runtime status and dashboard presentation. |
| Disaster recovery | #1752 — feat(dr): add restore preview conflict detector | C4 | Restore planning touches durable state and must fail safely. |
| Persistent memory for agents | #1758 — feat(memory): add project-scoped memory snapshots for worker handoff | C4 | Memory snapshots can carry sensitive or stale context and need ownership boundaries. |
| Learning for agents | #1762 — feat(learning): add task-family clustering for repeated failures | C5 | Policy/learning behavior affects agent-coordination assignment and long-running automation. |

## Fallback-lane guardrails

- Low-risk fallback agents may take C0 and C1 work when the handoff includes exact files, checks, and PR/Codex expectations.
- Low-risk fallback agents may plan C2 work but should not implement it unless a coordinator explicitly approves the lane and the package owner is clear.
- Low-risk fallback agents must not implement C3–C5 work. They can only gather evidence, classify, or write a coordination handoff.
- If a fallback agent discovers that a task is higher than its lane, it should stop after a comment that names the evidence and recommended new level.

## Handoff template

```text
Complexity level: C<0-5> — <name>
Label basis: <labels inspected>
Ownership entries: <repository ownership ids>
Allowed lane: <fallback docs | standard coding | security | coordinator-supervised>
Expected verification: <commands/checks>
Escalation triggers: <specific triggers from the rubric>
Duplicate-work guard: <issue/PR/worktree evidence>
```
