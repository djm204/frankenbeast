# #3727 Codex Remediation Progress

- [x] Read live issue #3727, task t_707101f6 comments, PR #3781 state, and all four accepted Codex threads.
- [x] Confirm issue-defined cacheHitRatio remains cacheReadTokens / (cacheReadTokens + promptTokens).
- [x] RED→GREEN: preserve and price Anthropic 1-hour versus 5-minute cache creation.
- [x] RED→GREEN: include cache read/creation in aggregated input totals.
- [x] RED→GREEN: include cache tiers in governor historical repricing.
- [x] RED→GREEN: render cache tiers in MCP observer log and summary responses.
- [x] Run focused tests for types, observer, orchestrator, and MCP suite.
- [x] Run required package verification, lint, typecheck, build, and diff/scope review.
- [ ] Commit as David Mendez <me@davidmendez.dev> and push PR #3781 branch.
- [ ] Reply to and resolve accepted Codex threads.
- [ ] Route exact-head Codex trigger through Approval Cop tier 12 and obtain clean result.
- [ ] Verify exact-head green CI and fully paginated zero unresolved Codex threads.
- [ ] Record terminal Kanban handoff; do not merge.

## Current-head Codex round (0314063e10)
- [x] RED→GREEN: render one-hour cache creation as a subset of aggregate cache creation in MCP observer output (focused test failed on additive wording, then passed 5/5).
- [x] RED→GREEN: preserve and accumulate all cache token fields through managed-chat attachment usage (focused tests failed on dropped fields/missing accumulator, then passed 18/18).
- [ ] Run focused and package verification, commit/push normally, reply/resolve both threads, and obtain a fresh exact-head Codex clean result.
- [ ] Reverify exact-head CI, fully paginated zero unresolved threads, isolation, and no merge.
