# @franken/brain — MOD-03: Memory Systems

Current public API: `SqliteBrain`, `WorkingMemoryLimitError`, `UnsupportedMemorySchemaVersionError`, `DEFAULT_WORKING_MEMORY_LIMITS`, `CURRENT_MEMORY_SCHEMA_VERSION`, and the `WorkingMemoryLimits`, `MemorySchemaMetadata`, `MemorySchemaStoreMetadata`, `MemorySchemaMigrationOptions`, `MemorySchemaMigrationOperation`, and `MemorySchemaMigrationResult` types.

`@franken/brain` provides SQLite-backed working memory, episodic event recall, and recovery checkpoints for the Frankenbeast runtime. Older design docs described a `MemoryOrchestrator` with ChromaDB-backed semantic memory and PII-decorator stores; those classes are not exported by the current package.

## Requirements

- Node.js `>=22.13.0 <23 || >=24.0.0 <26` for the current package/runtime workflow
- npm 11.5.1 via the repository `packageManager` setting
- `better-sqlite3` (runtime dependency)

## Installation

```bash
npm install
```

## Commands

```bash
npm test                  # vitest run --reporter=verbose
npm run test:watch        # vitest --reporter=verbose
npm run test:coverage     # vitest run --coverage
npm run test:integration  # vitest run --reporter=verbose --config vitest.integration.config.ts
npm run typecheck         # tsc --noEmit
npm run build             # compile to dist/
npm run lint              # eslint src/ tests/
```

## Usage

```typescript
import { SqliteBrain } from '@franken/brain';

const brain = new SqliteBrain('.fbeast/beast.db');

// Working memory is an in-memory map that flushes during checkpoints.
brain.working.set('current-goal', 'Refresh docs for current architecture');
const goal = brain.working.get('current-goal');

// Episodic memory is persisted in SQLite and supports recent/query recall.
brain.episodic.record({
  type: 'success',
  step: 'docs-refresh',
  summary: 'Updated package inventory',
  details: { files: ['README.md'] },
  createdAt: new Date().toISOString(),
});
const related = brain.episodic.recall('package inventory', 5);

// Recovery memory stores execution checkpoints and flushes working memory.
const checkpoint = brain.recovery.checkpoint({
  runId: 'run-001',
  phase: 'docs-refresh',
  step: 1,
  context: { goal },
  timestamp: new Date().toISOString(),
});
const last = brain.recovery.lastCheckpoint();

// serialize/hydrate is useful for process handoff and tests.
const snapshot = brain.serialize();
brain.close();
const restored = SqliteBrain.hydrate(snapshot);
restored.close();
```

## Current architecture

```text
SqliteBrain
├── working    in-memory key/value store, flushed to SQLite on checkpoint
├── episodic   SQLite `episodic_events` table with recent/query/failure recall
└── recovery   SQLite `checkpoints` table for execution state recovery
```

The package creates the required SQLite schema in its constructor and enables WAL mode. Use `:memory:` for tests or pass a file path for persistent state.

## Memory schema versioning and migrations

Durable memory stores are explicitly versioned. `working_memory`, `episodic_events`, and `checkpoints` rows include a `schema_version` column, and the `memory_schema_versions` table records the current schema version for each store. `SqliteBrain#getMemorySchemaMetadata()` returns the active store versions and record counts so callers can audit what is on disk.

`SqliteBrain` automatically upgrades version-0/legacy SQLite files that have the old tables but no version metadata. Use the migration helper before opening a database when you want an audit plan or a backup:

```typescript
import { SqliteBrain } from '@franken/brain';

const plan = SqliteBrain.migrateMemorySchema('.fbeast/beast.db', { dryRun: true });
// inspect plan.operations

SqliteBrain.migrateMemorySchema('.fbeast/beast.db', {
  backupBeforeMigrate: true,
  backupPath: '.fbeast/beast.db.before-memory-schema-v1',
});
```

Future schema changes should increment `CURRENT_MEMORY_SCHEMA_VERSION`, add a forward-only migration in `migrateMemorySchemaDatabase`, and add fixtures that prove old databases upgrade and unsupported future versions fail closed with `UnsupportedMemorySchemaVersionError`. Do not silently ignore unknown future store or record versions.

## Project structure

```text
src/
  index.ts          Public barrel export (`SqliteBrain`)
  sqlite-brain.ts   Working, episodic, recovery, serialize/hydrate implementation

tests/
  *.test.ts         Unit/integration coverage for SqliteBrain behavior
```

## Notes for maintainers

- Do not document `MemoryOrchestrator`, `SemanticMemoryStore`, `EpisodicMemoryStore`, `TruncationStrategy`, `EpisodicLessonExtractor`, ChromaDB clients, or PII-guarded stores as current exports unless they are reintroduced in `src/index.ts` and covered by tests.
- If semantic/vector memory returns later, add it as a new documented API rather than reviving stale examples.
