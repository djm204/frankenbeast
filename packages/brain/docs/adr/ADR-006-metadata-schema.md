# ADR-006: Memory Entry Metadata Schema

- **Date:** 2026-02-19
- **Status:** Accepted
- **Deciders:** franken-brain team

## Context

The project-outline.md mandates that every memory entry is tagged with:
- `project_id` — e.g., `Bold-Commerce-MultiCurrency`
- `status` — `Success` | `Failure`
- `timestamp` — to prioritise recent information

This schema must be consistent across all three tiers (working, episodic, semantic) to allow cross-tier queries and to support MOD-01's PII scanning, which filters entries by type before persistence.

A loose schema (plain objects with optional fields) would allow inconsistency to accumulate silently. A typed schema enforced at the TypeScript level prevents this.

## Decision

Define a **discriminated union** of memory entry types sharing a common `MemoryMetadata` base:

```typescript
type MemoryStatus = 'success' | 'failure' | 'pending' | 'compressed';

interface MemoryMetadata {
  id: string;          // ULID — sortable, URL-safe
  projectId: string;
  status: MemoryStatus;
  createdAt: number;   // Unix ms
  tags?: string[];     // optional freeform labels (e.g. ['pii-cleared', 'pinned'])
}

interface WorkingTurn extends MemoryMetadata {
  type: 'working';
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tokenCount: number;
  pinned?: boolean;
}

interface EpisodicTrace extends MemoryMetadata {
  type: 'episodic';
  taskId: string;
  toolName?: string;
  input: unknown;
  output: unknown;
}

interface SemanticChunk extends MemoryMetadata {
  type: 'semantic';
  source: string;   // e.g. 'adr/ADR-001', 'lesson-learned'
  content: string;
  embedding?: number[];  // omitted on write; populated by store
}

type MemoryEntry = WorkingTurn | EpisodicTrace | SemanticChunk;
```

**ID generation:** Use `ulid` library — ULIDs are monotonically sortable (no separate `ORDER BY created_at` needed for most queries) and URL-safe.

## Consequences

### Positive
- TypeScript discriminated union means `type` narrows the shape — no accidental access of `taskId` on a `WorkingTurn`
- `projectId` is a required field on every type — queries are always project-scoped
- `status: 'compressed'` allows episodic traces to be marked without deletion, preserving audit trail
- ULIDs eliminate the need for a separate sequence/auto-increment in SQLite

### Negative
- Adding a new memory type requires updating the union type and all switch/discriminate consumers
- `embedding` as an optional field on `SemanticChunk` means callers must not assume it's populated

### Risks
- `unknown` types for `EpisodicTrace.input/output` require runtime validation (Zod) before use — document this clearly

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Plain `Record<string, any>` | Flexible | No compile-time safety; silent schema drift | Defeats the purpose of TypeScript strict mode |
| UUID for IDs | Universally known | Not sortable; requires separate timestamp index for ORDER BY | ULIDs are strictly better for time-ordered data |
| Flat schema (no type discriminator) | Simpler | Can't narrow type safely in TypeScript | Would require runtime instanceof checks everywhere |
