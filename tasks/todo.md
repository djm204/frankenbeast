# fbeast dual-mode launch

## Current Batch: Analytics Dashboard Release Commit

- [x] Confirm the analytics dashboard implementation worktree and release-please trigger requirements.
- [x] Re-run focused backend/frontend verification for the files being committed.
- [x] Prepare a Conventional Commit for the analytics dashboard update.
- [x] Record final commit and verification evidence.

## Review

- Prepared commit subject `feat(web): add observer analytics dashboard`; `feat` is a release-please changelog/bump type and will be evaluated when this branch lands on `main`.
- Fresh verification passed on 2026-04-28:
  - `npm test -- --run tests/unit/analytics/analytics-service.test.ts tests/unit/http/analytics-routes.test.ts` in `packages/franken-orchestrator`
  - `npm test -- --run tests/vite-config.test.ts src/lib/analytics-api.test.ts src/pages/analytics-page.test.tsx` in `packages/franken-web`
  - `npm run typecheck` in both touched packages
  - `npm run build` in both touched packages
  - `npm run test:root -- tests/unit/release-please-config.test.ts`

## Current Batch: Analytics JSON Parse Fix

- [x] Identify why analytics API responses are not JSON in the dashboard.
- [x] Add a regression test for Vite `/api` proxying.
- [x] Patch the Vite dev proxy configuration.
- [x] Run targeted tests/typecheck/build.
- [x] Update progress notes with verification evidence.

## Review

- Fixed the analytics JSON parse error root cause: Vite was not proxying `/api` to the backend in same-origin mode.
- Added `packages/franken-web/tests/vite-config.test.ts` so `/api` proxy coverage stays explicit.
- Restarted the web dev server at `http://127.0.0.1:5175/`.
- 2026-04-28 release-commit verification rerun passed:
  - `npm test -- --run tests/unit/analytics/analytics-service.test.ts tests/unit/http/analytics-routes.test.ts` in `packages/franken-orchestrator`
  - `npm test -- --run tests/vite-config.test.ts src/lib/analytics-api.test.ts src/pages/analytics-page.test.tsx` in `packages/franken-web`
  - `npm run typecheck` in `packages/franken-orchestrator`
  - `npm run typecheck` in `packages/franken-web`
  - `npm run build` in `packages/franken-orchestrator`
  - `npm run build` in `packages/franken-web`

## Current Batch: Observer Analytics Dashboard Implementation

- [x] Confirm scope from existing progress note and approved dashboard spec.
- [x] Add backend analytics API tests for summary, sessions, filtered events, and event details.
- [x] Add frontend analytics client/page tests for live route, summary rendering, filters, and drawer.
- [x] Implement normalized read-only analytics service and `/api/analytics/*` routes.
- [x] Wire analytics routes into the chat server/dashboard backend startup.
- [x] Implement the web analytics client, page, shell route, and styles.
- [x] Run targeted backend/frontend tests and typechecks.
- [x] Review diff for scope, update progress notes, and capture final verification.

## Review

- Implemented a read-only observer analytics dashboard under the live Analytics route.
- Verification passed:
  - `npm test -- tests/unit/analytics/analytics-service.test.ts tests/unit/http/analytics-routes.test.ts`
  - `npm test -- src/lib/analytics-api.test.ts src/pages/analytics-page.test.tsx`
  - `npm run typecheck` in `packages/franken-orchestrator`
  - `npm run typecheck` in `packages/franken-web`
  - `npm run build` in `packages/franken-orchestrator`
  - `npm run build` in `packages/franken-web`
- Local web dev server started at `http://127.0.0.1:5174/`.

## Current Batch: Agent Systems Audit

- [x] Check for a matching progress document and create it if missing.
- [ ] Verify secure code execution from source and tests, not docs.
- [ ] Verify deterministic state, checkpointing, replay, and memory from source and tests.
- [ ] Verify identity boundaries, scoped permissions, and HITL enforcement from source and tests.
- [ ] Verify observer/monitor pattern behavior from source and tests.
- [ ] Document legitimate capabilities, gaps, and verification evidence.

## Current Batch: Context Remaining Question

- [x] Check for a matching progress document and create it if missing.
- [x] Inspect the local Codex CLI/docs for any built-in context-remaining indicator.
- [x] Answer with the supported way to check context remaining, or state clearly if there is no exposed indicator.

## Current Batch: Todo Crash Investigation

- [x] Check for an existing task-specific progress document and create one if missing.
- [x] Inspect `tasks/todo.md`, active progress docs, and current worktree state for signs of dropped work.
- [x] Correlate unchecked todo items with actual code/doc changes to identify which task was left half-baked.
- [x] Record the conclusion and evidence in the progress doc and review notes.

## Current Batch: Progress Doc Rule

- [x] Check the repo for an existing progress-doc convention and create a task-specific progress file for this work.
- [x] Update persistent agent guidance so every assigned task requires a matching `tasks/<name-of-task>-progress.md` checklist.
- [x] Record the new rule in `tasks/lessons.md`.
- [x] Re-read the changed files, update the new progress doc with final status, and record review notes.

- [x] Chunk 1: MCP contract and startup smoke harness
- [x] Chunk 2: memory/observer/governor adapters
- [x] Chunk 3: planner/critique adapters
- [x] Chunk 4: firewall/skills and real hook runtime
- [x] Chunk 5: MCP docs and launch proof
- [ ] Chunk 6: Beast CLI parity
- [ ] Chunk 7: Beast activation and risk gate
- [ ] Chunk 8: dual-mode release gate

## Current Batch: PR 279 Review Comments

- [x] Add a failing `observer-adapter` regression test that proves audit hashes remain chained through `parent_hash`.
- [x] Add a failing `uninstall` regression test that proves non-interactive / closed-stdin execution does not hang and defaults to preserving `.fbeast/`.
- [x] Implement the minimal `franken-mcp-suite` fixes that satisfy those two review threads without expanding scope.
- [x] Re-run focused `franken-mcp-suite` tests and typecheck, then record the verification results here.

## Current Batch: `.fbeast` Storage Migration Recovery

- [x] Update remaining orchestrator runtime path literals that still reference `.frankenbeast` storage.
- [x] Update orchestrator tests and fixtures to assert `.fbeast` as the canonical runtime directory.
- [x] Re-run focused orchestrator storage/CLI/init/cache tests and record the verification results.

## Current Batch: Repo-Wide `.fbeast` Canonicalization

- [x] Migrate remaining live storage code from `.frankenbeast` to `.fbeast`, starting with `packages/franken-observer`.
- [x] Update active tests to assert `.fbeast` runtime storage paths across affected packages.
- [x] Update active contract docs that describe the current filesystem layout.
- [x] Add an ADR documenting `.fbeast/` as the canonical runtime directory while preserving `FRANKENBEAST_*` env vars.
- [x] Re-run focused verification for observer/orchestrator packages and record results.

## Current Batch: Codex Hook Exit 127

- [x] Reproduce the live Codex hook failure and confirm whether the break is missing scripts, missing `fbeast-hook`, or observer runtime wiring.
- [x] Add a focused `franken-mcp-suite` regression test for hardened Codex hook generation.
- [x] Implement the minimal hook-generation fix without disturbing unrelated MCP suite behavior.
- [x] Re-run focused `franken-mcp-suite` tests and record the verification results.
- [x] Repair the local repo hook state if the code fix confirms the current `.codex/hooks.json` wiring is stale.

## Current Batch: Codex Hook Protocol Failures

- [x] Reproduce the live `PreToolUse` and `PostToolUse` failures from the current repo hook scripts instead of guessing from the UI.
- [x] Add focused `franken-mcp-suite` regression tests that prove denied Codex pre-hooks return Codex-formatted deny JSON with exit `2`, and Codex post-hooks stay silent on stdout.
- [x] Implement the minimal hook-script fix in the generator and repair the local generated Codex scripts.
- [x] Re-run focused `franken-mcp-suite` tests plus live shell-script replays and record the verification results.
- [x] Add the missing allow-path regression proving successful Codex `PreToolUse` hooks stay silent.
- [x] Remove unsupported Codex allow output from the generated and live repo-local pre-tool scripts, then re-verify allow/deny/post behavior.

## Current Batch: Codex Hook PR Publish

- [ ] Create a clean branch from `main` for the hook protocol fix instead of stacking on `fix/launch-parity-gaps`.
- [ ] Apply only the hook protocol source/test changes in the clean branch and re-run focused verification there.
- [ ] Commit the isolated patch atomically, push it, and open a draft PR.

## Current Batch: MCP Suite Proxy Recovery

- [x] Check for a matching progress document and create it if missing.
- [x] Read the dropped-task forensics and proxy MCP implementation plan.
- [x] Verify the interrupted proxy MCP implementation state with focused tests.
- [x] Complete missing proxy MCP source, CLI, uninstall, and docs work.
- [x] Re-run focused `franken-mcp-suite` tests plus typecheck and record evidence.

## Current Batch: Beast Mode Hardening

- [x] Write and approve the beast-mode hardening design spec covering the full live `franken-orchestrator` surface.
- [x] Write a concrete implementation plan for in-place beast hardening with TDD-first execution chunks.
- [x] Close config and flag no-op gaps on the live beast CLI surface.
- [x] Replace permissive module fallback behavior on required beast paths with real implementations or hard failures.
- [x] Implement explicit, tested resume semantics for the main beast `run` path.
- [x] Harden command-family execution paths for `run`, `issues`, `chat`, `chat-server`, `skill`, `security`, `network`, and `beasts`.
- [x] Make the beast verification matrix authoritative with passing focused integration and E2E coverage.

## Current Batch: Live CLI Benchmark Pipeline Design

- [x] Explore the current `franken-mcp-suite`, observer, and orchestrator surfaces for cost, trace, and eval primitives relevant to benchmarking.
- [x] Define the live-client scope as real `Codex CLI` and real `Gemini CLI`, excluding simulated or provider-only runs from the benchmark dataset.
- [x] Approve the A/B benchmark matrix: baseline client runs with no Frankenbeast versus the same client and task with Frankenbeast installed.
- [x] Approve the recurring benchmark design for corpus tiers, deterministic-first scoring, benchmark storage, trend reporting, and release gates.
- [x] Write and self-review the benchmark design spec in `docs/superpowers/specs/2026-04-26-live-cli-benchmark-pipeline-design.md`.
- [ ] User review the written benchmark design spec before implementation planning begins.

## References

- Approved spec: `docs/superpowers/specs/2026-04-10-fbeast-dual-mode-launch-design.md`
- Approved spec: `docs/superpowers/specs/2026-04-24-beast-mode-hardening-design.md`
- Approved spec: `docs/superpowers/specs/2026-04-26-live-cli-benchmark-pipeline-design.md`
- Chunked execution plan: `docs/superpowers/plans/2026-04-10-fbeast-dual-mode-launch-plan.md`

## Notes

- Sequence matters: complete MCP chunks before Beast activation chunks.
- Keep each chunk PR-able, small-targeted, and independently testable.
- Re-check branch ancestry against `main` before starting any implementation batch if the user mentions a fresh merge.

## Review

- 2026-04-27: Crash-forensics review found two half-baked threads. First, a proxy-mode implementation was left mid-flight in `packages/franken-mcp-suite` and matches `docs/superpowers/plans/2026-04-21-fbeast-proxy-mcp-server.md` almost one-for-one: new `fbeast-proxy` server/registry files, `init --mode=proxy`, uninstall cleanup, tests, package bin wiring, and docs updates are all dirty, but no current batch in `tasks/todo.md` tracks them. Second, the unchecked Beast Mode Hardening batch has already started: `packages/franken-orchestrator/src/cli/args.ts`, `run.ts`, and the deleted `provider`/`dashboard` CLI files/tests show the "close config and flag no-op gaps" subtask in progress, with `docs/guides/run-cli-beast.md` likely belonging to the same interrupted hardening/docs thread.
- 2026-04-27: Added a non-negotiable progress-document workflow rule. Future tasks must immediately check for `tasks/<name-of-task>-progress.md`, create it if missing, and keep it updated as the persistent acceptance-criteria checklist.
- 2026-04-27: MCP Suite Proxy Recovery completed from the dropped-task forensics. Proxy mode is implemented in `packages/franken-mcp-suite`, documented, and covered by startup smoke verification that `fbeast-proxy` exposes only `search_tools` and `execute_tool`. Verified via `cd packages/franken-mcp-suite && npm test -- --run src/shared/tool-registry.test.ts src/servers/proxy.test.ts src/cli/init.test.ts src/cli/uninstall.test.ts`, `cd packages/franken-mcp-suite && npm test -- --run src/integration/server-startup.integration.test.ts src/shared/tool-registry.test.ts src/servers/proxy.test.ts src/cli/init.test.ts src/cli/uninstall.test.ts`, `cd packages/franken-mcp-suite && npm run typecheck`, and `cd packages/franken-mcp-suite && npm test` (23 files, 106 tests).
- 2026-04-27: Beast Mode Hardening recovery completed in `packages/franken-orchestrator`. The recovered work removes advertised but non-functional `provider`/`dashboard` top-level CLI commands from the live parser/help surface, adds Beast CLI `resume`/`delete` parity, makes consolidated dependency construction fail explicitly instead of falling back to permissive stubs, gives `frankenbeast run --resume` tested semantics distinct from cold runs, repairs chat-to-Beast tracked-agent wiring tests, and documents the authoritative Beast verification matrix in `docs/guides/run-cli-beast.md`. Verified via `cd packages/franken-orchestrator && npm test -- tests/unit/cli/args.test.ts tests/unit/cli/run.test.ts tests/integration/cli/dep-factory-wiring.test.ts tests/unit/cli/beast-cli.test.ts tests/integration/beasts/agent-routes.test.ts tests/unit/cli/skill-cli.test.ts tests/unit/cli/security-cli.test.ts tests/unit/cli/network-run.test.ts tests/unit/cli/session-issues.test.ts tests/integration/chat/chat-routes.test.ts tests/integration/chat/ws-chat-server.test.ts tests/integration/network/network-cli.test.ts tests/integration/issues/issues-e2e.test.ts tests/e2e/smoke.test.ts` (14 files, 194 tests), `cd packages/franken-orchestrator && npm run typecheck`, and `cd packages/franken-orchestrator && npm test` (213 files passed, 1 skipped; 2085 tests passed, 1 skipped).
- 2026-04-12: Identified two unresolved actionable PR 279 review threads via GitHub connector plus thread-aware `fetch_comments.py`: re-chain `observer-adapter` audit hashes with `parent_hash`, and prevent `fbeast uninstall` from hanging on EOF / non-interactive stdin.
- 2026-04-12: TDD red phase for PR 279 review comments reproduced both issues in `packages/franken-mcp-suite` via `npm test -- --run src/adapters/observer-adapter.test.ts src/cli/uninstall.test.ts`; failures showed unchanged second-entry audit hashes after history mutation and uninstall timing out on closed stdin.
- 2026-04-12: PR 279 review comment fixes verified in `packages/franken-mcp-suite` via:
  `npm test -- --run src/adapters/observer-adapter.test.ts src/cli/uninstall.test.ts`
  `npm test`
  `npm run typecheck`

- 2026-04-11: Chunk 4 green via `npm test -- --run src/servers/firewall.test.ts src/servers/skills.test.ts src/integration/hook.integration.test.ts` and `npm run typecheck` in `packages/franken-mcp-suite`.
- 2026-04-11: Chunk 5 green via `npm test -- --run src/integration/server-startup.integration.test.ts` and `npm run typecheck` in `packages/franken-mcp-suite`.
- 2026-04-12: Reproduced partial storage migration breakage in `packages/franken-orchestrator` via `cd packages/franken-orchestrator && npm test -- --run tests/unit/cli/project-root.test.ts tests/unit/network/secret-backends/local-encrypted-store.test.ts tests/unit/skills/skill-credential-store.test.ts tests/unit/skills/skill-auth.test.ts tests/unit/beasts/process-beast-executor.test.ts`; failures showed code writing `.fbeast` while tests still expected `.frankenbeast`.
- 2026-04-12: Storage migration recovery green in `packages/franken-orchestrator` via:
  `npm test -- --run tests/unit/cli/project-root.test.ts tests/unit/network/secret-backends/local-encrypted-store.test.ts tests/unit/skills/skill-credential-store.test.ts tests/unit/skills/skill-auth.test.ts tests/unit/beasts/process-beast-executor.test.ts`
  `npm test -- --run tests/unit/cache/provider-session-store.test.ts tests/unit/cache/cached-llm-client.test.ts tests/unit/cache/cached-cli-llm-client.test.ts tests/unit/cache/llm-cache-store.test.ts tests/unit/init/init-engine.test.ts tests/unit/init/init-state-store.test.ts tests/unit/init/init-verify.test.ts`
  `npm test -- --run tests/unit/cli/file-writer.test.ts tests/unit/cli/run.test.ts tests/unit/cli/dep-bridge.test.ts tests/unit/cli/chat-attach.test.ts tests/unit/cli/init-command.test.ts tests/unit/cli/design-summary.test.ts tests/unit/cli/network-run.test.ts tests/unit/session/chunk-session.test.ts tests/unit/beasts/execution/config-passthrough.test.ts`
  `GIT_AUTHOR_NAME=Codex GIT_AUTHOR_EMAIL=codex@example.com GIT_COMMITTER_NAME=Codex GIT_COMMITTER_EMAIL=codex@example.com npm test -- --run tests/integration/cli/dep-factory-wiring.test.ts`
  `npm test -- --run tests/unit/cli/project-root.test.ts tests/integration/network/network-cli.test.ts`
  `npm run typecheck`
- 2026-04-12: Repo-wide live storage canonicalization extended to `packages/franken-observer`, active contract docs, and ADR-032. Verified via:
  `cd packages/franken-observer && npm test -- audit-trail-store.test.ts`
  `cd packages/franken-observer && npm run typecheck`
  `cd packages/franken-orchestrator && npm test -- test/cli/cleanup.test.ts`
- 2026-04-24: Codex hook exit `127` is currently reproducible in this repo because `.codex/hooks.json` points at `/home/pfk/dev/frankenbeast/.fbeast/hooks/codex-pre-tool.sh` and `/home/pfk/dev/frankenbeast/.fbeast/hooks/codex-post-tool.sh`, but `.fbeast/hooks/` is absent. This shifts the root-cause investigation from observer internals to broken hook registration / script generation durability.
- 2026-04-24: Hardened Codex hook generation in `packages/franken-mcp-suite` so init now writes Codex hook scripts under `.codex/hooks/` and registers those paths in `.codex/hooks.json`, avoiding the stale `.fbeast/hooks/` target that caused live `PreToolUse` exit `127` failures after local runtime cleanup.
- 2026-04-24: Focused verification for the Codex hook fix passed in `packages/franken-mcp-suite` via:
  `npm test -- --run src/cli/init.test.ts src/cli/uninstall.test.ts`
  `npm run typecheck`
- 2026-04-24: Built `packages/franken-mcp-suite` and verified the compiled `dist/cli/init.js` path by running `runInit({ client: 'codex', hooks: true })` in a temp directory. The generated `.codex/hooks.json` pointed to `.codex/hooks/fbeast-codex-pre-tool.sh` and `.codex/hooks/fbeast-codex-post-tool.sh`, and both files were created.
- 2026-04-24: Repaired the local repo hook state by updating `.codex/hooks.json` to point at `.codex/hooks/fbeast-codex-*.sh`, writing those scripts against `packages/franken-mcp-suite/dist/cli/hook.js`, and marking them executable.
- 2026-04-25: Reproduced the current live Codex hook failures directly from the repo scripts. `printf '%s' '{"tool_name":"rm -rf /tmp/nope"}' | ./.codex/hooks/fbeast-codex-pre-tool.sh` exited `1` with no Codex deny payload because `set -e` aborted on the nonzero hook command substitution before the script could format the denial. `printf '%s' '{"tool_name":"exec_command","tool_response":{"ok":true}}' | ./.codex/hooks/fbeast-codex-post-tool.sh` printed `{"logged":true}` to stdout, which is extraneous hook output and a likely `PostToolUse` protocol violation.
- 2026-04-25: Added `packages/franken-mcp-suite/src/cli/hook-scripts.test.ts` to execute the generated Codex shell scripts with a fake `fbeast-hook` binary. The red phase reproduced both protocol bugs: denied pre-hooks returned exit `1` instead of Codex deny exit `2`, and post-hooks leaked `{"logged":true}` to stdout.
- 2026-04-25: Hook protocol fixes verified via:
  `cd packages/franken-mcp-suite && npm test -- --run src/cli/hook-scripts.test.ts src/cli/init.test.ts src/integration/hook.integration.test.ts`
  `cd packages/franken-mcp-suite && npm run typecheck`
  `printf '%s' '{"tool_name":"rm -rf /tmp/nope","tool_input":{},"session_id":"sess-1"}' | ./.codex/hooks/fbeast-codex-pre-tool.sh; printf 'status=%s\n' $?`
  `printf '%s' '{"tool_name":"exec_command","tool_response":{"ok":true},"session_id":"sess-1"}' | ./.codex/hooks/fbeast-codex-post-tool.sh; printf 'status=%s\n' $?`
- 2026-04-26: Fresh live failure showed this was not an MCP server reload problem. Codex rejected the successful `PreToolUse` response itself: `error: PreToolUse hook returned unsupported permissionDecision:allow`. The generated and local repo pre-tool scripts were still printing `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}` on success.
- 2026-04-26: Added a red-phase regression in `packages/franken-mcp-suite/src/cli/hook-scripts.test.ts` proving allowed Codex pre-tool hooks must exit `0` with no stdout. The test failed exactly because the script emitted the unsupported allow payload.
- 2026-04-26: Allow-path fix verified via:
  `cd packages/franken-mcp-suite && npm test -- --run src/cli/hook-scripts.test.ts src/cli/init.test.ts src/integration/hook.integration.test.ts`
  `printf '%s' '{"tool_name":"exec_command","tool_input":{"cmd":"sed -n 1,10p file"},"session_id":"sess-1"}' | ./.codex/hooks/fbeast-codex-pre-tool.sh; printf 'status=%s\n' $?`
  `printf '%s' '{"tool_name":"rm -rf /tmp/nope","tool_input":{},"session_id":"sess-1"}' | ./.codex/hooks/fbeast-codex-pre-tool.sh; printf 'status=%s\n' $?`
  `printf '%s' '{"tool_name":"exec_command","tool_response":{"ok":true},"session_id":"sess-1"}' | ./.codex/hooks/fbeast-codex-post-tool.sh; printf 'status=%s\n' $?`
- 2026-04-26: Approved the live benchmark boundary for real `Codex CLI` and real `Gemini CLI` only, with recurring A/B runs that compare pure baseline client behavior against the same task with Frankenbeast installed.
- 2026-04-26: Wrote the benchmark design spec at `docs/superpowers/specs/2026-04-26-live-cli-benchmark-pipeline-design.md`, covering the benchmark matrix, corpus tiers, deterministic-first scoring, evidence capture, dedicated benchmark-history storage, trend reporting, and release-gate policy. User spec review remains the next gate before implementation planning.
