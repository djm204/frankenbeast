# franken-heartbeat

**MOD-08: The Heartbeat Loop** — Proactive self-reflection for the [Frankenbeast](https://github.com/djm204) agent system.

The Heartbeat Loop is a scheduled autonomous trigger that forces the agent to "wake up" independently of user prompts to perform self-reflection, maintenance, and proactive planning. It follows a **"Cheap Check → Expensive Reasoning"** escalation pattern to manage LLM costs — most heartbeats consume zero tokens.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [CLI Usage](#cli-usage)
- [Configuration](#configuration)
- [HEARTBEAT.md Format](#heartbeatmd-format)
- [Library Usage](#library-usage)
- [Module Interfaces](#module-interfaces)
- [Architecture](#architecture)
- [Development](#development)
- [ADRs](#adrs)

## Installation

```bash
npm install franken-heartbeat
```

### Prerequisites

- Node.js 18+
- TypeScript 5.x (for development)

## Quick Start

### As a CLI tool

```bash
# Build the project
npm run build

# Run a heartbeat check (dry run — no side effects)
npx franken-heartbeat --dry-run

# Run with a custom HEARTBEAT.md location
npx franken-heartbeat --heartbeat-file ./my-project/HEARTBEAT.md

# Run for a specific project
npx franken-heartbeat --project-id my-project --heartbeat-file ./HEARTBEAT.md
```

### As a library

```typescript
import { PulseOrchestrator } from 'franken-heartbeat';
import { readFile, writeFile } from 'node:fs/promises';

const orchestrator = new PulseOrchestrator({
  memory: myMemoryModule,       // IMemoryModule implementation
  observability: myObsModule,   // IObservabilityModule implementation
  planner: myPlannerModule,     // IPlannerModule implementation
  critique: myCritiqueModule,   // ICritiqueModule implementation
  hitl: myHitlGateway,          // IHitlGateway implementation
  llm: myLlmClient,             // ILlmClient implementation
  gitStatusExecutor: async () => ({ dirty: false, files: [] }),
  clock: () => new Date(),
  config: {
    deepReviewHour: 2,
    tokenSpendAlertThreshold: 5.0,
    heartbeatFilePath: './HEARTBEAT.md',
    maxReflectionTokens: 4096,
  },
  readFile: (path) => readFile(path, 'utf-8'),
  writeFile: (path, content) => writeFile(path, content, 'utf-8'),
  projectId: 'my-project',
});

const report = await orchestrator.run();
console.log(JSON.stringify(report, null, 2));
```

## How It Works

The heartbeat follows a four-phase lifecycle:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Heartbeat Lifecycle                         │
│                                                                 │
│  1. PULSE          2. CHECK           3. REFLECT    4. REPORT   │
│  ┌─────────┐      ┌─────────────┐    ┌──────────┐  ┌────────┐  │
│  │  Cron   │─────▶│Deterministic│───▶│   LLM    │─▶│Morning │  │
│  │ Trigger │      │  Checker    │    │Reflection│  │ Brief  │  │
│  └─────────┘      └──────┬──────┘    └──────────┘  └────────┘  │
│                          │                                      │
│                    No flags found?                               │
│                          │                                      │
│                   HEARTBEAT_OK ✓                                │
│                   (zero tokens)                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 1 — Pulse Trigger

A scheduled job (e.g., cron every 30 minutes, or a nightly 2 AM deep review) invokes the heartbeat.

### Phase 2 — Deterministic Check (Cheap)

Four checks run in parallel, consuming **zero LLM tokens**:

| Check | Severity | Trigger |
|-------|----------|---------|
| **Watchlist** | `low` | Unchecked items in HEARTBEAT.md |
| **Deep Review Hour** | `medium` | Current UTC hour matches `deepReviewHour` |
| **Git Status** | `low` | Uncommitted changes in the repo |
| **Token Spend** | `high` | 24-hour spend exceeds threshold |

If no flags are found, the heartbeat returns `HEARTBEAT_OK` immediately.

### Phase 3 — Self-Reflection (Expensive)

When flags are found, the reflection engine:

1. Queries the last 24 hours of observability traces
2. Retrieves project successes and failures from memory
3. Asks the LLM three questions:
   - **What patterns emerged?** (e.g., repeated failures on a specific task)
   - **What should improve?** (e.g., new skills or better error handling)
   - **Technical debt?** (e.g., refactors to perform while the user is offline)
4. The Self-Critique module audits the conclusions before any actions are dispatched

### Phase 4 — Reporting

After a successful audit:
- A **Morning Brief** is sent to the user via the HITL Gateway
- **Skill proposals** and **planner tasks** are injected into the Planner
- The **HEARTBEAT.md** checklist is updated with reflection entries

## CLI Usage

```
franken-heartbeat [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--config <path>` | Path to a JSON configuration file | _(uses defaults)_ |
| `--heartbeat-file <path>` | Path to the HEARTBEAT.md file | `./HEARTBEAT.md` |
| `--dry-run` | Run without side effects (no file writes, no notifications) | `false` |
| `--project-id <id>` | Project identifier for scoping memory queries | `default` |

### Examples

```bash
# Standard heartbeat run
npx franken-heartbeat --project-id staples-ui

# Dry run — see what would happen without making changes
npx franken-heartbeat --dry-run --heartbeat-file ./HEARTBEAT.md

# With custom config
npx franken-heartbeat --config ./heartbeat-config.json --project-id my-project

# Schedule with cron (every 30 minutes)
# crontab -e
# */30 * * * * cd /path/to/project && npx franken-heartbeat --project-id my-project >> /var/log/heartbeat.log 2>&1

# Nightly deep review at 2 AM UTC
# 0 2 * * * cd /path/to/project && npx franken-heartbeat --project-id my-project
```

### Output

The CLI outputs a `HeartbeatReport` as JSON to stdout:

```json
{
  "timestamp": "2026-02-20T14:00:00.000Z",
  "pulseResult": {
    "status": "FLAGS_FOUND",
    "flags": [
      {
        "source": "watchlist",
        "description": "1 pending watchlist item(s)",
        "severity": "low"
      }
    ]
  },
  "reflection": {
    "patterns": ["Repeated CI failures on the Staples-UI branch"],
    "improvements": [
      {
        "target": "skills",
        "description": "Add error handler for Staples API timeouts",
        "priority": "medium"
      }
    ],
    "techDebt": []
  },
  "actions": [
    {
      "type": "morning_brief",
      "payload": { "summary": "1 flag found, reflection completed" }
    },
    {
      "type": "planner_task",
      "payload": {
        "description": "Add error handler for Staples API timeouts",
        "priority": "medium"
      }
    }
  ]
}
```

## Configuration

### HeartbeatConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `deepReviewHour` | `number` (0-23) | `2` | UTC hour to trigger the nightly deep review |
| `tokenSpendAlertThreshold` | `number` | `5.0` | USD threshold for 24-hour token spend alerts |
| `heartbeatFilePath` | `string` | `./HEARTBEAT.md` | Path to the HEARTBEAT.md checklist file |
| `maxReflectionTokens` | `number` | `4096` | Max tokens for the LLM reflection call |

### Programmatic configuration

```typescript
import { HeartbeatConfigSchema } from 'franken-heartbeat';

// Use defaults
const config = HeartbeatConfigSchema.parse({});

// Override specific values
const config = HeartbeatConfigSchema.parse({
  deepReviewHour: 3,
  tokenSpendAlertThreshold: 10.0,
  heartbeatFilePath: '/opt/agent/HEARTBEAT.md',
  maxReflectionTokens: 8192,
});
```

## HEARTBEAT.md Format

The heartbeat uses a structured markdown file as its checklist. The parser recognizes two sections:

```markdown
## Active Watchlist
- [ ] Monitor CI for 'Staples-UI' branch.
- [ ] Daily 2AM: Refactor any 'TODO' comments in `/src/services`.
- [ ] Alert if token spend > $5.00 today.
- [x] Set up error monitoring for payment service.

## Reflection Log
- *Yesterday:* Refactored 3 components. 100% test pass.
- *Issue:* Slow response on Jira skill.
- *Improvement:* Cache Jira metadata in MOD-03.
```

### Sections

- **Active Watchlist** (`## Active Watchlist`): Checkbox items (`- [ ]` unchecked, `- [x]` checked). Unchecked items trigger a flag during the deterministic check.
- **Reflection Log** (`## Reflection Log`): Timestamped entries in `- *Label:* Content` format. New entries are appended after each reflection.
- **Unknown sections**: Any other `##` sections are preserved as-is during read/write cycles.

### Parsing API

```typescript
import { parseChecklist, writeChecklist } from 'franken-heartbeat';

const result = parseChecklist(markdownString);
// result.watchlist    → WatchlistItem[]  ({ checked, description })
// result.reflections  → ReflectionEntry[] ({ label, content })
// result.unknownSections → UnknownSection[] ({ heading, content })
// result.warnings     → string[] (malformed lines that were skipped)

const markdown = writeChecklist({
  watchlist: result.watchlist,
  reflections: result.reflections,
  unknownSections: result.unknownSections,
});
```

## Library Usage

### Using individual components

Each component can be used independently:

```typescript
import {
  DeterministicChecker,
  ReflectionEngine,
  ActionDispatcher,
  buildMorningBrief,
  parseChecklist,
} from 'franken-heartbeat';

// 1. Parse a checklist
const checklist = parseChecklist(await readFile('./HEARTBEAT.md', 'utf-8'));

// 2. Run cheap deterministic checks
const checker = new DeterministicChecker({
  observability: myObsModule,
  gitStatusExecutor: async () => ({ dirty: false, files: [] }),
  clock: () => new Date(),
  config: { deepReviewHour: 2, tokenSpendAlertThreshold: 5.0 },
});
const pulseResult = await checker.check(checklist.watchlist);

// 3. Run expensive reflection (only if flags found)
if (pulseResult.status === 'FLAGS_FOUND') {
  const engine = new ReflectionEngine({
    llm: myLlmClient,
    memory: myMemoryModule,
    observability: myObsModule,
    maxReflectionTokens: 4096,
  });
  const result = await engine.reflect('my-project');

  if (result.ok) {
    console.log('Patterns:', result.value.patterns);
    console.log('Improvements:', result.value.improvements);
  }
}

// 4. Build a morning brief
const brief = buildMorningBrief({
  timestamp: new Date().toISOString(),
  pulseResult,
  reflection: result.ok ? result.value : undefined,
  actions: [],
});

// 5. Dispatch actions
const dispatcher = new ActionDispatcher({
  planner: myPlannerModule,
  hitl: myHitlGateway,
});
await dispatcher.dispatch(actions, report);
```

### Implementing the ILlmClient interface

The reflection engine uses a provider-agnostic LLM interface. Implement it for your preferred provider:

```typescript
import type { ILlmClient, Result } from 'franken-heartbeat';

// Example: OpenAI adapter
const openaiClient: ILlmClient = {
  async complete(prompt, options) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options?.maxTokens ?? 4096,
      });
      return { ok: true, value: response.choices[0].message.content ?? '' };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
    }
  },
};

// Example: Anthropic adapter
const anthropicClient: ILlmClient = {
  async complete(prompt, options) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: options?.maxTokens ?? 4096,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
      return { ok: true, value: text };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
    }
  },
};
```

## Module Interfaces

The heartbeat integrates with other Frankenbeast modules through dependency-injected interface contracts. In standalone mode, stub implementations are used.

### IMemoryModule (MOD-03)

```typescript
interface IMemoryModule {
  getRecentTraces(hours: number): Promise<EpisodicTrace[]>;
  getSuccesses(projectId: string): Promise<MemoryEntry[]>;
  getFailures(projectId: string): Promise<MemoryEntry[]>;
  recordLesson(lesson: SemanticLesson): Promise<void>;
}
```

### IObservabilityModule (MOD-05)

```typescript
interface IObservabilityModule {
  getTraces(since: Date): Promise<Trace[]>;
  getTokenSpend(since: Date): Promise<TokenSpendSummary>;
}
```

### IPlannerModule (MOD-04)

```typescript
interface IPlannerModule {
  injectTask(task: SelfImprovementTask): Promise<void>;
}
```

### ICritiqueModule (MOD-06)

```typescript
interface ICritiqueModule {
  auditConclusions(reflection: ReflectionResult): Promise<AuditResult>;
}
```

### IHitlGateway (MOD-07)

```typescript
interface IHitlGateway {
  sendMorningBrief(report: HeartbeatReport): Promise<void>;
  notifyAlert(alert: Alert): Promise<void>;
}
```

## Architecture

### Repository layout

```
franken-heartbeat/
├── src/
│   ├── core/             # Types, config schema, error classes
│   ├── checklist/         # HEARTBEAT.md parser and writer (pure functions)
│   ├── checker/           # Deterministic "cheap" phase (zero LLM tokens)
│   ├── reflection/        # LLM-powered "expensive" phase
│   ├── reporter/          # Morning brief builder and action dispatcher
│   ├── modules/           # Interface contracts for MOD-03/04/05/06/07
│   ├── orchestrator/      # PulseOrchestrator — wires the full lifecycle
│   ├── cli/               # CLI entry point and argument parser
│   └── index.ts           # Public API barrel export
├── tests/
│   ├── unit/              # Per-feature unit tests (no I/O)
│   ├── integration/       # Full lifecycle tests with stubs
│   └── fixtures/          # Shared test data builders
├── docs/
│   ├── adr/               # Architecture Decision Records
│   └── implementation-plan.md
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### Key design decisions

- **Cheap-then-Expensive escalation** (ADR-002): The deterministic checker runs first with zero LLM cost. The expensive reflection engine is only triggered when flags are found.
- **Dependency injection**: All external dependencies are injected via constructor, making every component independently testable.
- **Provider-agnostic LLM** (ADR-005): The `ILlmClient` interface allows any LLM provider without changing heartbeat code.
- **Pure checklist functions** (ADR-004): The parser and writer are pure functions with no I/O. File operations are handled by the orchestrator.
- **Result types over exceptions**: Expected failures (LLM errors, parse failures) use `Result<T, E>` instead of thrown exceptions.
- **Module interface contracts** (ADR-006): Each integration point is defined by a TypeScript interface, allowing stub implementations for standalone mode and real implementations for production.

## Development

### Scripts

```bash
npm run build           # Compile TypeScript to dist/
npm run typecheck       # Type-check without emitting
npm test                # Run unit tests
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage report
npm run test:integration # Run integration tests
npm run lint            # Run ESLint
```

### Running tests

```bash
# Unit tests (default)
npm test

# Integration tests (full lifecycle with stubs)
npm run test:integration

# Coverage report (80% threshold on lines, branches, functions, statements)
npm run test:coverage
```

### Test structure

Tests follow TDD (Red → Green → Refactor). Each feature has:
- **Unit tests** in `tests/unit/<feature>/` — isolated, no I/O, fast
- **Integration tests** in `tests/integration/` — full lifecycle with injected stubs

### Tech stack

- **Runtime**: Node.js 18+ with ESM
- **Language**: TypeScript 5.x (strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- **Testing**: Vitest with V8 coverage
- **Validation**: Zod v4
- **No runtime dependencies** besides Zod

## ADRs

| ADR | Title |
|-----|-------|
| [ADR-001](docs/adr/ADR-001-typescript-strict.md) | TypeScript 5.x with Strict Mode |
| [ADR-002](docs/adr/ADR-002-cheap-expensive-escalation.md) | Cheap-then-Expensive Escalation |
| [ADR-003](docs/adr/ADR-003-vitest-testing.md) | Vitest as Testing Framework |
| [ADR-004](docs/adr/ADR-004-heartbeat-md-structured-data.md) | HEARTBEAT.md as Structured Data Source |
| [ADR-005](docs/adr/ADR-005-llm-provider-agnostic.md) | Provider-Agnostic LLM Interface |
| [ADR-006](docs/adr/ADR-006-module-interface-contracts.md) | Module Interface Contracts |

## License

ISC
