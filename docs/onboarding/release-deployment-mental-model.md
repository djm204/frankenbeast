# Release and deployment mental model

Use this guide when you need to understand what happens after an issue is picked up, how a pull request becomes release material, and who owns post-merge monitoring or rollback decisions.

## One-screen lifecycle

| Stage                | Owner                               | Required evidence                                                           | Contributor mental model                                                                               |
| -------------------- | ----------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Issue triage         | PM or issue worker                  | Labels, acceptance criteria, duplicate check                                | The issue defines exactly one unit of work. Do not broaden it into adjacent backlog.                   |
| Branch and worktree  | Issue worker                        | One issue, one branch, one PR                                               | Start from `origin/main` in an isolated worktree. Keep the issue number in the branch name.            |
| Implementation       | Issue worker                        | Focused diff, tests/docs for the acceptance criteria                        | Make the smallest change that proves the issue is resolved. Keep unrelated cleanup out.                |
| Local verification   | Issue worker                        | Exact commands and outcomes                                                 | Run the narrowest deterministic checks first, then a broader gate when practical.                      |
| Pull request         | Issue worker                        | Conventional Commit title, `Closes #<issue-number>`, verification notes     | The PR body is the handoff contract for reviewers, PMs, and future workers.                            |
| CI and Codex review  | Issue worker until clean or blocked | Green CI, current-head `@codex review` clean, zero unresolved Codex threads | Older green checks or older Codex all-clears are stale after every push.                               |
| Merge                | PR owner or delegated closer        | Squash merge title in Conventional Commit form                              | Merge only after the current head satisfies CI, review, and issue scope gates.                         |
| Release automation   | Maintainer / Release Please         | Release PR, changelog entries, GitHub release tag                           | Merged conventional commits are inputs to Release Please; release PRs package them into a version.     |
| Deployment / rollout | Operator or maintainer              | Release notes, impacted services, rollback plan                             | A release is not fully closed until the affected surface is monitored and rollback ownership is clear. |

## Issue to PR to merge flow

1. Confirm the GitHub issue is still open and no live PR already closes it.
2. Create a dedicated `resolve/issue-<number>-<slug>` branch and worktree from `origin/main`.
3. Read the issue body, comments, shared lessons, and any linked docs before editing.
4. Add or update the smallest docs, tests, fixtures, or code required by the acceptance criteria.
5. Run targeted verification and record exact commands for the PR body.
6. Open one PR with a Conventional Commit title and a closing reference such as `Closes #1735`.
7. Wait for CI and trigger the real GitHub Codex connector with `@codex review` when the workflow requires it.
8. Address actionable review findings, reply with the concrete fix or rationale, resolve threads, and retrigger until the current head is clean.
9. Merge only when the current head has green checks, a current-head Codex clean, and no unresolved Codex-authored review threads.
10. After merge, verify the issue closed and record any durable lesson before taking another issue.

For the detailed PR checklist and handoff fields, see the [coding-agent PR etiquette guide](./coding-agent-pr-etiquette.md).

## Release labels and signals

Release state is mostly derived from merged commits and Release Please automation, not from ad hoc issue labels.

| Signal                                                               | Meaning                                                                                                                                | Contributor action                                                                                                                     |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Conventional Commit type (`feat`, `fix`, `docs`, `ci`, `test`, etc.) | Release Please groups the merged change into changelog sections from [`release-please-config.json`](../../release-please-config.json). | Use a precise Conventional Commit PR title and commit subject. Docs-only onboarding work should use `docs(onboarding): ...`.           |
| `autorelease: pending`                                               | Release Please has opened or updated a release PR and is waiting for maintainer action.                                                | Do not create a manual release PR. If your change is missing from the pending release notes, check the merged commit title/type first. |
| `autorelease: tagged`                                                | Release Please has tagged a release for the packaged changes.                                                                          | Treat the GitHub release and tag as the published release boundary for that version.                                                   |
| `documentation`, `docs`, `dx`                                        | Documentation/developer-experience scope. These can still be release-visible because release notes include documentation sections.     | Keep verification evidence explicit even when no runtime code changed.                                                                 |
| `deploy-beasts` or other surface labels                              | The issue touches a deployable/runtime surface or operational guide.                                                                   | Include rollout notes, affected services, and rollback ownership in the PR body when behavior changes.                                 |
| Priority labels such as `P0` / `P1` / `P2` / `P3`                    | Ordering and urgency, not release semantics.                                                                                           | Do not infer semver impact from priority alone; state release impact in the PR when needed.                                            |

## What happens after merge

- Release Please watches `main` and prepares release PRs from merged conventional commits.
- The release PR updates changelogs and version metadata for the root package and configured workspaces.
- Maintainers review and merge the release PR when they are ready to publish.
- The tag and GitHub release represent the public release artifact; operators deploy from that known version, not from an unreviewed local branch.
- If the merged change affects local setup, provider auth, dashboard routes, security controls, or Beast runtime behavior, the PR owner should call that out in release notes or handoff comments so operators know what to monitor.

## Deployment and monitoring ownership

Deployment ownership depends on the changed surface:

- Documentation-only onboarding changes: the PR owner verifies links and docs tests; maintainers verify the release notes if the docs are called out in a release.
- CLI or package behavior: the package owner verifies package-level build/typecheck/test gates and publishes through the normal release flow.
- Dashboard, chat server, or Beast runtime behavior: the runtime owner verifies rollout readiness, logs, metrics, and user-visible behavior after deployment.
- Security-sensitive changes: follow [`SECURITY.md`](../../SECURITY.md) for vulnerability handling, secret hygiene, HTTPS/network exposure, and security check expectations.
- Rollback or force-with-lease branch recovery: follow the [worker push rollback runbook](../runbooks/worker-push-rollback.md) instead of issuing ad hoc destructive git commands.

Post-merge monitoring is owned by the surface owner or delegated closer named in the PR handoff. If ownership is ambiguous, stop and ask the PM or maintainer before assuming another worker will monitor it.

## Rollback and incident expectations

Rollback decisions are operational work, not a normal issue-worker shortcut.

- Prefer a forward fix or revert PR when the change has already merged and a safe revert is possible.
- Use branch rollback only for worker branch recovery before merge, and route force-with-lease commands through approval-cop/HITL as described in the rollback runbook.
- For production incidents, preserve evidence first: release tag, deployed commit, failing check or alert, affected service, and user impact.
- For security incidents, avoid public issue comments with exploit details or secrets; use the private reporting and remediation path in `SECURITY.md`.
- Record who owns follow-up monitoring and what signal proves recovery: green CI, restored service health, closed incident, or released rollback version.

## Negative cases for contributors and agents

- Do not treat `autorelease: pending` as permission to edit release metadata directly.
- Do not merge on a stale Codex clean, an `eyes` reaction, usage-limit text, or resolved old review threads without a fresh current-head clean.
- Do not infer rollout safety from green unit tests alone when the changed surface is dashboard, chat, Beast runtime, security, or deployment docs.
- Do not claim a release or deployment is complete just because the issue closed; verify the release/deployment boundary that applies to the change.
- Do not run destructive rollback commands from a worker shell without the approved runbook path.
