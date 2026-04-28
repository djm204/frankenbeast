# Beast Mode Hardening Progress

## Acceptance Criteria

- [x] Live beast CLI controls are truthful: documented commands/flags either work or are removed from the live surface.
- [x] Required beast runtime dependencies use real implementations or fail explicitly; no silent permissive fallback on required paths.
- [x] `frankenbeast run --resume` has explicit, tested behavior that differs from a cold run.
- [x] Command families have focused proof for `run`, `issues`, `chat`, `chat-server`, `skill`, `security`, `network`, and `beasts`.
- [x] A compact Beast verification matrix is documented and passing.

## Recovery Checklist

- [x] Read `tasks/todo.md` and identify the active Beast Mode Hardening batch.
- [x] Read the approved hardening design and existing launch implementation plan.
- [x] Inspect interrupted orchestrator CLI changes from the dropped-task forensics.
- [x] Reproduce the current focused orchestrator verification state.
- [x] Complete the config/flag no-op gap work already started in the dirty tree.
- [x] Add/repair tests before any new behavior changes.
- [x] Complete runtime fallback hardening and resume semantics.
- [x] Add/repair command-family proof tests and verification matrix docs.
- [x] Run focused orchestrator verification and package typecheck.
- [x] Update `tasks/todo.md` review notes with final evidence.

## Notes

- 2026-04-27: Recovery scope is `packages/franken-orchestrator` Beast Mode Hardening. Existing dirty changes already removed the advertised but non-functional `provider` and `dashboard` top-level subcommands from the parser/help path; this still needs focused verification and likely docs alignment.
- 2026-04-27: Completed the recovered hardening batch. Focused fixes made `run --resume` explicit, cold runs clear checkpoint/chunk-session artifacts, required consolidated dependency construction fails loudly instead of falling back to permissive stubs, and chat Beast dispatch tests now exercise the real tracked-agent path.
- 2026-04-27: Verification passed:
  - `cd packages/franken-orchestrator && npm test -- tests/unit/cli/args.test.ts tests/unit/cli/run.test.ts tests/integration/cli/dep-factory-wiring.test.ts tests/unit/cli/beast-cli.test.ts tests/integration/beasts/agent-routes.test.ts tests/unit/cli/skill-cli.test.ts tests/unit/cli/security-cli.test.ts tests/unit/cli/network-run.test.ts tests/unit/cli/session-issues.test.ts tests/integration/chat/chat-routes.test.ts tests/integration/chat/ws-chat-server.test.ts tests/integration/network/network-cli.test.ts tests/integration/issues/issues-e2e.test.ts tests/e2e/smoke.test.ts` (14 files, 194 tests)
  - `cd packages/franken-orchestrator && npm run typecheck`
  - `cd packages/franken-orchestrator && npm test` (213 files passed, 1 skipped; 2085 tests passed, 1 skipped)
