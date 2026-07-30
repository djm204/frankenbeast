# Issue #3835 progress

- [x] Revalidate live issue, branch/base, and competing PR/branch ownership.
- [x] Read shared lessons and locate evaluator/tests.
- [x] Trace evaluator result/severity through pipeline and CI callers; inspect configuration surface.
- [x] Run focused deterministic reproduction for threshold and failure behavior.
- [x] Decide validity and record observed/expected/root-cause evidence before edits.
- [x] If valid, add a failing regression test and implement the minimal deterministic fix.
- [x] Run focused, package, root, and security quality gates.
- [ ] Self-review, GitHub/Codex/CI closeout, merge or issue closure, and Kanban handoff.

## Reproduction and root cause

- Command: `npm test --workspace @franken/critique -- --run tests/unit/evaluators/conciseness.test.ts -t 'keeps excessive-comment feedback informational and non-blocking'`.
- Input: two ordinary documentation comment lines plus one code line (deterministic 2/3 = 67%, above the documented default 50% threshold).
- Observed before fix: the evaluator emitted an `info` finding but returned `verdict: 'fail'`; the focused regression failed with `expected 'fail' to be 'pass'`.
- Expected: retain the deterministic style finding and score penalty without making informational feedback a blocking verdict.
- Root cause: `ConcisenessEvaluator.evaluate()` derived `fail` from `findings.length`, ignoring that every conciseness finding is `info`. `CritiquePipeline` intentionally keeps `pass` + `info` non-blocking, while any evaluator `fail` makes the aggregate fail. The MCP adapter independently maps these findings to `warn`, confirming severity/verdict drift across consumers.
- Existing configuration: `CritiquePipeline.run({ evaluatorNames })` and the HTTP/MCP surfaces can omit `conciseness`; there is no per-threshold evaluator option. Environment configuration is inappropriate for this pure deterministic evaluator, and a new threshold option is unnecessary once the existing `info` severity is honored.
- Determinism probe: 100 evaluations of the same 67% input produced one unique result signature; the exact 50% boundary produced no finding. This is deterministic style feedback, not a flaky threshold.

## Verification

- Focused RED before implementation: 1 expected failure (`fail` versus expected `pass`).
- Focused GREEN: regression 1/1 and pipeline tests 12/12 passed.
- `@franken/critique`: tests 802/802, lint, typecheck, and build passed.
- Root: build, lint, typecheck, `lint:security`, and `audit:security` passed; audit found 0 vulnerabilities.
- Root test rerun executed 4,990 orchestrator assertions successfully but exited nonzero for an unrelated unhandled `Codex app-server is unavailable` rejection from `runtime-contract.test.ts`; that file passes 16/16 in isolation, and the two earlier load-sensitive timeout failures pass 2/2 in isolation. No changed path intersects the orchestrator runtime.
