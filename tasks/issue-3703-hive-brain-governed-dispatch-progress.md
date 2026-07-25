# Issue #3703 Hive Brain governed dispatch progress

- [x] Verify #3703 is open and unassigned; verify #3700/#3701 dependencies merged.
- [x] Start `resolve/issue-3703-governed-dispatch` from current `origin/main`.
- [x] Trace legacy and BrainConversation REST/WebSocket dispatch, approval, BeastDispatchService, executor, and governor seams.
- [x] Add regression coverage proving BrainConversation dispatch cannot bypass an unapproved/denied dispatch outcome; record the docs contract RED first.
- [x] Confirm the #3701 compatibility projection already routes central turns through the shared seam, avoiding a redundant Brain-only mechanism and #3702 scope.
- [x] Update architecture, ramp-up/package docs, ADR-041, and focused docs tests.
- [x] Run focused tests, package/full typecheck, and build; self-review the diff.
- [x] Commit with the required identity, push, and open one PR with `Closes #3703` and API compatibility statement.
- [ ] Drive CI and the current-head GitHub Codex review loop to clean; resolve all Codex threads.
- [ ] Merge, post root evidence, append compact shared lessons, and complete the Kanban handoff.
- [x] Repair final-cap P1 findings: cleanup every REST/WebSocket rejection/replay path before context clear, make aborted interviews terminal, and make rejected tracked agents dispatch-ineligible.

## Verification notes

- Focused REST BrainConversation dispatch and denial-replay regression: pass.
- Focused WebSocket rejection cleanup regression: pass.
- Documentation contract, `npm run lint`, `npm run typecheck`, and `npm run build`: pass.
- The complete root unit suite passed 4,477 tests but hit isolated test timeouts; each timed-out test passed alone. The two pre-existing chat concurrency timeouts reproduce unchanged on clean `origin/main` and are outside #3703.
- An independent review concern that Beast `pending_approval` is not converted into chat approval state was assessed as non-blocking: Beast-run approval remains governor/executor-owned by design, while the test separately verifies canonical chat-approval admission. ADR-041 now states that boundary explicitly.
- Codex rejection-cleanup follow-up now aborts the persisted Beast interview and stops its initializing tracked agent before clearing chat context, through both in-process and daemon-backed adapters; focused unit/integration suites pass.
- Final-cap regressions prove REST cleanup, aborted resume/answer rejection, and delayed tracked-agent dispatch denial; focused suites, lint, typecheck, and build pass. Full test reached 4,500 orchestrator passes with four unrelated timeout failures plus one now-updated tracked-status contract expectation.
