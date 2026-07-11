# @franken/critique

**MOD-06: Self-Critique & Reflection** for the Frankenbeast system.

`@franken/critique` provides the evaluator pipeline, critique retry loop, circuit breakers, and reviewer factory used to score plans or generated code before the rest of the agent system acts on them. The package is designed as a library: importing it has no side effects, and callers decide which evaluators, breakers, and integration ports to wire in.

## Requirements

- Node.js `>=22.13.0 <23 || >=24.0.0 <26`
- npm 11.5.1 via the repository `packageManager` setting

## Installation

From a published package:

```bash
npm install @franken/critique
```

From this monorepo checkout, install workspace dependencies at the repository root:

```bash
npm install
```

## Public entrypoint

The package export is `@franken/critique`, backed by `./dist/index.js` and `./dist/index.d.ts` after build.

Current public exports include:

- `CritiquePipeline` for running ordered evaluators over an evaluation input.
- `CritiqueLoop` for retry-until-pass critique workflows.
- `createReviewer` plus the `Reviewer` and `ReviewerConfig` types for the pre-wired reviewer facade.
- Evaluators such as `SafetyEvaluator`, `GhostDependencyEvaluator`, `ADRComplianceEvaluator`, `ReflectionEvaluator`, `LogicLoopEvaluator`, `FactualityEvaluator`, `ConcisenessEvaluator`, `ComplexityEvaluator`, and `ScalabilityEvaluator`.
- Circuit breakers such as `MaxIterationBreaker`, `TokenBudgetBreaker`, and `ConsensusFailureBreaker`.
- Evaluation, loop, contract, and common result types used by sibling Frankenbeast packages.

## Quick start

```typescript
import { CritiquePipeline, type Evaluator } from '@franken/critique';

const noSecretsEvaluator: Evaluator = {
  name: 'no-secrets',
  category: 'deterministic',
  async evaluate(input) {
    const hasSecretMarker = input.content.includes('API_KEY=');

    return {
      evaluatorName: 'no-secrets',
      verdict: hasSecretMarker ? 'fail' : 'pass',
      score: hasSecretMarker ? 0 : 1,
      findings: hasSecretMarker
        ? [
            {
              severity: 'critical',
              message: 'Content appears to contain an API key assignment.',
              suggestion:
                'Move secrets to the configured secret backend before retrying.',
            },
          ]
        : [],
    };
  },
};

const pipeline = new CritiquePipeline([noSecretsEvaluator]);

const result = await pipeline.run({
  content: 'Plan text or generated code to critique',
  source: 'docs/example-plan.md',
  metadata: { taskId: 'task-001' },
});

if (result.verdict !== 'pass') {
  console.log(result.results.flatMap((item) => item.findings));
}
```

Use `createReviewer` when a caller has the required guardrails, memory, observability, and known-package dependencies and wants the package's pre-wired reviewer facade instead of assembling a pipeline directly.

## Lesson-to-test traceability

When the critique loop recovers from one or more failing iterations and ends in `pass` or `warn`, `LessonRecorder` records each learned critique lesson with a `testTraceability` map. Each entry includes:

- `lessonId`: a stable identifier derived from task id, evaluator name, and failing iteration.
- `failingIteration` and `resolvedIteration`: the retry path that produced the lesson.
- `sourceFindingMessages`: the evaluator findings that motivated the lesson.
- `testId`: the deterministic regression-test identifier PM handoffs can require before promoting or retiring the lesson.
- `verificationCommand`: the targeted command that verifies the traceability-map contract.

Infrastructure-only evaluator exceptions are intentionally excluded from the map so operator dashboards do not promote broken tooling as product lessons. PM handoffs should treat lessons without a matching regression `testId` as unverified learning that is not ready for promotion.

## Learning backlog prioritization report

Use `createLearningBacklogPrioritizationReport()` to turn captured critique lessons into an LLM-friendly PM handoff report. The report is deterministic and structured so liveness tooling can sort the backlog without interpreting prose.

```typescript
import { createLearningBacklogPrioritizationReport } from '@franken/critique';

const report = createLearningBacklogPrioritizationReport(
  [
    {
      lesson,
      recurrenceCount: 3,
      handoffBlocking: true,
      note: 'Blocks safe worker dispatch until promoted.',
    },
  ],
  { generatedAt: new Date().toISOString(), limit: 10 },
);
```

Each active entry includes `rank`, `priority` (`P0`-`P3`), deterministic `score`, `lessonId`, recurrence and handoff signals, regression-verification status, source finding messages, and a `recommendedAction`. Promoted or retired lessons are omitted from `entries` and counted in `omittedPromotedOrRetiredCount`, making it explicit when backlog items are intentionally out of scope. Lessons without `testTraceability` are marked `verifiedByRegression: false` and receive the action `Add regression traceability before promotion.`

## Package scripts

Run these from the package directory with `npm run <script>`, or from the repository root with `npm run <script> --workspace @franken/critique`.

| Script             | Purpose                                                        |
| ------------------ | -------------------------------------------------------------- |
| `build`            | Compile TypeScript to `dist/` with `tsc`.                      |
| `typecheck`        | Run `tsc --noEmit` without writing build output.               |
| `test`             | Run the unit test suite with Vitest.                           |
| `test:watch`       | Run Vitest in watch mode.                                      |
| `test:coverage`    | Run Vitest with coverage reporting.                            |
| `test:integration` | Run the integration suite with `vitest.integration.config.ts`. |
| `lint`             | Run ESLint over `src/` and `tests/`.                           |
| `lint:fix`         | Run ESLint with automatic fixes over `src/` and `tests/`.      |
| `format`           | Format package TypeScript sources/tests with Prettier.         |
| `format:check`     | Check TypeScript source/test formatting with Prettier.         |
| `prepublishOnly`   | Run the repository build before publishing.                    |

## Project structure

```text
src/
  index.ts                 Public barrel export
  pipeline/                Ordered evaluator execution
  loop/                    Retry loop and iteration controls
  evaluators/              Built-in critique evaluators
  breakers/                Circuit-breaker implementations
  memory/                  Lesson recording support
  server/                  Hono app/server helpers
  types/                   Evaluation, loop, and port contracts
  errors/                  Package-specific error classes

docs/
  RAMP_UP.md               Historical ramp-up/status note for contributors
```

## Architecture notes

- `@franken/critique` depends on `@franken/types` for shared verdict and severity types.
- The package exposes ports for guardrails, memory, observability, and escalation so callers can integrate sibling modules without hard-coding their implementations.
- For the current repository architecture and integration status, prefer the canonical root ramp-up and architecture documentation. The package-local `docs/RAMP_UP.md` is a contributor ramp-up note and may include narrower historical context tracked by separate documentation issues.

## Publishing notes

Only `dist/` is included in the published package. Run `npm run build --workspace @franken/critique` before publishing or consuming the workspace from its compiled entrypoint.
