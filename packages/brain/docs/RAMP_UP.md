# franken-brain (MOD-03) -- Agent Ramp-Up

Tiered memory system for the Frankenbeast AI agent. Provides working memory (in-process context window), episodic memory (SQLite trace log), and semantic memory (ChromaDB vector store), unified behind a `MemoryOrchestrator`.

## Directory Structure

```
src/
  types/          Core types, Zod schemas, TokenBudget, generateId (ulid)
  working/        WorkingMemoryStore -- in-process turn buffer + pruning
  episodic/       EpisodicMemoryStore -- SQLite-backed trace persistence
  semantic/       SemanticMemoryStore -- ChromaDB vector search
  compression/    TruncationStrategy, LlmSummarisationStrategy, EpisodicLessonExtractor
  orchestrator/   MemoryOrchestrator -- single public entry point
  pii/            PiiGuard + decorator stores for write-path PII scanning
tests/
  unit/           All I/O injected via fakes
  integration/    SQLite :memory:, ChromaDB ephemeral
```

## Public API (from `src/index.ts`)

### Classes
- `WorkingMemoryStore(strategy: ICompressionStrategy)` -- `.push(turn)`, `.snapshot()`, `.clear()`, `.getTokenCount()`, `.prune(budget)`
- `EpisodicMemoryStore(db: BetterSqlite3Database)` -- implements `IEpisodicStore`
- `SemanticMemoryStore(client: IChromaClient, embedder: IEmbeddingProvider)` -- implements `ISemanticStore`
- `TruncationStrategy` -- implements `ICompressionStrategy` (drops oldest turns)
- `LlmSummarisationStrategy(llm: ILlmClient)` -- implements `ICompressionStrategy` (LLM summary, fallback to truncation)
- `EpisodicLessonExtractor(llm: ILlmClient)` -- `.extract(traces): Promise<SemanticChunk>`
- `MemoryOrchestrator(deps: OrchestratorDeps)` -- `.recordTurn()`, `.pruneContext()`, `.recordToolResult()`, `.search()`, `.frontload()`, `.getContext()`
- `TokenBudget(budget: number, used: number)` -- `.remaining()`, `.isExhausted()`, `.isPressured()`, `.add(tokens)`
- `PiiGuard(scanner: IPiiScanner)` -- EventEmitter, `.check(data)`, emits `'pii-detected'`
- `PiiGuardedEpisodicStore(inner, scanner)` / `PiiGuardedSemanticStore(inner, scanner)` -- decorators

### Utilities
- `generateId(): string` -- ULID
- `parseMemoryEntry(value: unknown): MemoryEntry`
- `parseMemoryStatus(value: unknown): MemoryStatus`

## Key Types & Interfaces

```typescript
type MemoryStatus = 'success' | 'failure' | 'pending' | 'compressed'
type MemoryEntry = WorkingTurn | EpisodicTrace | SemanticChunk  // discriminated on `type`

interface WorkingTurn   { type: 'working',  role: 'user'|'assistant'|'tool', content, tokenCount, pinned? }
interface EpisodicTrace { type: 'episodic', taskId, toolName?, input, output }
interface SemanticChunk  { type: 'semantic', source, content, embedding? }
// All extend MemoryMetadata: { id, projectId, status, createdAt, tags? }

interface IEpisodicStore {
  record(trace): string | Promise<string>
  query(taskId, projectId?): EpisodicTrace[]
  queryFailed(projectId): EpisodicTrace[]
  markCompressed(ids: string[]): void
  count(projectId, taskId): number
}

interface ISemanticStore {
  upsert(chunks): Promise<void>
  search(query, topK, filter?): Promise<SemanticChunk[]>
  delete(id): Promise<void>
  deleteCollection(projectId): Promise<void>
}

interface IChromaClient {
  getOrCreateCollection(name): Promise<IChromaCollection>
  deleteCollection(name): Promise<void>
}

interface IEmbeddingProvider { embed(texts: string[]): Promise<number[][]> }
interface ICompressionStrategy { compress(candidates: WorkingTurn[], budget: number): Promise<CompressionResult> }
interface ILlmClient { complete(prompt: string): Promise<string> }  // NOT Result<string>
interface IPiiScanner { scan(data: unknown): Promise<ScanResult> }

type ScanResult = { clean: true } | { clean: false; mode: 'block'|'redact'; fields: string[] }

interface OrchestratorDeps { episodic, semantic, strategy, extractor, projectId }
interface AgentContext { turns: WorkingTurn[]; semanticHints: SemanticChunk[] }
```

## Three Memory Tiers

| Tier | Store | Backend | Lifetime | Purpose |
|------|-------|---------|----------|---------|
| Working | `WorkingMemoryStore` | In-process array | Session | Current conversation turns; pruned by `TokenBudget` |
| Episodic | `EpisodicMemoryStore` | SQLite (`better-sqlite3`) | Persistent | Tool execution traces; queryable by taskId/projectId |
| Semantic | `SemanticMemoryStore` | ChromaDB | Persistent | Vector-indexed knowledge chunks for RAG retrieval |

## Compression

- **TruncationStrategy** -- Drops oldest non-pinned turns to fit budget. No LLM call. Keeps newest turns first.
- **LlmSummarisationStrategy** -- Sends candidates to `ILlmClient.complete()` for a summary. Falls back to `TruncationStrategy` on error.
- **EpisodicLessonExtractor** -- Converts failed episodic traces into a `SemanticChunk` lesson via LLM. Auto-triggered by `MemoryOrchestrator` when trace count > 20.
- **Pruning partition** -- `partitionForPruning()` preserves: (1) pinned turns, (2) most recent `[Plan]` turn, (3) most recent tool turn.

## PII Guard System

- `IPiiScanner.scan(data)` returns `{ clean: true }` or `{ clean: false, mode, fields }`.
- `PiiGuard` wraps a scanner; emits `'pii-detected'` event; throws `PiiDetectedError` when `mode === 'block'`.
- `PiiGuardedEpisodicStore` / `PiiGuardedSemanticStore` -- decorator pattern. Scans on writes only (`.record()` / `.upsert()`). Reads pass through unscanned.

## Gotchas

- **ILlmClient signature**: `complete(prompt: string): Promise<string>` -- NOT `Promise<Result<string>>` (heartbeat uses a different `ILlmClient`).
- **TokenBudget constructor**: 2 args `(budget, used)` -- not `(budget, totalTokens)`. `.isExhausted()` takes no args.
- **EpisodicMemoryStore.record()** returns `string` (sync), but the `IEpisodicStore` interface allows `string | Promise<string>`.
- `better-sqlite3` and `chromadb` are **not** in `dependencies` -- `better-sqlite3` is a devDependency (injected at runtime by consumer); `chromadb` is accessed only through `IChromaClient`/`IEmbeddingProvider` interfaces.
- Zod version: `zod@^4.3.6` (v4 -- not v3).
- All IDs are ULIDs via `generateId()`.

## Build & Test

```bash
npm run build          # tsc -> dist/
npm test               # vitest run (unit tests)
npm run test:watch     # vitest watch mode
npm run test:coverage  # coverage gates: lines >= 90%, branches >= 80%
npm run test:integration  # SQLite :memory: + ChromaDB ephemeral
npm run typecheck      # tsc --noEmit
npm run lint           # eslint src/ tests/
```

## Dependencies

| Package | Role |
|---------|------|
| `zod@^4.3.6` | Runtime schema validation |
| `ulid@^3.0.2` | Sortable unique ID generation |
| `better-sqlite3@^12.6.2` | SQLite driver (devDep -- injected) |
| `typescript@^5.9.3` | Build |
| `vitest@^4.0.18` | Test runner |
