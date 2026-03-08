# CLAUDE.md — franken-brain / MOD-03: Memory Systems

## Project

**Module:** MOD-03 (Memory Systems — State & Context Management)
**Role:** Tiered memory architecture for the Frankenbeast AI agent.
**Provides:** Working Memory, Episodic Memory, Semantic Memory, and a MemoryOrchestrator to MOD-04 (Planner) and MOD-01 (Guardrails).

---

## Tech Stack

| Concern                | Choice                        | ADR     |
| ---------------------- | ----------------------------- | ------- |
| Language               | TypeScript (strict mode, ESM) | ADR-001 |
| Runtime                | Node.js 22+                   | ADR-001 |
| Test runner            | Vitest                        | ADR-001 |
| Short-term persistence | `better-sqlite3` (SQLite)     | ADR-003 |
| Vector store           | ChromaDB (local)              | ADR-004 |
| ID generation          | `ulid`                        | ADR-006 |
| Runtime validation     | Zod                           | ADR-006 |
| Token counting         | `tiktoken`                    | ADR-005 |

---

## Directory Structure

```text
src/
  types/          Core types, interfaces, Zod schemas        (Phase 1)
  working/        WorkingMemoryStore — in-process context    (Phase 2)
  episodic/       EpisodicMemoryStore — SQLite traces        (Phase 3)
  semantic/       SemanticMemoryStore — ChromaDB RAG         (Phase 4)
  compression/    ICompressionStrategy implementations       (Phase 5)
  orchestrator/   MemoryOrchestrator — public API            (Phase 6)
  pii/            PII guard decorators — MOD-01 hook         (Phase 7)
  index.ts        Public barrel export

tests/
  unit/           No I/O; injected fakes for all stores
  integration/    SQLite :memory:, ChromaDB ephemeral
  fixtures/       Shared test data builders

docs/
  adr/            Architecture Decision Records (read before touching related code)
  implementation-plan.md

data/             gitignored — runtime SQLite db and ChromaDB files
```

---

## Key Commands

```bash
npm test                  # run all unit tests
npm run test:watch        # watch mode (use during TDD cycles)
npm run test:coverage     # unit + coverage report (gates: lines ≥90%, branches ≥80%)
npm run test:integration  # integration tests (requires ChromaDB server or ephemeral)
npm run typecheck         # tsc --noEmit
npm run build             # tsc → dist/
npm run lint              # eslint src/ tests/
```

---

## Architecture Decision Records

All significant decisions are documented in `docs/adr/`. **Read the relevant ADR before changing the code it governs.**

| ADR     | Decision                              | Key rule                                                                            |
| ------- | ------------------------------------- | ----------------------------------------------------------------------------------- |
| ADR-001 | TypeScript strict mode + ESM          | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` always on                  |
| ADR-002 | Tiered memory architecture            | Three tiers; `MemoryOrchestrator` is the only public entry point                    |
| ADR-003 | SQLite for episodic persistence       | DB handle injected via constructor; use `:memory:` in tests                         |
| ADR-004 | ChromaDB for semantic memory          | `IChromaClient` + `IEmbeddingProvider` interfaces; no direct SDK import in store    |
| ADR-005 | LLM-based compression strategy        | Always inject `ILlmClient`; fallback to `TruncationStrategy` on error               |
| ADR-006 | Metadata schema (ULID, discriminated) | `MemoryEntry` discriminated union; Zod schemas for all public inputs                |

**Adding a new ADR:** copy `docs/adr/ADR-000-template.md`, increment the number, link it from this table.

---

## Git Workflow

### Branch Naming

```text
feat/types-and-interfaces
feat/working-memory
feat/episodic-memory
feat/semantic-memory
feat/compression
feat/orchestrator
feat/pii-hook
fix/<short-description>
refactor/<short-description>
chore/<short-description>
docs/adr-<number>-<short-title>
```

### Commit Message Format

```text
<type>(<scope>): <subject>
```

**Types:** `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `perf`, `ci`

**Scopes:** `types`, `working`, `episodic`, `semantic`, `compression`, `orchestrator`, `pii`, `scaffold`

**Examples:**

```text
test(working): add failing tests for token budget pruning
feat(working): implement partitionForPruning pure function
refactor(episodic): extract SQL constants from EpisodicMemoryStore
```

### PR Contract

- **Max ~400 lines changed** per PR (excluding fixtures/generated)
- PR title: `[MOD-03] <type>: <short description>`
- Every PR must contain at least one commit with failing tests before the implementation commit
- Link the governing ADR in the PR description when making architectural changes

---

## TDD Cycle

Follow Red-Green-Refactor strictly. Each cycle ≤ 10 minutes.

1. **RED** — write one failing test in `tests/unit/`
2. **GREEN** — write minimum code in `src/` to pass it
3. **REFACTOR** — improve code quality; all tests stay green
4. **COMMIT** — atomic commit after each green step

**Test isolation rules:**

- Unit tests: inject fakes for all I/O (no real SQLite, no real ChromaDB, no real LLM)
- Integration tests: use `:memory:` SQLite and ChromaDB ephemeral client; tag with `@integration`
- Never `new Store()` inside the class under test — always inject dependencies

---

## Definition of Done

A phase is complete when:

- [ ] All `tests/unit/` tests pass (`npm test`)
- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` has no errors
- [ ] Coverage thresholds pass (`npm run test:coverage`)
- [ ] PR is self-reviewed with a clear description of *why*
- [ ] No `console.log` in `src/` (use structured logging or events)
- [ ] Governing ADR exists and is linked in the PR

---

## Installed Rule Templates

| Template             | Purpose                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Shared**           | Core principles, code quality, security, git workflow, communication |
| **javascript-expert**| Principal-level TypeScript/Node.js patterns                          |
| **web-backend**      | API design, error handling, authentication, database patterns        |
| **testing**          | TDD, test design, CI/CD integration, coverage metrics                |

All rules are in `.cursor/rules/`. Re-run to update:

```bash
npx @djm204/agent-skills javascript-expert web-backend testing
```

---

## Module Interfaces (for other modules)

### What MOD-03 exports (`src/index.ts`)

```typescript
// Primary API
export { MemoryOrchestrator } from './orchestrator/index.js';

// Types (for MOD-04 Planner and MOD-01 Guardrails)
export type {
  MemoryEntry,
  WorkingTurn,
  EpisodicTrace,
  SemanticChunk,
  MemoryMetadata,
  MemoryStatus,
  TokenBudget,
  IEpisodicStore,
  ISemanticStore,
  ICompressionStrategy,
  IPiiScanner,
} from './types/index.js';
```

### MOD-04 (Planner) integration points

- `orchestrator.frontload(projectId)` — loads semantic chunks at session start
- `orchestrator.getContext()` — returns pruned working memory + relevant semantic hits
- `orchestrator.pruneContext(budget)` — called before each LLM request

### MOD-01 (Guardrails) integration points

- Implement `IPiiScanner` and inject into `MemoryOrchestrator` constructor
- `PiiGuardedEpisodicStore` and `PiiGuardedSemanticStore` decorators wire in automatically
