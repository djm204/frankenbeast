# Deploy Beasts Docs Progress

- [x] Create isolated issue-460 worktree from current `origin/main`.
- [x] Inspect issue #460 acceptance criteria and current sprint dependency status.
- [x] Verify current CLI subcommands in `packages/franken-orchestrator/src/cli/args.ts`.
- [x] Add `docs/guides/deploy-beasts.md` with the dashboard deploy flow and current sprint caveats.
- [x] Update `docs/ARCHITECTURE.md` Deployment Modes with beast execution-mode boundaries.
- [x] Correct stale provider/dashboard CLI-stub references in `docs/RAMP_UP.md` and `docs/PROGRESS.md`.
- [x] Reference ADR-036 from ramp-up/progress tracking.
- [x] Run relevant docs/check commands.
- [x] Complete review loop and fix findings.
- [ ] Push branch, open PR with `Closes #460`, and merge when eligible.

## Notes

- `gh auth status` passed for `djm204`.
- `codex doctor` reports no Codex credentials; standalone Codex CLI review is blocked, so use Hermes/Codex-model review loop and document this blocker.
- Dependency status checked 2026-07-01: issue #456 / PR #466 is merged; issues #455, #457, and #459 remain open. Docs must not claim dashboard execution-mode selection, chat/WS container dispatch, or hardened sandbox image behavior as available on current `origin/main`.
- Verification: `git diff --check` passed; `npm run build` passed (10/10 turbo tasks cached); `npm --workspace franken-orchestrator run typecheck` passed after workspace build generated dependent package dists; `npm --workspace @frankenbeast/web run typecheck` passed. Initial typecheck attempts failed before `npm install`/workspace build because `tsc` and dependent package declarations were unavailable.
- Review: standalone `codex` review was unavailable because `codex doctor` reported no credentials. Hermes/Codex-model review checked the diff against issue #460 acceptance, current `args.ts`, and open sprint dependency status; finding to avoid ambiguous Authorization examples was fixed by switching curl examples to `x-frankenbeast-operator-token`. Follow-up review found no blocking issues.
