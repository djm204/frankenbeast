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

## Reviewer-feedback lesson capture

Recorded critique lessons also carry a `reviewerFeedback` object so worker retrospectives and PM handoff summaries can reuse the reviewer feedback that created the lesson without parsing prose. The capture includes:

- `summary`: a concise concatenation of the reviewer finding messages.
- `findings`: normalized feedback entries with source iteration, evaluator name, message, severity, and any reviewer-provided source location or suggestion.
- `suggestionsComplete`: `true` only when every captured feedback item includes a reviewer suggestion.
- `missingSuggestionGuidance`: present when at least one feedback item lacks a suggestion; PM/liveness tooling should surface the original message and ask for remediation guidance before promotion.

Infrastructure-only evaluator exceptions and failed iterations without actionable findings do not create reviewer-feedback captures. This keeps broken tooling noise from being promoted as durable agent-learning guidance.

## Post-PR lesson extraction template

Recorded critique lessons include `postPrLessonExtractionTemplate`, a deterministic prompt/template for the post-PR moment after review or merge evidence exists. PM/liveness tooling can hand the template to an LLM or worker to extract one reusable lesson without inventing missing evidence.

The template requires these evidence inputs before promotion:

- linked issue or task identifier;
- PR URL or merge/review artifact;
- reviewer finding or failure mode that motivated the correction;
- correction applied in the final PR head;
- regression test, verifier, or explicit reason no code-level regression applies.

Its output schema is intentionally narrow: `issueNumber`, `prUrl`, `sourceFinding`, `correctionApplied`, `reusableLesson`, `regressionEvidence`, and `followUpNeeded`. If any required evidence is missing, tooling should set `followUpNeeded: true` and surface the template's `insufficientEvidenceGuidance` instead of promoting a guessed lesson. Infrastructure-only evaluator exceptions and failed iterations without actionable findings do not create the template.

## Lesson experiment sandbox

New lessons recorded by `LessonRecorder` also include an `experimentSandbox` object. The sandbox marks the lesson as `state: "experimental"`, sets `promotionBlocked: true`, and carries operator-facing exit criteria plus the verification command. PM and liveness tooling should surface these lessons for review, but must not promote or retire them as durable guidance until the traceability entry is present, the listed verification command has been run, and a reviewer confirms the regression covers the source finding.

Failing iterations without actionable findings, and infrastructure-only evaluator exceptions, do not create sandboxed lessons. This keeps broken evaluator/tooling noise from entering the learning pipeline as experimental guidance.


## Lesson contradiction detector

`LessonRecorder` emits a `contradictionReport` for each recorded lesson. When the memory adapter implements optional `searchLessons(query, topK)`, the recorder queries comparable prior lessons and runs the deterministic detector before calling `recordLesson`. The report is structured for PM/liveness surfaces:

- `status: "clear"` means no comparable prior lesson from the same evaluator had both shared normalized terms and reversed negated guidance.
- `status: "contradiction_detected"` includes `contradictions[]` entries with the conflicting lesson id, evaluator, shared terms, reason, prior failure description, and prior correction. Treat this as a promotion blocker until an operator reconciles, supersedes, or retires one side.
- `status: "not_checked"` means the memory adapter has not implemented `searchLessons`, so historical contradictions are unknown and should be treated as unresolved before promotion.
- `verificationCommand` points at the focused unit test that covers success and negative detector cases.

Adapters that want historical contradiction checks should return likely prior critique lessons for the query string without mutating memory.

## Learning cooldown

`LessonRecorder` applies a deterministic cooldown to equivalent critique lessons so repeated reviewer/worker feedback does not churn memory, PM handoffs, or promotion/retirement flows. By default, equivalent lessons are keyed by evaluator name plus the normalized finding messages and suppressed for 24 hours after the first successful record.

Recorded lessons include a `cooldown` object with the key, window, `recordedAt`, `suppressUntil`, and operator guidance. The `record()` call returns a `LessonRecordingResult` containing `recorded` and `suppressedByCooldown`; suppressed entries include the task id, evaluator name, suppression timestamp, remaining milliseconds, and reason so PM/liveness tooling can report the skipped duplicate instead of silently drifting.

Callers that need a different window can construct `new LessonRecorder(memory, { cooldownMs })`; pass `cooldownMs: 0` to disable suppression. The recorder uses an advancing wall-clock by default and only uses the injected `now` callback for tests/replay callers that explicitly pass one. Cooldown state is instance-local unless callers pass a reused `cooldownStore` map in `LessonRecorderOptions`, which lets reviewer rebuilds in the same worker suppress duplicate lessons without leaking state into unrelated tests or pipelines. Recorders that reuse the same store also share in-flight admission reservations, so concurrent rebuilds do not double-persist the same equivalent lesson. Invalid negative or non-finite cooldown windows throw a `RangeError` during construction.

## Cross-task blocker pattern mining

`LessonRecorder` also mines repeated blocker patterns while it records critique lessons. Critical findings are normalized by evaluator name and finding text, then counted across distinct task ids. Once the same blocker reaches the configured distinct-task threshold, `record()` surfaces it in `minedBlockerPatterns` and the associated recorded lesson includes `blockerPatterns` for PM/liveness consumers.

Each mined pattern includes a stable `key`, evaluator name, normalized finding, threshold, occurrence count, ordered distinct task ids, first/last seen timestamps, and operator guidance. Repeated observations from the same task do not increment the pattern, and warning-only findings are ignored so the signal stays focused on true blockers. The default threshold is 3 distinct tasks; tests or replay callers can pass `blockerPatternThreshold` and a shared `blockerPatternStore` in `LessonRecorderOptions` when multiple recorder instances should mine against the same in-process history.

## Per-agent improvement scorecards

Callers that know the worker/agent identity can construct `new LessonRecorder(memory, { agentId })` to attach an `agentImprovementScorecard` to each recorded critique lesson. The recorder trims and validates the id up front; blank ids throw so PM summaries do not group lessons under an ambiguous agent.

Each scorecard is structured for worker retrospectives and PM/liveness handoffs, with schema version, `agentId`, task/evaluator ids, generated timestamp, initial/final score, score delta, failing/resolved iterations, critical/warning/info finding counts, and LLM-friendly improvement signals. Use it to compare an agent's recovered critique loops over time without parsing free-form lesson prose.

## Learning backlog prioritization report

Every `LessonRecorder.record()` result exposes `learningBacklogPrioritizationReport`, a deterministic PM/liveness summary of newly observed learning follow-up. The report uses schema version `learning-backlog-prioritization-report-v1` and sorts items by numeric `score` so recurrent critical blockers appear before routine lesson cleanup.

Report items identify their source as `recorded-lesson`, `blocker-pattern`, or `cooldown-suppression`, include task/evaluator context when available, and carry a concise rationale plus recommended next action. High-priority recorded lessons should go through promotion review with their traceability verifier, blocker patterns should route to a durable mitigation owner, and low-priority cooldown suppressions should reuse the existing in-cooldown lesson instead of creating duplicate backlog churn.

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
