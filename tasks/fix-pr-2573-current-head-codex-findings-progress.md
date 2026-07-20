# PR #2573 current-head Codex findings progress

- [x] Inspect live PR head and all five Codex findings.
- [x] Trace affected definitions, usages, and existing tests.
- [x] Preserve and validate explicit direct-run `agentRole` / `requestedTools` policy fields.
- [x] Reject `skills` arrays containing any non-string entry.
- [x] Make embedded chat Beast services use the chat `SkillManager` directory.
- [x] Resolve selected runtime descriptor IDs to trusted parent skill manifests.
- [x] Keep prompt-only empty tool manifests out of executable MCP aliases.
- [x] Run focused regression tests.
- [x] Run typecheck, build, and lint.
- [x] Review the final diff and working tree.
- [x] Commit and push the branch.
- [x] Reply to and resolve all five listed Codex threads.
- [x] Verify remote head and unresolved-thread state.

Evidence:
- Affected-package validation: typecheck, build, lint (warnings only), and 3919/3919 tests passed.
- Independent review found and prompted a fail-closed bare descriptor/skill ID collision regression; a follow-up Codex CLI review reported no actionable issue.
- GitHub CI passed `build-test-lint (1337)` and `publish smoke (pack + offline install + run)` for code head `16be07954dec518883b2ce6f4e285b9b841950e7`.
- All five target Codex findings were answered; unresolved Codex-authored thread count is zero.
