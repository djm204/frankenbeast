# Issue 3773 Progress

- [x] Revalidate issue #3773, exact branch/base, labels, competing PRs, and Kanban ownership.
- [x] Read repository instructions and shared lessons; inspect the faculty-outcome scan and adjacent bounded-scan pattern.
- [x] Add an encrypted counting regression proving unrelated decision rows cannot expand work beyond the faculty lookback budget.
- [x] Run the focused regression on unchanged code and record RED: one query fetched 4 rows with `LIMIT 100`; expected one query fetching 2 rows with `LIMIT 2`.
- [x] Apply the minimal finite raw-row scan budget while preserving timestamp/id order and corrupt-row handling.
- [x] Run focused and package-level brain tests (499/499 passing).
- [x] Run lint, typecheck, build, and relevant repository gates. Root lint/typecheck/build pass; root tests pass all assertions but remain non-zero on an unrelated pre-existing Codex app-server unhandled rejection in `runtime-contract.test.ts` (targeted reported failures pass in isolation).
- [x] Commit with the required identity, push, and open PR #3934 closing #3773.
- [ ] Drive exact-head GitHub CI and Codex review to clean; resolve all findings.
- [ ] Squash merge, verify issue closure, append reusable lessons, and close the Kanban task.
