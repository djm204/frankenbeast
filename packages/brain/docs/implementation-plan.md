# MOD-03: Memory Systems — Implementation Plan

> **Methodology:** TDD (Red-Green-Refactor) · Atomic Commits · Feature Branches · Small Isolated PRs
> **Architecture decisions:** See `docs/adr/` — read ADRs before touching the relevant code

---

## Repository Layout (Target)

```
franken-brain/
├── docs/
│   ├── adr/                    # Architecture Decision Records
│   └── implementation-plan.md  # This file
├── src/
│   ├── types/                  # MemoryEntry, MemoryMetadata, interfaces (ADR-006)
│   ├── working/                # WorkingMemoryStore (ADR-002)
│   ├── episodic/               # EpisodicMemoryStore + SQLite migrations (ADR-003)
│   ├── semantic/               # SemanticMemoryStore + ChromaDB client (ADR-004)
│   ├── compression/            # ICompressionStrategy, LlmSummarisationStrategy (ADR-005)
│   ├── orchestrator/           # MemoryOrchestrator — public entry point
│   └── index.ts                # Re-exports public API
├── tests/
│   ├── unit/                   # Per-module, no I/O
│   ├── integration/            # SQLite :memory:, ChromaDB ephemeral
│   └── fixtures/               # Shared test data builders
├── data/                       # gitignored runtime data (episodic.db, chroma/)
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Phases Overview

| Phase | Feature Branch | What ships | PR size |
|-------|---------------|-----------|---------|
| 0 | `chore/project-scaffold` | Repo setup, tooling, CI skeleton | ~200 lines |
| 1 | `feat/types-and-interfaces` | Core type definitions (ADR-006) | ~150 lines |
| 2 | `feat/working-memory` | WorkingMemoryStore with token pruning | ~300 lines |
| 3 | `feat/episodic-memory` | EpisodicMemoryStore + SQLite | ~350 lines |
| 4 | `feat/semantic-memory` | SemanticMemoryStore + ChromaDB | ~400 lines |
| 5 | `feat/compression` | Compression strategies (ADR-005) | ~300 lines |
| 6 | `feat/orchestrator` | MemoryOrchestrator composing all tiers | ~250 lines |
| 7 | `feat/pii-hook` | MOD-01 PII scan hook on persist paths | ~200 lines |

---

## Phase 0 — Project Scaffold

**Branch:** `chore/project-scaffold`
**Goal:** Runnable `vitest` suite with zero tests passing (just the harness).

### Steps

1. `npm init -y` → set `"type": "module"`
2. Install dev dependencies:
   ```
   typescript tsx vitest @vitest/coverage-v8
   @types/node better-sqlite3 @types/better-sqlite3
   chromadb ulid tiktoken zod
   ```
3. Create `tsconfig.json` (strict mode, ESM, `noUncheckedIndexedAccess`)
4. Create `vitest.config.ts` with coverage thresholds (branches ≥ 80%, lines ≥ 90%)
5. Add npm scripts: `test`, `test:watch`, `test:coverage`, `build`, `typecheck`
6. Create `.gitignore` (node_modules, dist, data/, *.db, coverage/)
7. Create `src/index.ts` (empty barrel export)
8. Create first smoke test: `tests/unit/smoke.test.ts` — assert `1 + 1 === 2`

### Atomic Commits
```
chore(scaffold): init package.json with ESM and typescript
chore(scaffold): add tsconfig with strict mode
chore(scaffold): configure vitest with coverage thresholds
chore(scaffold): add gitignore and empty src/index.ts
test(scaffold): add smoke test to verify test harness runs
```

### PR Checklist
- [ ] `npm test` runs and smoke test passes
- [ ] `npm run typecheck` exits 0
- [ ] No `node_modules`, `dist`, or `data/` tracked

---

## Phase 1 — Types & Interfaces

**Branch:** `feat/types-and-interfaces`
**ADR:** ADR-006
**Goal:** All shared TypeScript types and store interfaces. No implementation.

### TDD Test List (write tests BEFORE the types)

```
tests/unit/types/memory-metadata.test.ts
  ✗ ULID id is sortable (later ULID > earlier ULID)
  ✗ MemoryEntry discriminated union narrows correctly on type field
  ✗ WorkingTurn requires role and content
  ✗ EpisodicTrace requires taskId
  ✗ SemanticChunk requires source and content
  ✗ MemoryStatus rejects unknown string values (Zod parse)

tests/unit/types/token-budget.test.ts
  ✗ TokenBudget.remaining returns budget - used
  ✗ TokenBudget.isExhausted returns true when used >= budget
```

### Red-Green-Refactor Cycles

**Cycle 1:** ULID sort property
- RED: write test asserting two ULIDs generated 1ms apart are sortable
- GREEN: `ulid()` call in `src/types/ids.ts`
- REFACTOR: extract `generateId()` wrapper

**Cycle 2:** Discriminated union narrowing
- RED: write test that a `switch(entry.type)` TypeScript compile error occurs on unhandled arm
- GREEN: define `MemoryEntry` union in `src/types/memory.ts`
- REFACTOR: extract each member type to its own named export

**Cycle 3:** Zod runtime validation
- RED: test that `parseMemoryStatus('unknown')` throws
- GREEN: create `MemoryStatusSchema` with `z.enum`
- REFACTOR: compose schema from reusable `MemoryMetadataSchema`

### Atomic Commits
```
test(types): add failing tests for ULID sort property
feat(types): add generateId() using ulid
test(types): add failing tests for MemoryEntry discriminated union
feat(types): define WorkingTurn, EpisodicTrace, SemanticChunk union
test(types): add failing Zod tests for MemoryStatus validation
feat(types): add Zod schemas for runtime memory entry validation
refactor(types): extract MemoryMetadataSchema as shared base
test(types): add failing tests for TokenBudget helpers
feat(types): implement TokenBudget value object
```

### PR Checklist
- [ ] No implementation files — only `src/types/` and `tests/unit/types/`
- [ ] All tests pass; coverage 100% on `src/types/`
- [ ] No circular imports

---

## Phase 2 — Working Memory Store

**Branch:** `feat/working-memory`
**ADR:** ADR-002, ADR-005
**Goal:** In-process store with token-aware pruning. Zero I/O.

### TDD Test List

```
tests/unit/working/working-memory-store.test.ts
  ✗ push() appends a WorkingTurn
  ✗ push() updates token count
  ✗ snapshot() returns all turns in insertion order
  ✗ clear() empties all turns
  ✗ prune() does nothing when tokenCount < budget
  ✗ prune() triggers compression when tokenCount > 85% of budget
  ✗ prune() always preserves pinned turns
  ✗ prune() always preserves the most recent Plan turn
  ✗ prune() always preserves the most recent Tool Output turn
  ✗ prune() replaces compressed turns with a single summary turn
  ✗ getTokenCount() reflects current total
```

### Red-Green-Refactor Cycles

**Cycle 1:** push and snapshot
- RED → GREEN → REFACTOR: simple array + `Map<id, WorkingTurn>`

**Cycle 2:** token counting
- RED: test that pushing a turn with `tokenCount: 10` increments total by 10
- GREEN: maintain running `_totalTokens` counter
- REFACTOR: extract `tokenCount()` getter

**Cycle 3:** pruning trigger
- RED: test that `prune({ budget: 100 })` calls the compression strategy when `totalTokens = 90`
- GREEN: inject `ICompressionStrategy` as constructor arg; call when `totalTokens > budget * 0.85`
- REFACTOR: extract threshold constant to named config

**Cycle 4:** preservation rules
- RED: test that pinned and recent Plan turns survive pruning
- GREEN: partition turns into `preserved` and `candidates` before calling compressor
- REFACTOR: extract `partitionForPruning()` pure function (highly testable)

### Atomic Commits
```
test(working): add failing tests for push/snapshot lifecycle
feat(working): implement WorkingMemoryStore push and snapshot
test(working): add failing tests for token counting
feat(working): add token counting to WorkingMemoryStore
test(working): add failing prune trigger tests
feat(working): inject ICompressionStrategy, trigger on 85% budget
test(working): add failing preservation rule tests
feat(working): implement turn partitioning for pruning
refactor(working): extract partitionForPruning as pure function
```

### PR Checklist
- [ ] `ICompressionStrategy` is injected (not imported directly) — testable with a mock
- [ ] `partitionForPruning` has its own unit test file
- [ ] No filesystem access in this module

---

## Phase 3 — Episodic Memory Store

**Branch:** `feat/episodic-memory`
**ADR:** ADR-002, ADR-003
**Goal:** SQLite-backed trace store with structured queries.

### TDD Test List

```
tests/unit/episodic/episodic-memory-store.test.ts
  ✗ record() inserts a trace and returns its id
  ✗ record() rejects payloads failing Zod validation
  ✗ query(taskId) returns all traces for that task in recency order
  ✗ query() returns empty array when no traces exist
  ✗ queryFailed(projectId) returns only failure traces
  ✗ markCompressed(ids) sets status to 'compressed'
  ✗ count(projectId, taskId) returns correct count

tests/integration/episodic/episodic-memory-store.integration.test.ts
  ✗ persists across store re-instantiation (same :memory: db handle)
  ✗ migration runs idempotently on second instantiation
```

### Red-Green-Refactor Cycles

**Cycle 1:** `record()` and `query()` with in-memory SQLite
- Create `src/episodic/migrations/001_create_episodic_traces.sql`
- `EpisodicMemoryStore` constructor runs migration
- Tests use `:memory:` db injected via constructor

**Cycle 2:** Zod validation on `record()`
- RED: test that recording an entry with invalid status throws `ValidationError`
- GREEN: parse input with `EpisodicTraceSchema` before insert

**Cycle 3:** `queryFailed()` and `markCompressed()`
- RED: write tests for both
- GREEN: SQL with `WHERE status = ?`

**Cycle 4:** `count()` for compression threshold check (needed by orchestrator)

### Atomic Commits
```
test(episodic): add failing unit tests with in-memory SQLite
feat(episodic): create migration SQL and run on construction
feat(episodic): implement record() with Zod validation
test(episodic): add failing tests for queryFailed and markCompressed
feat(episodic): implement queryFailed and markCompressed
test(episodic): add failing count() test
feat(episodic): implement count()
test(episodic): add integration tests for persistence across instances
```

### PR Checklist
- [ ] DB handle injected via constructor (not module-level singleton)
- [ ] All SQL strings in named constants, not inline
- [ ] Integration test uses `:memory:` not a file path

---

## Phase 4 — Semantic Memory Store

**Branch:** `feat/semantic-memory`
**ADR:** ADR-002, ADR-004
**Goal:** ChromaDB-backed vector store with embedding abstraction.

### TDD Test List

```
tests/unit/semantic/semantic-memory-store.test.ts
  ✗ upsert() calls IEmbeddingProvider with chunk content
  ✗ upsert() stores metadata alongside embedding
  ✗ search() returns top-K results sorted by similarity
  ✗ search() filters by projectId metadata
  ✗ delete(id) removes the entry
  ✗ deleteCollection(projectId) removes all entries for a project

tests/unit/semantic/embedding-provider.test.ts
  ✗ IEmbeddingProvider interface is implemented by LocalEmbeddingProvider
  ✗ mock provider returns deterministic vectors for test isolation
```

### Red-Green-Refactor Cycles

**Cycle 1:** Mock ChromaDB client + mock embedding provider
- Define `IChromaClient` and `IEmbeddingProvider` interfaces
- `SemanticMemoryStore` takes both as constructor args
- Unit tests inject fakes — no real ChromaDB

**Cycle 2:** `upsert()` wires embedding → store
**Cycle 3:** `search()` with similarity + metadata filter
**Cycle 4:** Integration test with ChromaDB ephemeral client

### Atomic Commits
```
test(semantic): add failing unit tests with mock ChromaDB and embeddings
feat(semantic): define IChromaClient and IEmbeddingProvider interfaces
feat(semantic): implement SemanticMemoryStore with mock injections
test(semantic): add failing search and filter tests
feat(semantic): implement search with topK and metadata filter
test(semantic): add failing delete tests
feat(semantic): implement delete and deleteCollection
test(semantic): add integration test with ChromaDB ephemeral client
```

### PR Checklist
- [ ] No direct `import chromadb` in store — uses `IChromaClient` interface
- [ ] `LocalEmbeddingProvider` is behind `IEmbeddingProvider` interface
- [ ] Integration test tagged `@integration` and excluded from default test run

---

## Phase 5 — Compression Strategies

**Branch:** `feat/compression`
**ADR:** ADR-005
**Goal:** Strategy pattern with LLM and truncation implementations.

### TDD Test List

```
tests/unit/compression/truncation-strategy.test.ts
  ✗ returns turns that fit within budget
  ✗ preserves pinned turns even when over budget
  ✗ summary field indicates how many turns were dropped

tests/unit/compression/llm-summarisation-strategy.test.ts
  ✗ calls ILlmClient.complete() with turns formatted as prompt
  ✗ returns a single summary WorkingTurn with tokenCount recalculated
  ✗ falls back to TruncationStrategy when ILlmClient throws
  ✗ prompt includes instruction to preserve tool outputs

tests/unit/compression/episodic-lesson-extractor.test.ts
  ✗ calls ILlmClient.complete() with failure traces
  ✗ returns a LessonLearned SemanticChunk
  ✗ LessonLearned chunk has source = 'lesson-learned'
```

### Red-Green-Refactor Cycles

**Cycle 1:** `TruncationStrategy` — pure function, easiest
**Cycle 2:** `LlmSummarisationStrategy` with `ILlmClient` mock
**Cycle 3:** Fallback chain: LLM error → truncation
**Cycle 4:** `EpisodicLessonExtractor` for background compression

### Atomic Commits
```
test(compression): add failing TruncationStrategy tests
feat(compression): implement TruncationStrategy
test(compression): add failing LlmSummarisationStrategy tests
feat(compression): define ILlmClient interface
feat(compression): implement LlmSummarisationStrategy with fallback
test(compression): add failing EpisodicLessonExtractor tests
feat(compression): implement EpisodicLessonExtractor
refactor(compression): extract prompt templates to constants
```

### PR Checklist
- [ ] `ILlmClient` is injected — no direct Anthropic/OpenAI SDK imports in strategy files
- [ ] Fallback to `TruncationStrategy` is tested explicitly
- [ ] Prompt templates are constants (not inline strings)

---

## Phase 6 — Memory Orchestrator

**Branch:** `feat/orchestrator`
**ADR:** ADR-002
**Goal:** Public entry point composing all three tiers.

### TDD Test List

```
tests/unit/orchestrator/memory-orchestrator.test.ts
  ✗ recordTurn() pushes to WorkingMemoryStore
  ✗ recordToolResult() writes to EpisodicMemoryStore
  ✗ recordToolResult() triggers compression when episodic count > 20
  ✗ pruneContext(budget) delegates to WorkingMemoryStore.prune()
  ✗ search(query) delegates to SemanticMemoryStore.search()
  ✗ frontload(projectId) loads semantic chunks for the project
  ✗ getContext() returns working snapshot + relevant semantic hits

tests/integration/orchestrator/memory-orchestrator.integration.test.ts
  ✗ full round-trip: record tool failure → compress → searchable as lesson
```

### Atomic Commits
```
test(orchestrator): add failing tests for recordTurn delegation
feat(orchestrator): implement MemoryOrchestrator skeleton with DI
test(orchestrator): add failing tests for episodic trigger threshold
feat(orchestrator): implement recordToolResult with compression trigger
test(orchestrator): add failing tests for frontload and search
feat(orchestrator): implement frontload and getContext
test(orchestrator): add integration test for full lesson-learned round-trip
```

### PR Checklist
- [ ] All three stores injected via constructor (no `new` inside orchestrator)
- [ ] `MemoryOrchestrator` is the only exported class from `src/index.ts`
- [ ] Integration test demonstrates the full "failure → lesson → searchable" cycle

---

## Phase 7 — PII Hook (MOD-01 Integration)

**Branch:** `feat/pii-hook`
**Goal:** Intercept `EpisodicMemoryStore.record()` and `SemanticMemoryStore.upsert()` to run PII scan before persistence.

### TDD Test List

```
tests/unit/pii/pii-guard.test.ts
  ✗ allows entry through when IPiiScanner returns clean
  ✗ blocks entry and throws PiiDetectedError when scanner returns a hit
  ✗ redacts field values before persistence when scanner returns redact mode
  ✗ emits 'pii-detected' event with entry id and field names (for audit log)

tests/unit/pii/pii-guarded-episodic-store.test.ts
  ✗ PiiGuardedEpisodicStore.record() calls IPiiScanner before delegating to inner store
  ✗ does NOT call inner store when PII detected in block mode
```

### Design Pattern

Use the **Decorator pattern** — `PiiGuardedEpisodicStore` wraps `EpisodicMemoryStore` and implements the same interface:

```typescript
class PiiGuardedEpisodicStore implements IEpisodicStore {
  constructor(
    private inner: IEpisodicStore,
    private scanner: IPiiScanner,
  ) {}
  async record(trace: EpisodicTrace) {
    await this.scanner.scan(trace); // throws or redacts
    return this.inner.record(trace);
  }
}
```

### Atomic Commits
```
test(pii): add failing tests for PiiGuard allow/block/redact modes
feat(pii): define IPiiScanner interface and PiiDetectedError
feat(pii): implement PiiGuard with event emission
test(pii): add failing tests for PiiGuardedEpisodicStore decorator
feat(pii): implement PiiGuardedEpisodicStore and PiiGuardedSemanticStore
refactor(orchestrator): wire PII decorators into MemoryOrchestrator factory
```

### PR Checklist
- [ ] Decorator pattern — not monkey-patching or inheritance
- [ ] `IPiiScanner` is a stub in tests — no real PII scanning library yet
- [ ] Event emission is tested (not just the block behaviour)

---

## Cross-Cutting Concerns (Every Phase)

### Commit Message Format

Follow Conventional Commits (per `git-workflow.mdc`):

```
<type>(<scope>): <subject>

[optional body]

[optional footer: Closes #issue]
```

Scopes: `types`, `working`, `episodic`, `semantic`, `compression`, `orchestrator`, `pii`, `scaffold`

### PR Size Contract

- **Max 400 lines changed** per PR (excluding test fixtures and generated files)
- Every PR must have at least one failing test committed before the implementation commit
- PR title format: `[MOD-03] <type>: <short description>`

### Test Coverage Gates

| Metric | Threshold |
|--------|-----------|
| Line coverage | ≥ 90% |
| Branch coverage | ≥ 80% |
| Uncovered files | CI blocks merge |

### Definition of Done (per Phase)

- [ ] All tests in `tests/unit/` pass
- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` produces no errors
- [ ] PR is self-reviewed (description explains the why)
- [ ] ADR linked in PR description if an architectural decision was made
- [ ] No `console.log` left in production code paths

---

## Dependency Map

```
Phase 0 (scaffold)
  └── Phase 1 (types)
        ├── Phase 2 (working memory)
        │     └── Phase 5 (compression) ← also needs Phase 1
        ├── Phase 3 (episodic memory)
        │     └── Phase 5 (compression)
        ├── Phase 4 (semantic memory)
        │     └── Phase 5 (compression)
        └── Phases 2+3+4+5 → Phase 6 (orchestrator)
                                └── Phase 7 (PII hook)
```

Phases 2, 3, 4 are **independent after Phase 1** and can be worked in parallel on separate branches.
