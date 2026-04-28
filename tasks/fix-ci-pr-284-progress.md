# Fix CI PR 284 Progress

- [x] Load project context and scan the CI-fix request.
- [x] Confirm local worktree has unrelated audit changes that must be preserved.
- [x] Identify the failing GitHub Actions check for PR 284.
- [x] Read the failing job log and isolate the root cause.
- [x] Reproduce the failing test locally.
- [x] Apply the minimal fix without touching unrelated audit work.
- [x] Run focused verification.
- [ ] Commit and push the CI fix to `fix/launch-parity-gaps`.

## Notes

- PR: https://github.com/djm204/frankenbeast/pull/284
- Failing job: https://github.com/djm204/frankenbeast/actions/runs/25027425034/job/73301559902
- Unrelated local changes present before this fix: `tasks/agent-systems-audit-progress.md`, `tasks/todo.md`, and `docs/audits/agent-systems-audit-2026-04-28.md`.
- Root cause: `server-startup.integration.test.ts` rebuilt `dist` in a Vitest `beforeAll`, which timed out under CI's full Turbo load even though Turbo already runs package `build` before `test`; `full-cycle.integration.test.ts` also assumed the `codex` binary exists on GitHub runners.

## Verification

- `cd packages/franken-mcp-suite && npm run typecheck`
- `cd packages/franken-mcp-suite && npm test -- --run src/integration/server-startup.integration.test.ts src/integration/full-cycle.integration.test.ts`
- CI-shaped local reproduction with `CI=true` and `codex` absent from `PATH`: same two integration files passed, with the Codex prerequisite test skipped.
- `cd packages/franken-mcp-suite && npm test`
- `npx turbo run build test lint --filter=@fbeast/mcp-suite`
