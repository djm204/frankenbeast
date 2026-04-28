# Todo Crash Investigation

- [x] Check for an existing task-specific progress document and create one if missing.
- [x] Inspect `tasks/todo.md`, active progress docs, and current worktree state for signs of dropped work.
- [x] Correlate unchecked todo items with actual code/doc changes to identify which task was left half-baked.
- [x] Record the conclusion and evidence in the progress doc and review notes.

## Acceptance Criteria

- The likely half-baked task or tasks are identified from repo evidence rather than guesswork.
- The conclusion explains which checklist items in `tasks/todo.md` appear stale, interrupted, or inconsistent with the worktree.
- The investigation leaves a persistent record of what was found.

## Findings

- Half-baked thread 1: proxy-mode MCP work in `packages/franken-mcp-suite`.
- Evidence:
- `tasks/todo.md` does not mention proxy mode at all.
- `docs/superpowers/plans/2026-04-21-fbeast-proxy-mcp-server.md` defines the same work now sitting dirty in the tree: `fbeast-proxy`, `search_tools` / `execute_tool`, `init --mode=proxy`, uninstall cleanup, and docs updates.
- Matching dirty files include `packages/franken-mcp-suite/src/servers/proxy.ts`, `packages/franken-mcp-suite/src/shared/tool-registry.ts`, `packages/franken-mcp-suite/src/cli/init.ts`, `packages/franken-mcp-suite/src/cli/init-options.ts`, `packages/franken-mcp-suite/src/cli/uninstall.ts`, `packages/franken-mcp-suite/src/cli/init.test.ts`, `packages/franken-mcp-suite/src/cli/uninstall.test.ts`, `packages/franken-mcp-suite/package.json`, `packages/franken-mcp-suite/README.md`, and `docs/walkthrough-mcp-suite.md`.
- Half-baked thread 2: Beast Mode Hardening CLI no-op cleanup in `packages/franken-orchestrator`.
- Evidence:
- The open Beast Mode Hardening batch in `tasks/todo.md` still has `Close config and flag no-op gaps on the live beast CLI surface.` unchecked.
- Dirty orchestrator changes directly match that subtask: `packages/franken-orchestrator/src/cli/args.ts` removes `provider` and `dashboard` subcommands from usage/parsing, `packages/franken-orchestrator/src/cli/run.ts` removes their no-op handlers, and the corresponding `dashboard-cli` / `provider-cli` source and test files are deleted.
- The untracked `docs/guides/run-cli-beast.md` appears to be the docs side of the same interrupted Beast-mode hardening thread.
