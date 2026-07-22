# Issue #3587 SQLite worker shutdown progress

- [x] Verify live issue state/labels and confirm it is not reserved as `good first issue`.
- [x] Create isolated worktree from current `origin/main` and configure required git identity.
- [x] Read shared lessons and inspect the worker/public close paths and existing shutdown tests.
- [x] Add a focused regression that delays worker close and proves main-thread timers remain responsive.
- [x] Run the focused regression red and record observed/expected behavior plus root cause on the Kanban card.
- [x] Implement the smallest awaitable, idempotent, bounded asynchronous worker/adapter close contract.
- [x] Cover timeout, error/exit, pending-request settlement, worker ref/unref, and existing flush/order guarantees.
- [x] Run focused tests, observer tests, lint, typecheck, build, and relevant root verification (root tests exposed one unrelated `@franken/brain` timeout under parallel load).
- [ ] Commit, push, open a single-issue PR with `Closes #3587`, and verify CI.
- [ ] Complete the real GitHub `@codex review` loop on the current head and merge only when clean.
- [ ] Append a concise durable shared lesson if useful and close the Kanban card.
