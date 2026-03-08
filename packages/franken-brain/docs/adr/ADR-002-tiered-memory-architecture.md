# ADR-002: Tiered Memory Architecture (Working / Episodic / Semantic)

- **Date:** 2026-02-19
- **Status:** Accepted
- **Deciders:** franken-brain team

## Context

The Frankenbeast agent needs memory that operates at different speeds, retention horizons, and retrieval semantics. A single flat store cannot satisfy:

1. **Immediacy**: The agent's active context window needs sub-millisecond read/write
2. **Traceability**: Execution traces must survive between tool calls within a session
3. **Knowledge recall**: Project ADRs, coding standards, and domain docs must be retrieved by semantic similarity, not by key
4. **Cost control**: Long contexts burn tokens; older turns must be compressible without loss of critical information

Forcing all three concerns into one data store creates coupling that makes each concern harder to optimise independently.

## Decision

Implement **three distinct memory tiers** as separate, independently-testable abstractions behind a common `MemoryStore` interface:

```
IMemoryStore
├── WorkingMemoryStore    — in-process Map<string, Turn[]>
├── EpisodicMemoryStore   — SQLite (better-sqlite3)
└── SemanticMemoryStore   — ChromaDB (local vector store)
```

Each tier exposes only what it needs:
- `WorkingMemoryStore`: `push(turn)`, `prune(budget: TokenBudget)`, `snapshot()`
- `EpisodicMemoryStore`: `record(trace)`, `query(taskId)`, `summarize(olderThan)`
- `SemanticMemoryStore`: `upsert(chunk)`, `search(query, topK)`, `delete(id)`

A `MemoryOrchestrator` composes all three tiers and is the only public entry point for other modules (MOD-04 Planner).

## Consequences

### Positive
- Each tier can be tested in isolation with no external dependencies (mock the others)
- Tiers can be swapped independently (e.g., replace ChromaDB with Pinecone) behind the interface
- Clear ownership: token budget concerns live only in `WorkingMemoryStore`
- MOD-01 PII scanning only needs to intercept the `EpisodicMemoryStore.record` and `SemanticMemoryStore.upsert` paths

### Negative
- More files and interfaces than a monolithic approach
- `MemoryOrchestrator` must handle consistency across tiers (e.g., a failed SQLite write after a successful working-memory update)

### Risks
- Tier-crossing queries (e.g., "find all failures for project X across episodic and semantic") require orchestrator-level logic — keep these minimal and well-tested

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Single Redis store for everything | Simple, fast | No native vector search; TTL semantics don't map to semantic memory | Can't do semantic similarity search |
| Single PostgreSQL store (pgvector) | One DB to manage | Requires Postgres infra; working memory in a DB is overkill | Operational overhead outweighs benefit for local-first MVP |
| Flat in-memory object | No dependencies, fast tests | Lost on restart, no semantic search | Violates "memory must survive restarts" requirement |
