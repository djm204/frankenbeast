# PR #2240 closeout progress

- [x] Inspect live GitHub PR state, CI, Codex findings, and Kanban task context.
- [x] Create isolated worktree at `/home/pfkagent/dev/closeout-pr-2240` and set git identity.
- [x] Fix current-head Codex findings for never-store/review persistence and right-to-forget review payload erasure.
- [x] Add/update focused `@franken/brain` sqlite-brain tests.
- [x] Run targeted `@franken/brain` tests/typecheck/lint.
- [x] Commit and push PR branch (`6fd31214dc89db3eec43d68759104ab6a626911a`).
- [x] Reply to and resolve all six Codex review threads from 2026-07-14T23:57:36Z.
- [ ] Trigger fresh current-head Codex review. Blocked by codex-review-loop invocation cap at 8/8; exact attempted command: `CODEX_REVIEW_MAX_INVOCATIONS=8 bash /home/pfkagent/.hermes/skills/codex-review-loop/scripts/codex-review-loop.sh trigger --repo djm204/frankenbeast --pr 2240 --max-invocations 8`.
- [ ] Merge only after fresh current-head Codex gate is approved/clean. Current CI is green and mergeStateStatus is CLEAN at head `6fd31214dc89db3eec43d68759104ab6a626911a`.
- [ ] Comment/block `t_5c3f67f1` with machine-readable metadata.
