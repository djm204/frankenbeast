# Chunk 07: Root Integration Tests

## Objective

Add or update root-level integration tests that prove the execution gap is closed across the whole framework. These tests sit at `tests/integration/` in the root repo and verify cross-module contracts work end-to-end: user input flows through firewall, planner creates tasks, skills execute them, and results come back.

## Context

- Design doc: `docs/plans/2026-03-05-execute-task-workflow-design.md`
- Chunks 01-06 must be complete
- Root integration tests: `tests/integration/`
- Root test command: `npm test` (from the frankenbeast root)
- These tests may already exist — check before duplicating
- The root integration tests use real module imports (not in-memory fakes)
- However, they still mock the LLM client (no real API calls in tests)

## TDD Process

1. Check existing root integration tests for execution coverage
2. Write new integration test that exercises the full pipeline with skill execution
3. Run `npm test` from root — confirm PASS
4. Commit

## Success Criteria

- [ ] Integration test proves: input → firewall → planner → execute skills → closure → result with output
- [ ] Integration test verifies `TaskOutcome.output` is populated (not undefined)
- [ ] Integration test verifies `BeastResult.status === 'completed'` for successful runs
- [ ] All root integration tests pass: `npm test`
- [ ] All orchestrator tests still pass: `cd franken-orchestrator && npx vitest run`

## Verification Command

```bash
npm test
```

Expected: ALL root-level integration tests pass.

## Hardening Requirements

- Integration tests must NOT make real API calls (mock the LLM client)
- Integration tests must NOT require Docker services (ChromaDB, etc.)
- Integration tests should verify the contract between orchestrator and skills module
- Test that `BeastResult.taskResults` contains output from skill execution
- If root integration tests already cover execution (with the old stub), update assertions to check for real output
- Do NOT duplicate what E2E tests in Chunk 06 already cover — focus on cross-module boundaries
