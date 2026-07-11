# Cross-task blocker pattern mining

`@franken/critique` exports `mineCrossTaskBlockerPatterns()` for PM handoffs, liveness dashboards, and worker retrospectives that need to identify blockers recurring across independent tasks.

The miner accepts recorded `CritiqueLesson[]` values and returns deterministic structured output:

- `patterns[]`: blocker groups that met the cross-task threshold.
- `taskIds`, `taskCount`, and `occurrenceCount`: evidence that the blocker crossed task boundaries instead of repeating within one task.
- `score`: a deterministic priority signal; higher means more distinct tasks and occurrences.
- `recommendation`: operator-facing guidance suitable for PM summaries.
- `examples[]`: representative lessons with task ID, failure text, correction, and timestamp.
- `warnings[]`: explicit messages for malformed lessons or when no pattern meets `minTaskCount`.

Default behavior requires at least two distinct task IDs before a blocker is promoted. Repeated lessons from a single task are intentionally not reported as cross-task patterns.

Example:

```ts
import { mineCrossTaskBlockerPatterns } from '@franken/critique';

const result = mineCrossTaskBlockerPatterns(lessons, {
  minTaskCount: 2,
  maxPatterns: 5,
  maxExamplesPerPattern: 3,
});

for (const pattern of result.patterns) {
  console.log(pattern.recommendation);
}
```

Interpretation guidance:

- Promote high-scoring patterns into reusable guidance, fixtures, or guardrails before assigning similar work.
- Treat `warnings` as actionable telemetry. Malformed lessons are discarded so ambiguous records do not skew PM/liveness decisions.
- If `patterns` is empty with a `No cross-task blocker patterns met minTaskCount=...` warning, keep the raw lessons but do not retire or promote guidance yet.
