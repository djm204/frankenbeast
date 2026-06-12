# Review Action Items Test Mocks Progress

Worktree: `.worktrees/review-action-items-test-mocks`
Branch: `codex/review-action-items-test-mocks`
Base: `codex/review-action-items-p0`
Issues: #327, #328

## Checklist

- [x] Inspect `packages/franken-orchestrator/tests/unit/skills/cli-skill-executor.test.ts` and related types.
- [x] Replace mock-factory sprawl with a typed test builder or fixture DSL.
- [x] Remove unnecessary `as any` and suspicious unsafe casts in touched tests.
- [x] Prefer `satisfies` or typed mocks to preserve compile-time compatibility.
- [x] Run targeted tests for changed files.
- [x] Run package typecheck if feasible.
- [ ] Run Codex review loop and fix findings.
- [ ] Commit changes referencing #327 and #328.

## Disk constraints

- Do not install dependencies unless required.
- Do not create additional worktrees.
