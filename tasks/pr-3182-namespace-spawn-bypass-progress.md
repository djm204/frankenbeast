# PR #3182 namespace spawn bypass repair progress

- [x] Rebase work onto current `origin/main` in an isolated branch/worktree.
- [x] Inspect the post-merge Codex finding and current scanner/test behavior.
- [x] Confirm repository policy requires one linked issue per PR and check for duplicates.
- [x] Add a focused namespace/CommonJS `child_process.spawn('crontab', ...)` regression.
- [x] Run the focused regression and capture the expected RED failure.
- [x] Implement the smallest scanner fix.
- [x] Run the focused regression and security lint GREEN verification.
- [x] Run additional relevant scanner verification (`tests/unit/hardcoded-secrets.test.ts`: 49/49 passed).
- [x] Create and verify linked security issue #3513 with P1/security labels.
- [ ] Review diff, commit conventionally, push, and open the follow-up PR.
- [ ] Drive current-head CI and Codex review to green/clean with zero unresolved threads.
- [ ] Merge the follow-up PR and verify the fix is on `main`.
- [ ] Reply to and resolve the original PR #3182 post-merge finding.
- [ ] Record final evidence in the Kanban handoff.

## Verification notes

- Focused RED: the scanner returned success for the CommonJS object-qualified bypass before the implementation change.
- Focused GREEN: targeted Vitest regression passed (1/1); complete hardcoded-secrets suite passed (49/49); `npm run lint:security` passed.
- `node --check scripts/check-hardcoded-secrets.mjs` and `git diff --check` passed.
- Canonical `npm run typecheck` and `npm run build` reached the unrelated web workspace, then failed because an empty ancestor `/home/pfkagent/dev/frankenbeast/node_modules/@types/babel__traverse` directory is visible to TypeScript. The equivalent web typecheck with the worktree-local type root passed: `npm exec --workspace @franken/web -- tsc --noEmit --typeRoots ../../node_modules/@types`.
