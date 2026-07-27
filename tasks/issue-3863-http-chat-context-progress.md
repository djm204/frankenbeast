# Issue #3863 HTTP chat context progress

- [x] Read issue #3863, shared lessons, and current chat/server/provider implementations.
- [x] Rebase task work onto fresh current `origin/main` without copying sibling worktree changes.
- [x] Identify a tight live HTTP-server reproduction for default multi-turn context loss.
- [x] Add the regression test and confirm it fails for the reported context-loss symptom.
- [x] Preserve provider-neutral transcript context as the HTTP default.
- [x] Preserve explicit native-session continuation opt-in.
- [x] Run focused chat/server/provider tests.
- [x] Run orchestrator package test, typecheck, lint, and build gates (focused tests green; full test exposed unrelated pre-existing network health failure and resource-sensitive timeouts; typecheck/lint/build green after root dependency build).
- [x] Run root test, typecheck, and build gates (typecheck/build green; test exposed the same unrelated network health failure plus resource-sensitive orchestrator timeouts, whose affected files pass in isolation).
- [x] Verify a live two-turn dashboard/API recall check.
- [x] Self-review the diff and update shared lessons with reusable findings.
- [ ] Commit with required identity, push, and open a PR linked to #3863.
- [ ] Drive exact-head Codex review, CI, and unresolved-thread gates to merge-ready.
- [ ] Leave immutable Kanban handoff without merging.
