# @franken/types -- Agent Ramp-Up

Shared types package that every other frankenbeast module depends on -- zero runtime deps, pure TypeScript type definitions and branded-ID factories.

## Exported Types

### Branded IDs (`src/ids.ts`)
Compile-time distinct, runtime strings via `string & { __brand: 'X' }`.

| Type | Factory | Example |
|------|---------|---------|
| `ProjectId` | `createProjectId(s)` | `createProjectId('proj-001')` |
| `SessionId` | `createSessionId(s)` | `createSessionId('sess-001')` |
| `TaskId` | `createTaskId(s)` | `createTaskId('task-001')` |
| `RequestId` | `createRequestId(s)` | `createRequestId('req-001')` |
| `SpanId` | `createSpanId(s)` | `createSpanId('span-001')` |
| `TraceId` | `createTraceId(s)` | `createTraceId('trace-001')` |

All factories take a `string` and return the branded type. Branded IDs are assignable to `string` but not to each other.

### Result Monad (`src/result.ts`)
```ts
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
```
Narrow with `if (result.ok) { result.value } else { result.error }`.

### Severity (`src/severity.ts`)
Superset union with module-specific subsets:

| Type | Values | Used By |
|------|--------|---------|
| `Severity` | `'info' \| 'low' \| 'medium' \| 'high' \| 'warning' \| 'critical'` | Superset |
| `CritiqueSeverity` | `'critical' \| 'warning' \| 'info'` | franken-critique |
| `TriggerSeverity` | `'low' \| 'medium' \| 'high' \| 'critical'` | franken-governor |
| `FlagSeverity` | `'low' \| 'medium' \| 'high'` | franken-heartbeat |

All subsets are assignable to `Severity`.

### LLM Client Interfaces (`src/llm.ts`)
Two variants -- different return types:

```ts
interface ILlmClient {
  complete(prompt: string): Promise<string>;
}

interface IResultLlmClient {
  complete(prompt: string, options?: { maxTokens?: number }): Promise<Result<string>>;
}
```
- `ILlmClient` -- used by franken-brain (throws on failure)
- `IResultLlmClient` -- used by franken-heartbeat (returns `Result<string>`)

### Verdict (`src/verdict.ts`)
```ts
type Verdict = 'pass' | 'fail';
```

### RationaleBlock & VerificationResult (`src/rationale.ts`)
```ts
interface RationaleBlock {
  taskId: TaskId;
  reasoning: string;
  selectedTool?: string;
  expectedOutcome: string;
  timestamp: Date;
}

type VerificationResult =
  | { verdict: 'approved' }
  | { verdict: 'rejected'; reason: string };
```
`RationaleBlock` flows from planner CoT gate to governor. `VerificationResult` is the governor's response.

### TokenSpend (`src/token.ts`)
```ts
interface TokenSpend {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}
```

### FrankenContext (`src/context.ts`)
Mutable context flowing through the Beast Loop:
```ts
interface FrankenContext {
  projectId: string;
  sessionId: string;
  userInput: string;
  sanitizedIntent?: { goal: string; strategy?: string; context?: Record<string, unknown> };
  plan?: unknown;
  tokenSpend: TokenSpend;
  audit: Array<{ timestamp: string; module: string; action: string; detail: unknown }>;
  phase: 'ingestion' | 'planning' | 'execution' | 'closure';
}
```

## Build & Test

```bash
npm run build       # tsc
npm run typecheck   # tsc --noEmit
npm run test        # vitest run
npm run test:watch  # vitest (watch mode)
```

Zero runtime dependencies. Dev deps: `typescript`, `vitest`, `@types/node`.

## Key Gotchas
- `ILlmClient` vs `IResultLlmClient` have incompatible return types -- do not interchange.
- `RationaleBlock.selectedTool` is optional.
- `FrankenContext.plan` is typed `unknown` because `PlanGraph` is module-specific (lives in franken-planner).
- Severity subsets overlap but are NOT identical -- check which subset your module needs.
