# GitHub Issue Triage Progress

- [x] Load project memory and scan the user request.
- [x] Inventory open GitHub issues for `djm204/frankenbeast`.
- [x] Identify likely stale issues made irrelevant by current repository state.
- [x] Add explanatory comments to the likely stale issues and close them.
- [x] Verify the first-pass closed issue states and record review notes.
- [x] Review every remaining open issue one-by-one against current code/docs.
- [x] Close any additional irrelevant issues with explanatory comments.
- [x] Verify final issue states and record full-review notes.

## Notes

- Scope: close only issues that are clearly no longer relevant from current code/docs evidence.
- Leave still-actionable issues open even if low priority.

## Review

- 2026-04-28: First pass closed 17 likely stale or already-resolved issues after posting explanatory comments:
  - Completed: #22 (`--resume` now has downstream behavior), #32 (git execution now uses argv-safe `execFileSync` plus unsafe-ID rejection).
  - Not planned / obsolete after consolidation: #24, #25, #28, #33, #35, #36, #40, #41, #42, #43, #45, #46, #50, #82, #85.
- Verification: GitHub open issue count is now 48. Sampled closed states confirmed #22 `closed/completed`, #32 `closed/completed`, and #85 `closed/not_planned`, each with 1 comment.
- Correction: this was not a full deep review of all 61 original open issues. It was a full inventory plus deep review of the likely stale subset. The 48 remaining open issues still require issue-by-issue evidence review.
- 2026-04-28: Completed the full issue-by-issue review of the 48 remaining open issues. Closed 7 additional issues after posting comments:
  - Completed: #19 (plan mode now writes `llmGraphBuilder.lastChunks` directly).
  - Not planned / obsolete after consolidation: #55, #61, #63, #64, #70, #80.
- Final verification: GitHub open issue count is now 41. Sampled states confirmed #19 `closed/completed`, #70 `closed/not_planned`, and #80 `closed/not_planned`, each with 1 comment.
- Issues left open still map to live code/docs or have unresolved acceptance criteria after review.
