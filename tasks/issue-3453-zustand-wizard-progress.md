# Issue #3453 Zustand wizard migration progress

- [x] Verify issue labels and confirm no `good first issue` reservation.
- [x] Inspect the accepted ADR, wizard implementation, Zustand store, and existing tests.
- [x] Add a failing architecture regression that requires scoped Zustand selectors throughout wizard form components.
- [x] Replace whole-store wizard subscriptions with scoped selectors.
- [x] Update ADR-024 to describe the implemented architecture and source locations.
- [x] Run targeted tests plus `@franken/web` lint, typecheck, and build.
- [ ] Commit, push, and open a one-issue PR with `Closes #3453`.
- [ ] Drive CI and the real GitHub `@codex review` gate to current-head clean, then merge.
- [ ] Record any durable shared lesson and close the Kanban card.

## Verification

- `npm test` in `packages/franken-web`: 77 files, 693 tests passed.
- `npm run lint` in `packages/franken-web`: passed with 17 pre-existing warnings and no errors.
- `npm run build --workspace @franken/types`: passed (fresh clone prerequisite).
- `npm run typecheck` in `packages/franken-web`: passed.
- `npm run build` in `packages/franken-web`: passed.
- `git diff --check`: passed.
- Added-line static security scan: clean.
