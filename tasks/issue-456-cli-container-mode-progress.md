# Issue #456 CLI Container Mode Progress

- [x] Created isolated worktree `/home/pfkagent/dev/deploy-beasts-wt/issue-456` from `origin/main`.
- [x] Inspect CLI parser and beast CLI implementation.
- [x] Add `--mode process|container` parsing for `beasts create`/`spawn`.
- [x] Validate missing Docker runtime produces clear CLI error for container mode.
- [x] Render container-specific fields in status/logs defensively when present.
- [x] Add/update tests and help output coverage.
- [x] Run targeted tests and relevant package checks.
- [x] Run Codex review loop until all-clear equivalent.
- [ ] Push branch, open PR with `Closes #456`, and merge when eligible.

Notes:
- fbeast MCP tools referenced in AGENTS.md are not available in this Hermes session/toolset.
- #455 may add richer container metadata fields later; this issue should remain logically separate and render those fields defensively if present.
- Standalone `codex` CLI review was attempted but blocked by `codex doctor`: no Codex credentials found. Used a Codex-model Hermes review loop instead; first pass found two issues, both fixed; second pass returned `No issues found`.
- Checks passed: `npm --workspace franken-orchestrator test -- tests/unit/cli/args.test.ts tests/unit/cli/beast-cli.test.ts`, `npm run typecheck`, `npm run build`.
