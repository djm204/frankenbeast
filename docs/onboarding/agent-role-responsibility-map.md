# Agent role responsibility map

Frankenbeast keeps a structured agent-role map at `docs/onboarding/agent-role-responsibility-map.manifest.json`. Use it with the repository ownership manifest before assigning or resuming agent work: the role map says what each agent type owns, and the ownership manifest says which repository surfaces and verification commands belong in the handoff.

## How to use the role map

1. Identify the active agent role in the Kanban card, coordination update, PR review, or issue handoff.
2. Match every touched path against `docs/onboarding/repository-ownership.manifest.json`.
3. Combine the role's `owns` / `mustNotOwn` lists with every matched ownership entry.
4. Copy the required fields into the handoff so the next agent has a deterministic owner map instead of prose-only context.
5. Run the role verifier and the matched repository-owner verifier, or record why a narrower command is safer.

## Role-to-repository handoff shape

Use this compact shape in Kanban comments, issue comments, and PR bodies:

```text
Agent role: issue-worker
Ownership entries: onboarding-docs, repo-automation
Primary owners: docs-onboarding-maintainers, repo-automation-maintainers
Escalation owner: core-maintainers
Verification: npm run test:root -- tests/docs-issue-1766.test.ts
Notes: docs/onboarding guidance plus root doc verifier; no package runtime owner is touched.
```

The handoff should include all required fields from the role manifest: `agentRole`, `ownershipEntries`, `primaryOwners`, `escalationOwner`, `verification`, and `handoffNotes`.

## Current agent role responsibilities

| Agent role | Owns | Repository owner entries to consider first | Must not own |
| --- | --- | --- | --- |
| Coordination shard / orchestrator | Issue inventory, worker capacity, duplicate-work guards, dependency ordering, handoff completeness. | `repo-automation`, `onboarding-docs`, plus every owner matched by assigned issue paths. | Unreviewed package implementation or merging without current CI and Codex evidence. |
| One-issue implementation worker | The smallest scoped implementation/docs change, targeted verifier, one PR, and current-head Codex loop. | Every owner matched by touched paths; `repo-automation` when tests, scripts, package metadata, or CI are touched. | Adjacent issues, broad refactors, or another worker's dirty worktree/active PR. |
| Repair / recovery worker | Live evidence, blocked-command reproduction, safe unblock, stale worktree triage, and exact next-action handoff. | `onboarding-docs` for recovery guides and `repo-automation` for branch/CI/PR state, plus the original worker's matched owners. | Replacement work before proving the owner is stale, or bypassing approval/Codex/CI gates. |
| Reviewer / Codex-gate closer | Review findings, unresolved-thread audits, CI diagnosis, and merge-readiness evidence. | `repo-automation` for checks and review automation, plus any package owner touched by review fixes. | Stale all-clears from older commits or package behavior changes without matching owner scope. |
| Docs/onboarding worker | Onboarding entrypoints, operator examples, documentation fixtures, structured manifest validation, and ambiguity guardrails. | `onboarding-docs` and `repo-automation` when verifiers live under `tests/**`. | Future-state docs without live evidence or docs-only changes with no deterministic verifier when the issue requires one. |

## Edge cases and negative guidance

- Do not let the first matching path hide additional owners. A browser change that also updates an orchestrator route needs both `web-dashboard` and `orchestrator-runtime` in the handoff.
- Do not let the agent role override repository ownership. An issue worker can own execution of one PR, but package maintainers still own the package surface it touches.
- Do not use coordinator or repair roles as permission to broaden scope. If the original issue maps to multiple unrelated owners, stop for a split decision instead of merging unrelated work into one PR.
- Do not treat docs tests as owned only by docs. Files under `tests/**`, CI workflows, root scripts, and package metadata also involve `repo-automation`.
- Do not respawn a worker or create a duplicate branch until live Kanban, GitHub, and worktree evidence proves there is no active owner.

## Maintaining the role map

Update `docs/onboarding/agent-role-responsibility-map.manifest.json`, this guide, and the matching docs verifier whenever Frankenbeast adds a durable agent role or changes the repository ownership manifest. Keep role ids stable, lowercase, and LLM-friendly; durable ids can preserve older internal names for compatibility even when display names and operator-facing prose change. Keep `mustNotOwn` explicit so failure modes are actionable rather than silently ambiguous.
