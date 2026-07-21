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
- [x] Review diff, commit conventionally, push, and open follow-up PR #3514.
- [ ] Drive current-head CI and Codex review to green/clean with zero unresolved threads.
- [ ] Merge the follow-up PR and verify the fix is on `main`.
- [ ] Reply to and resolve the original PR #3182 post-merge finding.
- [ ] Record final evidence in the Kanban handoff.

## Review-loop status

- CI passed on `a3622104f` with all four required jobs green.
- Six GitHub Codex review invocations were used after the sixth was explicitly approved. Findings from rounds 1-5 were fixed, replied to, and resolved before each retrigger.
- The sixth invocation reported four additional variants: colon destructuring aliases, typed namespace method aliases, angle-bracket typed direct requires, and parenthesized CommonJS namespace aliases. Focused regressions and scanner support for all four were added and pass locally.
- The repaired head still requires replies/thread resolution, a fresh explicitly authorized current-head Codex review, green exact-head CI, and merge.

## Verification notes

- Focused RED: the scanner returned success for the CommonJS object-qualified bypass before the implementation change.
- Focused GREEN: targeted Vitest regression passed (1/1); complete hardcoded-secrets suite passed (49/49); `npm run lint:security` passed.
- `node --check scripts/check-hardcoded-secrets.mjs` and `git diff --check` passed.
- Sixth-round focused RED failed on the first missing colon-alias location; focused GREEN passed 1/1, the complete hardcoded-secrets suite passed 49/49, and `npm run lint:security` passed.
- Canonical `npm run typecheck` and `npm run build` reached the unrelated web workspace, then failed because an empty ancestor `/home/pfkagent/dev/frankenbeast/node_modules/@types/babel__traverse` directory is visible to TypeScript. The equivalent web typecheck with the worktree-local type root passed: `npm exec --workspace @franken/web -- tsc --noEmit --typeRoots ../../node_modules/@types`.
