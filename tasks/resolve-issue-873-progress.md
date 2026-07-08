# Resolve issue #873 progress

- [x] Read issue, shared lessons, and affected process supervisor code.
- [x] Add a targeted regression test for child exit with grandchild-inherited stdio.
- [x] Implement the minimal supervisor exit handling fix.
- [x] Run targeted tests and package checks.
- [ ] Commit, push, open PR, and complete Codex/CI gate.
- [ ] Merge or block with exact remaining gate; append reusable lessons if discovered.

Checks run:
- RED: `npm test -- tests/unit/beasts/execution/process-supervisor.test.ts -t "grandchild keeps inherited stdio"` failed before implementation.
- GREEN: `npm test -- tests/unit/beasts/execution/process-supervisor.test.ts` passed.
- `npm test` in `packages/franken-orchestrator` passed: 239 files / 2625 tests after Codex fixes.
- `npm run typecheck` in `packages/franken-orchestrator` passed after root workspace build prepared dependent package declarations.
- `npm run lint` in `packages/franken-orchestrator` passed with existing warnings.
- `npm run build` at repo root passed: 10/10 turbo build tasks successful.
