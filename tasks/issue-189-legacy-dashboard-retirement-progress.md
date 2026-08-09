# Issue 189 Frankenbeast Legacy Dashboard Retirement Progress

- [x] Reconcile Smart Swarm issue #189, Frankenbeast/Smart Swarm GitHub state, exact heads, metadata, worktrees, processes, Kanban ownership, and sibling file overlap.
- [x] Preserve the dispatcher-created stale/diverged Frankenbeast baseline and recreate the registered task path from exact `origin/main` without reset, clean, rebase, or history loss.
- [x] RED→GREEN: gate Frankenbeast's `#/smart-swarm` operational topology/Brain Pulse/approvals surface with a clear Smart Swarm successor handoff.
- [x] RED→GREEN: preserve legacy `#/brain-vitals` routing into the same retirement gate and mark navigation copy as retired.
- [x] Update Frankenbeast README to distinguish retained deterministic guardrails from retired operational dashboard ownership.
- [x] Add an ADR defining monorepo retirement scope and why repository archival is unsafe.
- [x] Run focused route/component tests, package lint/typecheck/test/build, relevant repository gates, `git diff --check`, and changed-diff secret scan.
- [ ] Run at most two Codex remediation passes followed by exactly one final audit-only pass; do not remediate after pass three.
- [ ] Commit with David Mendez identity, push normally, open one linked PR, verify exact-head checks/review, and merge normally.
- [ ] Update Frankenbeast repository description/homepage through current authenticated GitHub API evidence and verify read-back.
- [ ] Only after Frankenbeast merge, create an isolated Smart Swarm tracking-doc closeout if issue #189 still requires it; never edit both repositories concurrently.
- [ ] Verify merged route behavior, README/ADR, repository metadata, Smart Swarm tracking evidence, issue closure, and downstream acceptance-gate handoff.

## Orientation evidence

- Canonical task: `t_24bf7b4e`; sole mutable Frankenbeast branch: `fix/189-retire-legacy-dashboard`.
- Exact fetched base: `33ab5c1aa86c5f155ebf7246582d6e920c62d4e2` (`origin/main`).
- Dispatcher worktree initially started at diverged `9fe6e864cf7c4a68c29f1a06c8e69babb47eeb12` (3 local-only / 29 remote-only commits). It was clean and is preserved at `/home/pfkagent/dev/frankenbeast/.worktrees/t_24bf7b4e-stale-base` on `preserved/t_24bf7b4e-stale-base`.
- The registered task path `/home/pfkagent/dev/frankenbeast/.worktrees/t_24bf7b4e` was recreated cleanly at the exact fetched base without mutating the dirty primary checkout.
- Existing implementation PR #3867 for the live Frankenbeast Smart Swarm dashboard is merged; there is no open or existing PR for this task branch.
- Smart Swarm issue #189 is open; downstream live-profile acceptance card `t_76eb9ed2` is dependency-held, not a duplicate editor.
- Frankenbeast repository remains unarchived with description `Deterministic guardrails framework for AI agents` and no homepage; Smart Swarm repository is the verified successor URL `https://github.com/djm204/smart-swarm`.

## Verification evidence before publication

- Strict RED: the new retirement-gate component test failed because the old route mounted the live Smart Swarm dashboard; the navigation-copy test failed against the old canonical-live summary.
- GREEN: focused route/component suite passed 3/3.
- Full `@franken/web` suite passed 904/904 across 87 files; package lint passed with 0 errors (17 pre-existing warnings); package typecheck passed.
- Root `npm run build` passed all 10 workspaces after installing worktree-local dependencies. The first attempt resolved stale declarations from the dirty primary checkout and failed; no source change was made for that environmental failure.
- Documentation integrity passed 16/16; `git diff --check` and the changed-diff credential-pattern scan passed.
- `npm audit --audit-level=high` reports the existing lockfile baseline of 7 advisories (2 moderate, 5 high); this task does not touch dependencies or the lockfile.
- Production Vite bundle built successfully. Live preview/browser evidence showed both `#/smart-swarm` and `#/brain-vitals` rendering the retirement gate, a verified `https://github.com/djm204/smart-swarm` successor link, and no JavaScript console errors. The gate chunk contains no former dashboard implementation.
