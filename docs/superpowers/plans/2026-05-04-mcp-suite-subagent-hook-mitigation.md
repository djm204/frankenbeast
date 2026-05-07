# MCP Suite Subagent Hook Mitigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent fbeast MCP hooks from hanging spawned subagents by making generated hooks bypassable and timeout-bounded.

**Architecture:** Generated shell hooks stay as the client protocol bridge, but they exit immediately for spawned child processes or explicit hook-disable environments. Calls to `fbeast-hook` are wrapped in a small timeout and fail open on timeout so unavailable governance cannot indefinitely block child-agent tool execution. Codex provider env filtering now matches Claude provider by marking spawned CLI processes with `FRANKENBEAST_SPAWNED=1`.

**Tech Stack:** TypeScript, Vitest, generated Bash hook scripts, Codex/Gemini hook protocols.

---

### Task 1: Hook Script Regression Tests

**Files:**
- Modify: `packages/franken-mcp-suite/src/cli/hook-scripts.test.ts`

- [ ] Add tests that generated Codex and Gemini hooks exit `0` and do not invoke `fbeast-hook` when `FRANKENBEAST_SPAWNED=1`.
- [ ] Add tests that generated pre/post hooks return promptly when `fbeast-hook` hangs and `FBEAST_HOOK_TIMEOUT_SECONDS=1`.
- [ ] Run `rtk npm test -- --run src/cli/hook-scripts.test.ts` in `packages/franken-mcp-suite` and verify the new tests fail before implementation.

### Task 2: Provider Env Regression Test

**Files:**
- Modify: `packages/franken-orchestrator/tests/unit/skills/providers/codex-provider.test.ts`

- [ ] Add a test that `CodexProvider.filterEnv()` sets `FRANKENBEAST_SPAWNED=1` without mutating input.
- [ ] Run `rtk npm test -- --run tests/unit/skills/providers/codex-provider.test.ts` in `packages/franken-orchestrator` and verify the new test fails before implementation.

### Task 3: Hook Script Implementation

**Files:**
- Modify: `packages/franken-mcp-suite/src/cli/hook-scripts.ts`

- [ ] Add an early generated Bash bypass for `FRANKENBEAST_SPAWNED=1` and `FBEAST_DISABLE_HOOKS=1`.
- [ ] Wrap `fbeast-hook` calls with `timeout "${FBEAST_HOOK_TIMEOUT_SECONDS:-2}"`.
- [ ] Preserve existing Codex deny JSON and silent allow/post behavior.
- [ ] Treat timeout exit codes `124` and `137` as fail-open `exit 0`.

### Task 4: Codex Provider Env Implementation

**Files:**
- Modify: `packages/franken-orchestrator/src/skills/providers/codex-provider.ts`

- [ ] Change `filterEnv()` to return a copy with `FRANKENBEAST_SPAWNED=1`.
- [ ] Update the existing test expectation that previously described Codex env as unchanged.

### Task 5: Verification

**Files:**
- Modify: `tasks/mcp-suite-subagent-hook-mitigation-progress.md`
- Modify: `tasks/todo.md`

- [ ] Run focused hook tests in `packages/franken-mcp-suite`.
- [ ] Run focused provider tests in `packages/franken-orchestrator`.
- [ ] Run typechecks for both packages.
- [ ] Record exact commands and results in the progress document and todo review.
