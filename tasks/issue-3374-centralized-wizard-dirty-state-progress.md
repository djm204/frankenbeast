# Issue 3374 centralized wizard dirty state progress

- [x] Verify issue remains open, is not reserved as `good first issue`, and has no existing PR.
- [x] Read shared lessons and ADR-024.
- [x] Confirm the merged wizard migration centralizes cross-step values, but the wizard slice still lacks canonical dirty state.
- [x] Add failing store tests for cross-step dirty tracking and reset behavior.
- [x] Implement the smallest store-level dirty flag and document its ownership boundary.
- [x] Run targeted tests, package tests, lint, typecheck, and build.
- [ ] Commit, push, and open a PR closing only #3374.
- [ ] Drive CI and the GitHub Codex connector to a current-head clean state.
- [ ] Merge, record any reusable lesson, and finish the Kanban card.
