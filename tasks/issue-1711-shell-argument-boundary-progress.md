# Issue 1711 Shell Argument Boundary Progress

- [x] Read task, shared lessons, and issue #1711.
- [x] Confirm repository/auth/git identity state.
- [x] Locate existing generated-command helpers and safety tests.
- [x] Add focused argument-boundary regression coverage for generated Git/GitHub/package/helper command paths.
- [x] Implement the smallest code fixes if the new tests expose unsafe construction. (No production fix required; existing execFile/argv boundaries already held.)
- [x] Run targeted tests and broader package/root verification. (Targeted tests, lint, typecheck, and build pass; full orchestrator test pass needs `--maxWorkers=1` and has two unrelated `tests/unit/cli/run.test.ts` resume-base failures.)
- [ ] Open PR closing only #1711.
- [ ] Run real GitHub `@codex review` loop until current-head clean, then merge if CI is green.
- [ ] Append reusable shared lessons if useful and complete/block the Kanban card.
