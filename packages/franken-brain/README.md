# franken-brain — MOD-03: Memory Systems

> Tiered memory architecture for the Frankenbeast AI agent. Provides Working Memory, Episodic Memory, and Semantic Memory behind a single `MemoryOrchestrator` entry point.

---

## Overview

MOD-03 solves three distinct memory problems that arise in long-running AI agents:

| Problem | Tier | Backing store |
| ------- | ---- | ------------- |
| Token budget — the active prompt grows without bound | **Working Memory** | In-process `Map` |
| Traceability — what did we try? did it work? | **Episodic Memory** | SQLite (`better-sqlite3`) |
| Knowledge recall — what are the rules? what failed before? | **Semantic Memory** | ChromaDB (vector store) |

A `MemoryOrchestrator` composes all three tiers and is the only public entry point consumed by other modules (MOD-04 Planner, MOD-01 Guardrails).

---

## Architecture

```
MemoryOrchestrator
├── WorkingMemoryStore        in-process turns + token-budget pruning
│     └── ICompressionStrategy
│           ├── TruncationStrategy       (fallback, no LLM needed)
│           └── LlmSummarisationStrategy (calls ILlmClient, falls back on error)
├── EpisodicMemoryStore       SQLite — execution traces, status, metadata
│     └── EpisodicLessonExtractor       triggered at >20 traces
└── SemanticMemoryStore       ChromaDB — vector search over project knowledge
      ├── IChromaClient                 (interface — no direct SDK import)
      └── IEmbeddingProvider            (interface — local or API embeddings)

PII layer (Decorator pattern — opt-in)
├── PiiGuardedEpisodicStore   wraps EpisodicMemoryStore
└── PiiGuardedSemanticStore   wraps SemanticMemoryStore
```

Architecture decisions are documented in [`docs/adr/`](docs/adr/). Read the relevant ADR before changing the code it governs.

---

## Requirements

- Node.js 22+
- npm 10+
- For integration tests only: ChromaDB server (or use the in-memory ephemeral client)

---

## Installation

```bash
npm install
```

---

## Commands

```bash
npm test                  # unit tests (fast, no I/O)
npm run test:watch        # watch mode — use during TDD cycles
npm run test:coverage     # unit tests + coverage report
npm run test:integration  # integration tests (SQLite :memory: + real stores)
npm run typecheck         # tsc --noEmit
npm run build             # compile to dist/
```

---

## Usage

### Basic setup

```typescript
import Database from 'better-sqlite3';
import {
  MemoryOrchestrator,
  EpisodicMemoryStore,
  TruncationStrategy,
  EpisodicLessonExtractor,
  TokenBudget,
} from 'franken-brain';
import type { ISemanticStore, ILlmClient } from 'franken-brain';

// Implement the interfaces your infrastructure provides
const llm: ILlmClient = {
  async complete(prompt) { /* call Anthropic/OpenAI */ },
};

const semantic: ISemanticStore = {
  /* wire up your ChromaDB / Pinecone / etc. */
};

const orchestrator = new MemoryOrchestrator({
  episodic: new EpisodicMemoryStore(new Database('data/episodic.db')),
  semantic,
  strategy: new TruncationStrategy(),         // or LlmSummarisationStrategy(llm)
  extractor: new EpisodicLessonExtractor(llm),
  projectId: 'my-project',
});
```

### Agent loop

```typescript
// 1. Load project knowledge at session start
await orchestrator.frontload('my-project');

// 2. Record each conversation turn
orchestrator.recordTurn({
  id: generateId(), type: 'working', projectId: 'my-project',
  status: 'pending', createdAt: Date.now(),
  role: 'user', content: userMessage, tokenCount: estimateTokens(userMessage),
});

// 3. Prune before each LLM call to stay within the context window
await orchestrator.pruneContext(new TokenBudget(100_000, 0));

// 4. Read the current context
const { turns, semanticHints } = orchestrator.getContext();

// 5. Record tool results (triggers lesson extraction at >20 traces)
await orchestrator.recordToolResult({
  id: generateId(), type: 'episodic', projectId: 'my-project',
  status: exitCode === 0 ? 'success' : 'failure',
  createdAt: Date.now(), taskId: 'build',
  input: { cmd }, output: { exitCode, stderr },
});

// 6. Search semantic memory directly
const hints = await orchestrator.search('how to handle module errors', 5);
```

### Adding PII protection (MOD-01 hook)

Wrap the stores with the decorator before passing them to the orchestrator:

```typescript
import {
  PiiGuardedEpisodicStore,
  PiiGuardedSemanticStore,
} from 'franken-brain';
import type { IPiiScanner } from 'franken-brain';

const scanner: IPiiScanner = {
  async scan(data) {
    // plug in your PII detection library
    const hits = detectPii(data);
    if (hits.length === 0) return { clean: true };
    return { clean: false, mode: 'block', fields: hits };
  },
};

const guardedEpisodic = new PiiGuardedEpisodicStore(
  new EpisodicMemoryStore(db),
  scanner,
);

const guardedEpisodic.on('pii-detected', ({ fields }) => {
  auditLog.warn('PII blocked', { fields });
});

const orchestrator = new MemoryOrchestrator({
  episodic: guardedEpisodic,
  semantic: new PiiGuardedSemanticStore(semantic, scanner),
  // ...
});
```

---

## Project structure

```
src/
  types/          MemoryEntry union, Zod schemas, TokenBudget, generateId
  working/        WorkingMemoryStore, ICompressionStrategy, partitionForPruning
  episodic/       EpisodicMemoryStore, IEpisodicStore, SQLite migration
  semantic/       SemanticMemoryStore, ISemanticStore, IChromaClient, IEmbeddingProvider
  compression/    TruncationStrategy, LlmSummarisationStrategy, EpisodicLessonExtractor
  orchestrator/   MemoryOrchestrator (public entry point)
  pii/            PiiGuard, PiiDetectedError, decorator stores, IPiiScanner
  index.ts        Public barrel export

tests/
  unit/           No I/O — all stores injected as fakes
  integration/    SQLite :memory:, real EpisodicMemoryStore, real TruncationStrategy

docs/
  adr/            Architecture Decision Records
  implementation-plan.md
```

---

## Key design rules

- **`MemoryOrchestrator` is the only public entry point.** Other modules do not import individual stores directly.
- **No direct SDK imports inside stores.** `SemanticMemoryStore` depends on `IChromaClient` and `IEmbeddingProvider` interfaces — swap the backing store without touching the store code.
- **DB handle injected via constructor.** Use `:memory:` in tests; pass a real file-path database in production.
- **Compression strategies are injected.** `WorkingMemoryStore` does not know whether compression is LLM-based or truncation-based.
- **PII decoration is opt-in.** `PiiGuardedEpisodicStore` and `PiiGuardedSemanticStore` wrap the real stores using the Decorator pattern — the orchestrator never needs to change.

---

## Test coverage

```
All files  | 100% stmts | 98.68% branch | 100% funcs | 100% lines
```

Coverage gates (enforced in CI): lines ≥ 90%, branches ≥ 80%.

Run `npm run test:coverage` to see the full per-file breakdown.

---

## ADR index

| ADR | Decision |
| --- | -------- |
| [ADR-001](docs/adr/ADR-001-typescript-implementation-language.md) | TypeScript strict mode + ESM + Vitest |
| [ADR-002](docs/adr/ADR-002-tiered-memory-architecture.md) | Three-tier architecture with MemoryOrchestrator |
| [ADR-003](docs/adr/ADR-003-sqlite-episodic-persistence.md) | SQLite (`better-sqlite3`) for episodic persistence |
| [ADR-004](docs/adr/ADR-004-chromadb-semantic-memory.md) | ChromaDB for semantic memory (local-first) |
| [ADR-005](docs/adr/ADR-005-context-compression-strategy.md) | LLM-based compression with truncation fallback |
| [ADR-006](docs/adr/ADR-006-metadata-schema.md) | ULID IDs, discriminated union, Zod validation |
