# Live CLI Benchmark Progress

## Goal

Implement `@fbeast/live-bench`, a recurring real-client benchmark runner for Codex CLI and Gemini CLI comparing baseline versus Frankenbeast-enabled runs.

## Source Plan

- Implementation plan: `docs/superpowers/plans/2026-05-23-live-cli-benchmark-pipeline.md`
- Source design: `docs/superpowers/specs/2026-04-26-live-cli-benchmark-pipeline-design.md`

## Ground Rules

- Keep benchmark orchestration in a dedicated package above `@fbeast/mcp-suite`; do not move benchmark storage/reporting into the suite.
- Use TDD for code chunks: write failing tests, verify RED, implement, verify GREEN.
- Keep real Codex/Gemini CLI tests opt-in; default tests must pass without live CLIs or credentials.
- Commit each chunk independently after targeted verification.

## Chunks

- [x] Chunk 1: Package skeleton and typed domain model.
- [x] Chunk 2: Corpus loader and validation.
- [x] Chunk 3: Fixture workspace provisioning.
- [ ] Chunk 4: Client adapter contract and fake adapter harness.
- [ ] Chunk 5: Baseline/fbeast client configuration isolation.
- [ ] Chunk 6: Real Codex and Gemini CLI adapters.
- [ ] Chunk 7: Deterministic scoring pipeline.
- [ ] Chunk 8: Append-only benchmark warehouse.
- [ ] Chunk 9: Matrix runner and evidence collection.
- [ ] Chunk 10: CLI command, report, and gate policy.
- [ ] Chunk 11: Documentation and recurring-run handoff.

## Verification Log

- 2026-05-23: Progress document created before implementation work.
- 2026-05-23: Chunk 1 package skeleton and typed domain model implemented with TDD. RED: `npm run typecheck` failed with TS18003 before `src` existed. GREEN: `npm test -- --run tests/types.test.ts` passed (1 test) and `npm run typecheck` passed in `packages/live-bench`.
- 2026-05-23: Chunk 2 corpus loader and validation implemented with TDD. RED: `npm test -- --run tests/corpus-loader.test.ts` failed because `src/corpus/loader.js` did not exist. GREEN: `npm test` passed (2 files, 5 tests) and `npm run typecheck` passed in `packages/live-bench`.
- 2026-05-23: Chunk 3 fixture workspace provisioning implemented with TDD. RED: `npm test -- --run tests/workspace-provisioner.test.ts` failed because `src/workspace/fixture-store.js` did not exist. GREEN: `npm test` passed (3 files, 9 tests) and `npm run typecheck` passed in `packages/live-bench`.
