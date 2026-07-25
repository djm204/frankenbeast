# Issue #3703 Hive Brain governed dispatch progress

- [x] Verify #3703 is open and unassigned; verify #3700/#3701 dependencies merged.
- [x] Start `resolve/issue-3703-governed-dispatch` from current `origin/main`.
- [x] Trace legacy and BrainConversation REST/WebSocket dispatch, approval, BeastDispatchService, executor, and governor seams.
- [x] Add regression coverage proving BrainConversation dispatch cannot bypass an unapproved/denied dispatch outcome; record the docs contract RED first.
- [x] Confirm the #3701 compatibility projection already routes central turns through the shared seam, avoiding a redundant Brain-only mechanism and #3702 scope.
- [x] Update architecture, ramp-up/package docs, ADR-041, and focused docs tests.
- [x] Run focused tests, package/full typecheck, and build; self-review the diff.
- [ ] Commit with the required identity, push, and open one PR with `Closes #3703` and API compatibility statement.
- [ ] Drive CI and the current-head GitHub Codex review loop to clean; resolve all Codex threads.
- [ ] Merge, post root evidence, append compact shared lessons, and complete the Kanban handoff.

## Verification notes

- Focused REST BrainConversation dispatch and denial-replay regression: pass.
- Focused WebSocket rejection cleanup regression: pass.
- Documentation contract, `npm run lint`, `npm run typecheck`, and `npm run build`: pass.
- The complete root unit suite passed 4,477 tests but hit isolated test timeouts; each timed-out test passed alone. The two pre-existing chat concurrency timeouts reproduce unchanged on clean `origin/main` and are outside #3703.
- An independent review concern that Beast `pending_approval` is not converted into chat approval state was assessed as non-blocking: Beast-run approval remains governor/executor-owned by design, while the test separately verifies canonical chat-approval admission. ADR-041 now states that boundary explicitly.
