# Review Action Items Reliability Progress

Worktree: `.worktrees/review-action-items-reliability`
Branch: `codex/review-action-items-reliability`
Base: `codex/review-action-items-p0`
Issues: #330, #331, #333, #334

## Checklist

- [x] Inspect filesystem temp-dir tests in `process-beast-executor.test.ts`.
- [x] Harden temp directory cleanup where practical.
- [x] Add deprecation/sunset guidance or rename permanent backward compatibility tests in `process-beast-executor.test.ts`.
- [x] Inspect timer handling in `rate-limit-resilience.test.ts`.
- [x] Normalize fake timer setup/cleanup.
- [x] Inspect regex safety evaluator tests and implementation.
- [x] Add timeout protection or library-backed validation for regex safety analysis.
- [x] Run targeted tests for changed files.
- [x] Run package typecheck if feasible.
- [ ] Run Codex review loop and fix findings.
- [ ] Commit changes referencing #330 #331 #333 #334.

## Disk constraints

- Do not install dependencies unless required.
- Do not create additional worktrees.
- No dependencies installed and no worktrees created.

## Verification completed

- `npm exec vitest run tests/unit/beasts/process-beast-executor.test.ts tests/unit/skills/rate-limit-resilience.test.ts` in `packages/franken-orchestrator`: 63 tests passed.
- `npm exec vitest run tests/unit/evaluators/safety.test.ts` in `packages/franken-critique`: 22 tests passed.
- `npm run typecheck` in `packages/franken-orchestrator`: passed.
- `npm run build` in `packages/franken-critique`: passed.
- ESM runtime smoke check of built `SafetyEvaluator.evaluate()` with a valid rule: returned `{"verdict":"fail","findings":1}`.

## Codex review loop

- Initial `codex exec review --dangerously-bypass-approvals-and-sandbox --commit HEAD` found a P1 ESM worker-body issue caused by CommonJS `require` in the eval worker.
- Fixed worker body to use ESM `import { parentPort, workerData } from 'node:worker_threads';` and verified tests/build/runtime smoke.
- Final Codex review found two P2 findings: preserve warn-only rule severity on regex runtime timeout and avoid false unsafe failures for large linear scans.
- Addressed findings by preserving rule severity for timeout findings and scaling runtime regex timeout budget with input size, capped at 5 seconds.
- Re-ran targeted tests/build/typecheck after the fix; pending amend and final Codex review rerun.

## Notes

- Temp directory tests now track all created temp roots in a set and remove them with retries, clearing state between tests.
- Fake timers now have a shared cleanup helper that clears pending fake timers and restores real timers from `afterEach`.
- Safety evaluator now executes rule matching in a worker with a timeout so a regex that bypasses static validation cannot hang the evaluator process.
- Backward-compat constructor test now states the legacy contract sunset guidance.
