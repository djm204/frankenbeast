# Issue #3813 governed smart-swarm actions progress

- [x] Verify the authorized isolated worktree, branch, and stacked base `a19dfb016adafe5c7f93b506035a5e59bb289b22`.
- [x] Read issue #3813, the #3812 runtime contract, runtime routes, Hermes adapter, auth/rate-limit patterns, and supported Hermes Kanban CLI operations.
- [x] Add provider-neutral runtime action schemas, capability mapping, typed results, correlation/idempotency/causation fields, and adapter action boundary using a failing contract test first.
- [x] Add governed HTTP action execution with operator auth, runtime validation/body bounds, capability checks, duplicate suppression, redacted audit evidence, and fail-closed high-risk governor handling using failing route tests first.
- [x] Implement Hermes blocker and task lifecycle actions via fixed `hermes kanban` argv calls with bounded execution/output and postcondition reads using failing isolated-home tests first.
- [x] Add allowlisted Hermes policy actions and explicit unsupported approval responses using failing tests first.
- [x] Run 43 focused runtime tests plus root lint/typecheck/build gates; full root tests retain unrelated baseline CLI test failures reproduced unchanged in the exact #3821 worktree.
- [x] Self-review the full diff for shell interpolation, direct SQLite mutation, auth/governor bypasses, secret/path leakage, and unrelated/Hive Brain changes; verify all supported Hermes operations against an isolated test home.
- [x] Re-check PR #3821 and rebase onto its exact current head `7b98df2486da583dedb1971b9348a7c0290742a6`, preserving its runtime review fixes.
- [x] Commit the initial implementation with David Mendez <me@davidmendez.dev>, push, and open PR #3827 linked to #3813 without merging.
- [x] Reconstruct PR #3827 review state and remediate all six current-head Codex findings with focused red-green tests: provider-neutral opaque task IDs, isolated Hermes command environments, honest cancellation capability, production governor wiring, and durable SQLite audit/idempotency state. Verified the unblock finding against live `hermes kanban unblock --help`; `--reason` is supported and requires no code change.
- [x] Run the 49 focused runtime tests, 13 chat-server tests, focused CLI governor-wiring test, package typecheck/build, and root lint/typecheck/build successfully. Root `npm run test` still reports seven unrelated established full-suite failures (three load-sensitive timeouts, network health environment state, two CLI mock-order failures, and one CR-progress timing failure); all changed-path focused tests pass independently.
- [ ] Commit and push the Codex remediation with David Mendez <me@davidmendez.dev>.
- [ ] Run the real GitHub `@codex review` loop to a clean exact-current-head result, green CI or an explicit no-checks state, and zero unresolved Codex threads.
- [ ] Post the exact final handoff to PM `t_9f813264` and root `t_25558345`, then block the task for review.
