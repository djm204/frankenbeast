# PM handoff quality rubric

Provider brain-state handoffs now include a deterministic PM handoff rubric so workers and operators can produce handoffs that are easy to review, resume, and promote into future learning.

Use `formatPmHandoffQualityRubric()` when a human-facing worker retrospective or PM handoff needs the rubric text. Use `scorePmHandoffQuality(summary)` when tooling needs a structured pass/fail report.

## Criteria

- `issue-and-outcome`: name the issue number and the shipped or intentionally-not-shipped outcome.
- `scope-control`: list changed files or scope notes so PM can distinguish intended work from drift.
- `verification-evidence`: include exact commands or deterministic verifier output, not just “tested”.
- `blocker-disclosure`: state blockers explicitly; use an empty blockers list only when there were none.
- `operator-continuity`: include PR URL, next steps, or handoff notes plus disk/resource status when relevant.

## Structured scoring

A complete handoff should provide at least:

```ts
scorePmHandoffQuality({
  issueNumber: 1862,
  branch: 'pfkborg/issue-1862-feat-learning-add-pm-handoff-quality',
  prUrl: 'https://github.com/djm204/frankenbeast/pull/<id>',
  changedFiles: ['packages/franken-orchestrator/src/providers/format-handoff.ts'],
  verificationCommands: ['npm test --workspace @franken/orchestrator -- --run tests/unit/providers/format-handoff.test.ts'],
  blockers: [],
  scopeNotes: ['Added PM handoff quality rubric and scorer.'],
  diskFree: '24G',
});
```

The scorer returns a normalized `score`, an overall `passed` boolean, per-criterion results, and `failedCriteria` IDs. Missing verification, omitted blocker disclosure, or absent continuity notes are explicit failures instead of silent drift.
