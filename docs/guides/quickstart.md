# Quickstart

Get Frankenbeast running locally in under 5 minutes.

## Prerequisites

- Node.js >= 22
- Docker (for ChromaDB and observability stack)

## 1. Install dependencies

```bash
npm install
```

## 2. Start infrastructure

```bash
docker compose up -d
```

This starts:
- **ChromaDB** (port 8000) — vector store for episodic memory
- **Grafana** (port 3000) — dashboards
- **Tempo** (port 3200) — distributed tracing

## 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

## 4. Seed the database

```bash
npx tsx scripts/seed.ts
```

## 5. Verify setup

```bash
npx tsx scripts/verify-setup.ts
```

## 6. Dry run

```bash
npx frankenbeast --project-id demo --dry-run
```

This prints the configuration without executing any tasks.

## 7. Build all modules

```bash
npm run build:all
```

## Project structure

```
frankenbeast/
├── frankenfirewall/         MOD-01: LLM Proxy & Guardrails
├── franken-skills/          MOD-02: Skill Registry
├── franken-brain/           MOD-03: Memory (Working + Episodic + Semantic)
├── franken-planner/         MOD-04: Task Planning & DAG Execution
├── franken-observer/        MOD-05: Observability & Cost Tracking
├── franken-critique/        MOD-06: Self-Critique & Reflection
├── franken-governor/        MOD-07: Human-in-the-Loop Governance
├── franken-heartbeat/       MOD-08: Continuous Improvement
├── franken-types/           Shared type definitions
├── franken-orchestrator/    The Beast Loop — ties everything together
└── tests/integration/       Cross-module integration tests
```

## Running tests

```bash
# All module unit tests
npm run test:all

# Root integration tests
npm test

# Orchestrator E2E tests
cd franken-orchestrator && npm run test:e2e
```
