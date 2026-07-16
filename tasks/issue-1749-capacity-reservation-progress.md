# Issue 1749 Capacity Reservation Progress

- [x] Read issue #1749 and shared lessons.
- [x] Confirm branch/worktree and Git identity.
- [x] Add failing tests for capacity reservation behavior.
- [x] Implement capacity reservation policy and operator-visible state.
- [x] Run targeted tests and broader package checks.
- [ ] Commit, push, open PR for issue #1749 only.
- [ ] Complete Codex review/CI/merge gates or record blocker.

## Verification
- `npm --prefix packages/franken-orchestrator test -- tests/unit/beasts/capacity-reservation-policy.test.ts tests/unit/beasts/agent-service-capacity.test.ts` — passed.
- `npm run build --workspace @franken/types --workspace @franken/observer --workspace @franken/brain --workspace @franken/critique --workspace @franken/governor --workspace @franken/planner && npm --prefix packages/franken-orchestrator run typecheck` — passed.
- `npm --prefix packages/franken-orchestrator run lint` — passed with pre-existing warnings only.
- `npm --prefix packages/franken-orchestrator test` — passed, 263 files / 3380 tests.
