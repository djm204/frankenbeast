# Frankenbeast Agent Ramp-Up

> Agent-oriented companion to `docs/RAMP_UP.md`. Keep this current when structural changes affect how agents should read, modify, or verify the repository.

## Start Here

- Read `docs/RAMP_UP.md` first for the package map, Beast Loop overview, CLI surfaces, build/test commands, and known limitations.
- Treat live source and focused tests as the source of truth when older docs disagree.
- Prefer the narrowest package-level test command that covers your change, then run broader root checks when the change crosses package boundaries.

## Active Decisions

- **Workspace shape:** the repo currently has 10 first-party packages under `packages/`, including `franken-mcp-suite` (`@fbeast/mcp-suite`) and `live-bench` (`@fbeast/live-bench`). Do not use the old “8 packages / MCP deleted” summary as current architecture.
- **Fail-closed deps:** required Beast dependency assembly is fail-closed. `createBeastDeps()` failures are surfaced by `createCliDeps()` instead of being converted into permissive runtime success stubs. Unsafe safety-module stubs require the explicit `FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES=1` opt-out.
- **Resume semantics:** cold `frankenbeast run` starts from cleared checkpoint/chunk-session state. Use `--resume` only to continue an interrupted run with existing checkpoint data; without that data it fails fast.
- **ADR anchors:** ADR-033 covers explicit resume/fail-closed dependency assembly, ADR-036 covers sandboxed Beast execution, and ADR-038 covers fail-closed safety-module loading.

## Agent Workflow Notes

- Before changing runtime behavior, inspect the corresponding tests under the affected package and add or update focused coverage first when practical.
- Before changing documentation, check for stale duplicate claims in the same document and add a lightweight doc regression test when the claim previously regressed.
- Keep PRs issue-scoped: one issue, one branch, one PR, with `Closes #<issue>` in the PR body when the PR should close the issue.
