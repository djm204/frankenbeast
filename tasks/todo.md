# fbeast dual-mode launch

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

## Current Batch: Codex Hook PR Publish

- [ ] Create a clean branch from `main` for the hook protocol fix instead of stacking on `fix/launch-parity-gaps`.
- [ ] Apply only the hook protocol source/test changes in the clean branch and re-run focused verification there.
- [ ] Commit the isolated patch atomically, push it, and open a draft PR.

## Current Batch: Beast Mode Hardening

- [x] Write and approve the beast-mode hardening design spec covering the full live `franken-orchestrator` surface.
- [x] Write a concrete implementation plan for in-place beast hardening with TDD-first execution chunks.
- [ ] Close config and flag no-op gaps on the live beast CLI surface.
- [ ] Replace permissive module fallback behavior on required beast paths with real implementations or hard failures.
- [ ] Implement explicit, tested resume semantics for the main beast `run` path.
- [ ] Harden command-family execution paths for `run`, `issues`, `chat`, `chat-server`, `skill`, `security`, `network`, and `beasts`.
- [ ] Make the beast verification matrix authoritative with passing focused integration and E2E coverage.

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
- 2026-04-26: Approved the live benchmark boundary for real `Codex CLI` and real `Gemini CLI` only, with recurring A/B runs that compare pure baseline client behavior against the same task with Frankenbeast installed.
- 2026-04-26: Wrote the benchmark design spec at `docs/superpowers/specs/2026-04-26-live-cli-benchmark-pipeline-design.md`, covering the benchmark matrix, corpus tiers, deterministic-first scoring, evidence capture, dedicated benchmark-history storage, trend reporting, and release-gate policy. User spec review remains the next gate before implementation planning.
