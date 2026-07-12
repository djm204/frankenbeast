# Issue #1902 CLI global flags before subcommand

- [x] Inspect issue #1902 and repo instructions.
- [x] Confirm worktree, branch, disk headroom, and current status.
- [x] Reproduce/cover parser behavior with targeted unit tests.
- [x] Implement minimal parser fix for global flags before subcommands.
- [x] Run targeted verification (`npm run test --workspace @franken/orchestrator -- tests/unit/cli/args.test.ts`).
- [ ] Commit, push branch, open PR, and request Codex review.
- [ ] Report PR URL, verification, disk, and blockers.

Notes:
- fbeast MCP tools were not available in this worker tool schema, so normal file/git/GitHub tooling was used.
- `npm run typecheck --workspace @franken/orchestrator` was attempted after installing dependencies but failed because local workspace packages such as `@franken/types`/`@franken/observer` have no built type declarations in this worktree.
