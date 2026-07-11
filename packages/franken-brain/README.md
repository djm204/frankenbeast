# @franken/brain — MOD-03: Memory Systems

Current public API: `SqliteBrain`, `WorkingMemoryLimitError`, `DEFAULT_WORKING_MEMORY_LIMITS`, and the `WorkingMemoryLimits` type.

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

// Agent learning capture can opt into a cooldown so retrospectives or PM
// handoffs do not churn the same lesson repeatedly. The key is stored in
// details.learningKey; duplicate attempts return a structured cooldown result
// instead of silently inserting another episodic row.
const learningResult = brain.episodic.recordLearning({
  type: 'observation',
  step: 'worker-retrospective',
  summary: 'Run targeted package tests before broad verification',
  createdAt: new Date().toISOString(),
}, {
  key: 'targeted-package-tests',
  cooldownMs: 24 * 60 * 60 * 1000,
});
if (!learningResult.recorded) {
  console.log(`Learning still cooling down until ${learningResult.cooldownUntil}`);
}

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
