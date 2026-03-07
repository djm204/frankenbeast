# Chunk 11: End-to-End Proof

## Objective

Create a minimal test design doc and run `frankenbeast --design-doc <path> --no-pr --budget 2` against it. Verify the full pipeline works: plan phase decomposes into chunks, execution runs at least one chunk, budget tracking shows real values, service labels appear in output.

## Files

- **Create**: `franken-orchestrator/test/e2e/test-design-doc.md` (minimal design doc for testing)
- **Create**: `franken-orchestrator/test/e2e/e2e-pipeline.test.ts`
- **Read**: `franken-orchestrator/src/cli/session.ts`
- **Read**: `franken-orchestrator/src/cli/run.ts`

## Success Criteria

- [ ] Test design doc exists: a trivial task like "Create a file hello.txt with contents 'Hello World'" — minimal scope, fast execution
- [ ] E2E test (can be skipped in CI with `describe.skipIf(!process.env.E2E)`):
  - Spawns `frankenbeast --design-doc test-design-doc.md --no-pr --budget 2 --base-branch test-e2e`
  - Verifies process exits with code 0
  - Verifies stdout contains `[planner]` service label (plan phase ran)
  - Verifies stdout contains `[ralph]` service label (execution phase ran)
  - Verifies stdout contains budget bar with non-zero spend (e.g., `$0.XX / $2.00`)
  - Verifies no raw JSON frames in stdout (no `{"type":"content_block_delta"`)
- [ ] If the E2E test discovers new gaps, document them in `plan-2026-03-07-cli-gaps/DISCOVERED_GAPS.md`
- [ ] Manual smoke test instructions documented in the test file header comment
- [ ] `npm run typecheck` passes

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run test/e2e/e2e-pipeline.test.ts
```

## Hardening Requirements

- The E2E test MUST be skippable — it requires a real `claude` CLI installation and API access
- Use `child_process.spawn` to run frankenbeast as a subprocess (not import)
- Set a generous timeout (5 minutes) — LLM calls are slow
- Clean up any created branches and files after the test (use `afterAll`)
- If the test fails due to rate limiting or API issues, mark as skipped, not failed
- The test design doc should be trivially small — we're testing the pipeline, not the LLM's coding ability
- Do NOT run this against the actual frankenbeast repo — use a temp directory with `git init`
