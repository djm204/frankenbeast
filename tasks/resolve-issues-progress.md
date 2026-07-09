# Resolve issues progress: #518 hard-coded test credentials

- Issue: https://github.com/djm204/frankenbeast/issues/518
- Branch: resolve/issue-518-hard-coded-test-credentials
- Repository: djm204/frankenbeast

## Checklist

- [x] Create issue-specific progress document
- [x] Load issue details for issue 518 (security placeholder credentials)
- [x] Identify all hard-coded test credential placeholders in tests and docs
- [x] Add env-backed test credential loader for orchestrator tests
- [x] Replace hard-coded placeholder values in tests with env-backed values
- [x] Update docs/usage examples to avoid inline hard-coded placeholders
- [x] Add test fixture example file for `.env.test`
- [x] Run focused tests for touched files *(attempted; see validation note)*
- [x] Validate all updates are scoped to issue #518

## Validation notes

- Focused orchestrator tests pass with `npm --workspace @franken/orchestrator run test -- --run tests/integration/beasts/agent-routes.test.ts tests/integration/beasts/beast-daemon.test.ts tests/integration/beasts/beast-routes.test.ts tests/integration/beasts/beast-security.test.ts tests/integration/beasts/sse-stream.test.ts tests/integration/chat/chat-routes.test.ts tests/integration/chat/chat-server.test.ts tests/integration/http/control-plane-auth.test.ts tests/unit/chat/beast-daemon-dispatch-adapter.test.ts tests/unit/cli/run.test.ts tests/unit/http/chat-app-beast-daemon-proxy.test.ts tests/unit/http/chat-server-comms.test.ts tests/unit/http/dashboard-routes.test.ts tests/unit/http/dashboard-static-server.test.ts tests/unit/init/init-wizard.test.ts tests/unit/network/secret-resolver.test.ts` (16 files, 241 tests).
- `packages/franken-orchestrator/tests/support/test-credentials.ts` now loads `.env.test` when present and falls back to placeholder defaults.
- `.env.test` is intentionally ignored and documented via `.env.test.example` with blank sensitive values + `.gitignore`.
- One-off hard-coded placeholder values were removed from touched tests/docs and replaced with `testCredential('...')` calls.
