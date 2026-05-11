# MCP Suite Subagent Hook Mitigation Progress

- [x] Record the implementation plan and current todo entry before source edits.
- [x] Add failing hook-script tests for spawned-agent bypass and hook timeouts.
- [x] Add a failing Codex provider test for `FRANKENBEAST_SPAWNED` env parity.
- [x] Implement hook bypass and timeout behavior in generated Codex and Gemini scripts.
- [x] Implement Codex and Gemini provider spawned-env parity.
- [x] Run focused package tests and typechecks.
- [x] Record verification results and review notes.

## Review

- 2026-05-06: Added generated hook mitigations for inherited subagent hangs. Codex and Gemini hook scripts now exit immediately when `FRANKENBEAST_SPAWNED=1` or `FBEAST_DISABLE_HOOKS=1`, and wrap `fbeast-hook` calls with `timeout "${FBEAST_HOOK_TIMEOUT_SECONDS:-2}"`. Pre-tool timeout exits `124`/`137` fail open with no output; post-tool timeout already fails open through the existing silent `|| true` path.
- 2026-05-06: Added provider env parity so Codex and Gemini spawned CLI providers set `FRANKENBEAST_SPAWNED=1`, matching the existing Claude behavior.
- 2026-05-06: Red phase verified before implementation. `rtk npm test -- --run src/cli/hook-scripts.test.ts` failed in `packages/franken-mcp-suite` on spawned bypass and timeout cases; `rtk npm test -- --run tests/unit/skills/providers/codex-provider.test.ts tests/unit/skills/providers/gemini-provider.test.ts` failed in `packages/franken-orchestrator` on missing `FRANKENBEAST_SPAWNED`.
- 2026-05-06: Green verification passed with `rtk npm test -- --run src/cli/hook-scripts.test.ts` in `packages/franken-mcp-suite` (9 tests), `rtk npm test -- --run tests/unit/skills/providers/codex-provider.test.ts tests/unit/skills/providers/gemini-provider.test.ts` in `packages/franken-orchestrator` (38 tests), plus `rtk npm run typecheck` in both packages.
