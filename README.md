# Frankenbeast

**Deterministic guardrails for AI agents.**

Frankenbeast is a safety framework that enforces guardrails *outside* the LLM's context window. Every check that can be deterministic is deterministic — regex-based injection scanning, schema validation, dependency whitelisting, DAG cycle detection, HMAC signature verification. These do not hallucinate.

## Why This Exists

LLM-based agents routinely lose safety constraints when context windows compress, hallucinate tool calls that violate architectural rules, and take destructive actions without human oversight. Frankenbeast solves this by placing safety enforcement in a deterministic pipeline that the LLM cannot bypass, forget, or summarise away.

**The key guarantee:** Safety constraints survive context-window compression because they are enforced by the firewall pipeline, not by the LLM prompt.

## Architecture

Frankenbeast is composed of 8 independent modules, each in its own directory with independent versioning, tests, and build pipelines. They communicate through typed port/adapter interfaces — no module directly imports another.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full interconnection diagram.

```
User Input
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    The Beast Loop                               │
│                                                                 │
│  Phase 1: Ingestion        MOD-01 (Firewall) + MOD-03 (Memory) │
│  Phase 2: Planning         MOD-04 (Planner)  + MOD-06 (Critique)│
│  Phase 3: Execution        MOD-02 (Skills)   + MOD-07 (Governor)│
│  Phase 4: Closure          MOD-05 (Observer)  + MOD-08 (Heartbeat)│
│                                                                 │
│  Circuit Breakers: Injection → kill | Budget → HITL | Spiral → escalate │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
  Result
```

## Modules

| # | Module | Package | Role |
|---|--------|---------|------|
| 01 | [frankenfirewall](frankenfirewall/) | `@franken/firewall` | Model-agnostic proxy — PII masking, injection scanning, schema enforcement. Claude + OpenAI adapters included. |
| 02 | [franken-skills](franken-skills/) | `@franken/skills` | Skill registry — discovery, validation, and loading of tool definitions. |
| 03 | [franken-brain](franken-brain/) | `franken-brain` | Three-tier memory — working (in-process), episodic (SQLite), semantic (ChromaDB). |
| 04 | [franken-planner](franken-planner/) | `franken-planner` | Intent → DAG task graphs. Linear, Parallel, and Recursive planning strategies. |
| 05 | [franken-observer](franken-observer/) | `@frankenbeast/observer` | Flight data recorder — tracing, cost tracking, evals, export to OTEL/Langfuse/Prometheus/Tempo. |
| 06 | [franken-critique](franken-critique/) | `@franken/critique` | Plan validation — 8 evaluators (deterministic first), circuit breakers, lesson recorder. |
| 07 | [franken-governor](franken-governor/) | `@franken/governor` | Human-in-the-loop — trigger evaluators, approval channels (CLI/Slack), HMAC-signed approvals. |
| 08 | [franken-heartbeat](franken-heartbeat/) | `franken-heartbeat` | Proactive reflection — scheduled pulse checks, self-improvement task injection. |

### Core Principles

- **Determinism over probabilism.** Regex-based injection scanning, schema validation, HMAC verification — these do not hallucinate.
- **LLM-agnostic.** The firewall is a model-agnostic proxy. Adding a new provider means implementing one `IAdapter` interface.
- **Immutable safety constraints.** Guardrails live in the firewall pipeline, not in the LLM prompt. They cannot be compressed or forgotten.
- **Human-in-the-loop as a first-class primitive.** High-stakes actions require cryptographically signed human approval.
- **Full auditability.** Every decision is traced, costed, and exportable.

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0

### Optional

- **ChromaDB** — required for semantic memory (MOD-03). Not needed for unit/integration tests.
- **LLM API key** — `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` for runtime use. Not needed for tests (mocked).

## Quick Start

```bash
# Clone the repository
git clone <repo-url> frankenbeast
cd frankenbeast

# Install all dependencies (npm workspaces)
npm install

# Build all modules
npm run build

# Run root-level integration tests
npm test

# Run all tests (per-module + root)
npm run test:all
```

## Running Tests

### Root-level integration tests

```bash
# Run all integration tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

### Per-module tests

```bash
# Run a single module's tests
cd franken-brain && npm test

# Run with coverage
cd franken-critique && npm run test:coverage

# Run integration tests (where available)
cd franken-governor && npm run test:integration
```

### All tests across the entire project

```bash
npm run test:all
```

## Configuration

### Environment Variables

| Variable | Module | Required | Description |
|----------|--------|----------|-------------|
| `ANTHROPIC_API_KEY` | MOD-01 | Runtime only | Claude adapter API key |
| `OPENAI_API_KEY` | MOD-01 | Runtime only | OpenAI adapter API key |
| `CHROMA_HOST` | MOD-03 | If using semantic memory | ChromaDB server host (default: `localhost`) |
| `CHROMA_PORT` | MOD-03 | If using semantic memory | ChromaDB server port (default: `8000`) |
| `SLACK_WEBHOOK_URL` | MOD-07 | If using Slack approvals | Slack webhook for HITL notifications |

### Module Configuration

All modules use **dependency injection** — configuration is passed via constructor arguments, not globals or environment variables. This enables full testability with mock implementations.

```typescript
// MOD-06: Critique — via factory function
const reviewer = createReviewer({
  guardrails: guardrailsPort,
  memory: memoryPort,
  observability: observabilityPort,
  knownPackages: ['express', 'zod'],
});

// MOD-07: Governor — via factory function
const governor = createGovernor({
  channel: new CliChannel(),
  triggers: [new BudgetTrigger({ limit: 1.0 }), new SkillTrigger()],
  projectId: 'my-project',
});

// MOD-03: Brain — via constructor
const memory = new MemoryOrchestrator({
  episodic: new EpisodicMemoryStore(sqliteDb),
  semantic: new SemanticMemoryStore(chromaClient, embeddings),
  strategy: new TruncationStrategy(),
  llm: llmClient,
});
```

## The Beast Loop

The orchestrator manages execution through four phases. It is non-linear — it loops back to earlier phases if a module signals a failure.

### Phase 1: Ingestion & Hydration

**Modules:** MOD-01 (Firewall) + MOD-03 (Memory)

Raw user input is scrubbed for PII and scanned for injection attacks by the firewall. Relevant ADRs and episodic traces are loaded from memory to give the agent contextual wisdom.

### Phase 2: Recursive Planning

**Modules:** MOD-04 (Planner) + MOD-06 (Critique)

The Planner generates a Task DAG. The Critique module audits it with 8 evaluators (deterministic evaluators run first, then heuristic). If critique fails, the orchestrator forces a re-plan (max 3 iterations). After 3 failures, it escalates to a human via MOD-07.

### Phase 3: Validated Execution

**Modules:** MOD-02 (Skills) + MOD-07 (Governor)

Tasks execute in topological order from the DAG. High-stakes tasks pause for human approval via the Governor's trigger evaluators (budget, skill, confidence, ambiguity). Every task result is recorded to memory and traced.

### Phase 4: Observability & Closure

**Modules:** MOD-05 (Observer) + MOD-08 (Heartbeat)

The trace is closed, token spend summarised, and the Heartbeat pulse fires to check for proactive improvements. If improvements are found, self-improvement tasks are injected back into the planner.

### Circuit Breakers

| Trigger | Action |
|---------|--------|
| Injection detected (MOD-01) | Immediate process kill |
| Budget exceeded (MOD-05) | Break loop, escalate to HITL |
| Critique fails 3x (MOD-06) | Escalate to human |

## Adding a New LLM Provider

Frankenbeast is LLM-agnostic. The firewall (MOD-01) already includes Claude and OpenAI adapters. To add a new provider:

1. **Implement `IAdapter`** in `frankenfirewall/src/adapters/`:

```typescript
import { BaseAdapter } from '../base-adapter.js';
import type { UnifiedRequest, UnifiedResponse } from '../../types/index.js';

export class GeminiAdapter extends BaseAdapter {
  readonly providerId = 'gemini';

  async transformRequest(request: UnifiedRequest): Promise<unknown> {
    // Map UnifiedRequest → Gemini API format
  }

  async execute(providerRequest: unknown): Promise<unknown> {
    // Call Gemini API
  }

  async transformResponse(providerResponse: unknown): Promise<UnifiedResponse> {
    // Map Gemini response → UnifiedResponse
  }
}
```

2. **Register** the adapter in `AdapterRegistry`
3. **Run conformance tests** to verify the adapter satisfies the `IAdapter` contract

## Guardrails as a Service

The firewall and critique modules are designed to wrap *any* agent framework as a standalone governance layer. Point your agent's LLM calls through the Frankenbeast firewall proxy:

```
Your Agent → Frankenbeast Firewall Proxy → LLM Provider
```

This is the deployment model for wrapping external agents (e.g., OpenClaw, custom agents). Safety constraints live in the proxy pipeline, not in the agent's prompt — so they survive context-window compression.

See the [Implementation Plan](IMPLEMENTATION_PLAN.md) Phase 5 for the full roadmap.

## Project Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Stabilise Individual Modules | Complete |
| 2 | LLM-Agnostic Adapter Layer | Planned |
| 3 | Inter-Module Contracts | Planned |
| 4 | The Orchestrator ("Beast Loop") | Planned |
| 5 | Guardrails as a Service | Planned |
| 6 | End-to-End Testing & Hardening | Planned |
| 7 | CLI & Developer Experience | Planned |

## Development

### Working on a module

Each module is self-contained. Work within its directory:

```bash
cd franken-brain
npm install
npm test
npm run build
```

### Testing patterns

All modules follow the same patterns:

- **Vitest** as test runner
- **Dependency injection** — all external deps are constructor-injected
- **Mock factories** — `vi.fn()` stubs for port interfaces
- **No I/O in unit tests** — real SQLite only in integration tests (`:memory:` mode)
- **Zod validation** at all system boundaries

### Project structure

```
frankenbeast/
├── ARCHITECTURE.md          # Module interconnection diagram (Mermaid)
├── IMPLEMENTATION_PLAN.md   # Development roadmap (7 phases, 42 PRs)
├── README.md                # This file
├── package.json             # npm workspaces root
├── vitest.config.ts         # Root integration test config
├── tests/                   # Root-level integration tests
│   ├── helpers/             # Shared stubs and test factories
│   └── integration/         # Cross-module integration tests
├── franken-brain/           # MOD-03: Memory Systems
├── franken-critique/        # MOD-06: Self-Critique & Reflection
├── franken-governor/        # MOD-07: HITL & Governance
├── franken-heartbeat/       # MOD-08: Proactive Reflection
├── franken-observer/        # MOD-05: Observability
├── franken-planner/         # MOD-04: Planning & Decomposition
├── franken-skills/          # MOD-02: Skill Registry
└── frankenfirewall/         # MOD-01: Firewall/Guardrails
```

## License

ISC
