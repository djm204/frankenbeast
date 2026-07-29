# Jonny design-interview premature exit progress

- [x] Inspect the live run record and complete captured log.
- [x] Trace the unexpected base-branch prompt to its CLI source.
- [x] Confirm the design-interview process spec omits the configured base branch.
- [x] Add and run a failing regression test for non-interactive base-branch selection.
- [x] Pass the configured base branch to the spawned interview CLI.
- [x] Verify focused tests, lint, typecheck, and build.
- [x] Rebuild and restart the local Frankenbeast network.
- [x] Rerun Jonny and verify it advances beyond base-branch resolution.
- [x] Confirm the resulting run status and output artifact.

Live attempt 8 completed successfully without the base-branch prompt, Codex trusted-directory error, or closed-stdin error. It wrote a 4,928-byte design document to the configured worktree output path.