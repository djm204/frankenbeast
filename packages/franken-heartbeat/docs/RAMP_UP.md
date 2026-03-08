# franken-heartbeat (MOD-08) -- Agent Ramp-Up

Proactive self-reflection module that wakes independently of user prompts to inspect system health, run LLM-powered reflection when flags are found, and dispatch actions (morning briefs, planner tasks, skill proposals).

## Directory Structure

```
src/
  core/           types.ts, config.ts, errors.ts
  checklist/      parser.ts, writer.ts          -- HEARTBEAT.md parse/write (pure)
  checker/        deterministic-checker.ts       -- cheap phase (zero LLM)
  reflection/     reflection-engine.ts, prompt-builder.ts, response-parser.ts, types.ts
  reporter/       action-dispatcher.ts, morning-brief-builder.ts
  modules/        interface contracts: memory, observability, planner, critique, hitl
  orchestrator/   pulse-orchestrator.ts          -- wires full lifecycle
  cli/            args.ts, run.ts                -- CLI entry point
  index.ts                                       -- barrel exports
tests/
  unit/           per-feature tests, no I/O
  integration/    full orchestrator lifecycle with stubs
```

## Architecture: Cheap-then-Expensive Escalation

1. **Parse** HEARTBEAT.md via `parseChecklist()`
2. **Cheap check** -- `DeterministicChecker.check(watchlist)` scans watchlist, git status, token spend, deep-review hour. Zero LLM tokens.
3. If `HEARTBEAT_OK`, return early. If `FLAGS_FOUND`, proceed.
4. **Expensive reflection** -- `ReflectionEngine.reflect(projectId)` queries memory/observability, calls LLM, parses JSON response via Zod.
5. **Critique audit** -- `ICritiqueModule.auditConclusions(reflection)` validates conclusions.
6. **Dispatch** -- `ActionDispatcher.dispatch(actions, report)` sends morning brief via HITL, injects tasks into planner.
7. **Write** updated HEARTBEAT.md back.

Orchestrated by `PulseOrchestrator.run(): Promise<HeartbeatReport>`.

## Public API (key exports)

| Export | Kind | Signature |
|--------|------|-----------|
| `PulseOrchestrator` | class | `constructor(deps: PulseOrchestratorDeps)`, `run(): Promise<HeartbeatReport>` |
| `DeterministicChecker` | class | `constructor(deps: DeterministicCheckerDeps)`, `check(watchlist): Promise<PulseResult>` |
| `ReflectionEngine` | class | `constructor(deps: ReflectionEngineDeps)`, `reflect(projectId): Promise<Result<ReflectionResult>>` |
| `ActionDispatcher` | class | `constructor(deps: ActionDispatcherDeps)`, `dispatch(actions, report): Promise<void>` |
| `parseChecklist` | fn | `(input: string): ChecklistParseResult` |
| `writeChecklist` | fn | `(input: WriteChecklistInput): string` |
| `buildMorningBrief` | fn | `(report: HeartbeatReport): string` |
| `buildReflectionPrompt` | fn | `(context: PromptContext): string` |
| `parseReflectionResponse` | fn | `(raw: string): Result<ReflectionResult>` |

## Key Types

```typescript
type PulseResult = { status: 'HEARTBEAT_OK' } | { status: 'FLAGS_FOUND'; flags: Flag[] };
type Flag = { source: string; description: string; severity: FlagSeverity };
type FlagSeverity = 'low' | 'medium' | 'high';
type ReflectionResult = { patterns: string[]; improvements: Improvement[]; techDebt: TechDebtItem[] };
type Improvement = { target: string; description: string; priority: 'low' | 'medium' | 'high' };
type TechDebtItem = { location: string; description: string; effort: 'small' | 'medium' | 'large' };
type Action = { type: 'skill_proposal' | 'planner_task' | 'morning_brief'; payload: unknown };
type HeartbeatReport = { timestamp: string; pulseResult: PulseResult; reflection?: ReflectionResult; actions: Action[] };
type Result<T> = { ok: true; value: T } | { ok: false; error: Error };
```

## Checklist Parsing

HEARTBEAT.md uses `## Active Watchlist` (checkbox items `- [x]`/`- [ ]`) and `## Reflection Log` (entries `- *label:* content`). Unknown `##` sections are preserved. Parser is pure -- no I/O.

## Module Contracts (DI interfaces)

| Interface | Module | Key methods |
|-----------|--------|-------------|
| `IMemoryModule` | MOD-03 | `getFailures(projectId)`, `getSuccesses(projectId)`, `recordLesson(lesson)` |
| `IObservabilityModule` | MOD-05 | `getTraces(since)`, `getTokenSpend(since)` |
| `IPlannerModule` | MOD-04 | `injectTask(task: SelfImprovementTask)` |
| `ICritiqueModule` | MOD-06 | `auditConclusions(reflection): Promise<AuditResult>` |
| `IHitlGateway` | MOD-07 | `sendMorningBrief(report)`, `notifyAlert(alert)` |

## Config

`HeartbeatConfigSchema` (Zod): `deepReviewHour` (default 2), `tokenSpendAlertThreshold` (default 5.0), `heartbeatFilePath` (default `./HEARTBEAT.md`), `maxReflectionTokens` (default 4096).

## CLI

`franken-heartbeat --dry-run --heartbeat-file ./HEARTBEAT.md --project-id myproject`

Currently uses stub implementations for all module deps. `--dry-run` skips file writes and dispatch side effects.

## Build and Test

```bash
npm run build           # tsc
npm run typecheck       # tsc --noEmit
npm test                # vitest run
npm run test:coverage   # vitest run --coverage
npm run test:integration # INTEGRATION=true vitest run
npm run lint            # eslint src/ tests/
```

## Dependencies

- `@franken/types` (workspace link) -- shared types including `Result`, `IResultLlmClient`
- `zod` ^4.3.6 -- runtime schema validation
- `vitest` ^4.0.18 + `@vitest/coverage-v8` (dev)
- `typescript` ^5.9.3 (dev)

## Gotchas

1. **IResultLlmClient, not ILlmClient.** The local `ILlmClient` re-export is actually `IResultLlmClient` from `@franken/types`. Its `complete()` returns `Promise<Result<string>>`, not `Promise<string>`. Other modules (e.g., franken-brain) use the plain `ILlmClient` that returns `Promise<string>`.

2. **zod/v4, not zod 3.x.** All imports use `from 'zod/v4'`. Other modules in the monorepo use zod 3.24. Schema APIs differ (e.g., `safeParse` return shape).

3. **Errors are swallowed in DeterministicChecker.** Git status and token spend checks catch all errors and return empty flag arrays -- they never throw.

4. **ActionDispatcher swallows dispatch errors.** Individual action failures are caught silently; the heartbeat loop continues.

5. **ReflectionEngine returns early on LLM failure.** If the LLM call fails, `PulseOrchestrator` returns the report with no reflection and no actions.
