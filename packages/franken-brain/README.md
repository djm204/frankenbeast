# @franken/brain — MOD-03: Memory Systems

Current public API: `SqliteBrain`, `SqliteMemoryReviewQueue`, `WorkingMemoryLimitError`, `UnsupportedMemorySchemaVersionError`, memory-encryption error classes, `MemoryConfidenceDecayError`, `DEFAULT_WORKING_MEMORY_LIMITS`, `DEFAULT_MEMORY_CONFIDENCE_HALF_LIFE_MS`, `CURRENT_MEMORY_SCHEMA_VERSION`, `calculateMemoryConfidenceDecay`, and the `WorkingMemoryLimits`, `SqliteBrainOptions`, `MemoryCandidateProposal`, `MemoryCandidate`, `MemoryCandidateEdit`, `MemoryCandidateStatus`, `MemoryReviewDecisionOptions`, `MemoryProvenanceRecord`, `MemorySchemaMetadata`, `MemorySchemaStoreMetadata`, `MemorySchemaMigrationOptions`, `MemorySchemaMigrationOperation`, `MemorySchemaMigrationResult`, `MemoryEncryptionOptions`, `MemoryEncryptionMetadata`, `MemoryEncryptionMigrationOptions`, `MemoryEncryptionMigrationResult`, `MemoryConfidenceDecayOptions`, and `MemoryConfidenceDecayResult` types.

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
import {
  SqliteBrain,
  calculateMemoryConfidenceDecay,
} from '@franken/brain';

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

// Candidate durable memories stay user-visible until reviewed. They are not
// written to working memory until approval, and approvals retain provenance.
const candidate = brain.memoryReview.propose({
  targetStore: 'working',
  key: 'user.preference.response-style',
  value: 'concise',
  source: 'chat:turn-42',
  confidence: 0.92,
  reason: 'User explicitly requested concise responses.',
});
const visibleQueue = brain.memoryReview.list();
brain.memoryReview.edit(candidate.id, {
  value: 'concise and direct',
  reason: 'Operator refined wording before persistence.',
});
brain.memoryReview.approve(candidate.id, {
  reviewer: 'operator',
  note: 'Confirmed with the user.',
});
const provenance = brain.memoryReview.provenanceFor(
  'working',
  'user.preference.response-style',
);

// Confidence decay gives injection/retrieval code a deterministic way to lower
// old memory certainty without mutating the stored record. The result is
// structured so PM/liveness tools can log the age, half-life, and applied floor.
const confidence = calculateMemoryConfidenceDecay({
  confidence: provenance?.confidence ?? 0.5,
  observedAt: provenance?.approvedAt ?? new Date().toISOString(),
  halfLifeMs: 30 * 24 * 60 * 60 * 1000,
  floor: 0.1,
});
if (confidence.confidence < 0.3) {
  console.log('Memory is low-confidence; ask for confirmation before injection.');
}

// Rejected candidates and never-store decisions are remembered so duplicate
// weak evidence or sensitive values do not silently reappear in the queue.
const secretCandidate = brain.memoryReview.propose({
  targetStore: 'working',
  key: 'env.secret.api-token',
  value: '[REDACTED]',
  source: 'terminal-output',
  confidence: 0.99,
  reason: 'Sensitive material should not persist without consent.',
});
brain.memoryReview.neverStore(secretCandidate.id, {
  reviewer: 'operator',
  note: 'Secrets must never be stored in memory.',
});

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

## Encryption at rest

`SqliteBrain` can encrypt persisted working memory rows, episodic summaries/details, and recovery checkpoint states with AES-256-GCM. Supply a key directly or point to an environment variable:

```typescript
import { SqliteBrain } from '@franken/brain';

const brain = new SqliteBrain('.fbeast/beast.db', undefined, {
  encryption: {
    enabled: true,
    keyEnvVar: 'FRANKEN_MEMORY_ENCRYPTION_KEY',
  },
});
```

String keys are SHA-256 derived into a 32-byte AES key. Buffer keys must already be exactly 32 bytes. The database records encrypted-store metadata in `memory_encryption_status`, and `SqliteBrain#getMemoryEncryptionMetadata()` returns whether each durable store is encrypted.

Encryption is fail-closed:

- opening an encrypted database without encryption enabled throws `MemoryEncryptionRequiredError`;
- opening with missing key material throws `MemoryEncryptionKeyUnavailableError`;
- opening with the wrong key throws `MemoryEncryptionWrongKeyError`;
- enabling encryption on an existing plaintext database throws `MemoryEncryptionMigrationRequiredError` until you explicitly migrate it.

Use the migration helper to convert existing plaintext memory with an auditable dry-run and optional SQLite backup:

```typescript
const plan = SqliteBrain.migrateMemoryEncryption('.fbeast/beast.db', {
  enabled: true,
  keyEnvVar: 'FRANKEN_MEMORY_ENCRYPTION_KEY',
  dryRun: true,
});
// inspect plan.operations

SqliteBrain.migrateMemoryEncryption('.fbeast/beast.db', {
  enabled: true,
  keyEnvVar: 'FRANKEN_MEMORY_ENCRYPTION_KEY',
  backupBeforeMigrate: true,
  backupPath: '.fbeast/beast.db.before-memory-encryption',
});
```

Keep the encryption key outside the SQLite database and application logs; losing it makes encrypted memory unrecoverable.

## Current architecture

```text
SqliteBrain
├── working       in-memory key/value store, flushed to SQLite on checkpoint
├── memoryReview  SQLite candidate/provenance/suppression queue for consented writes
├── episodic      SQLite `episodic_events` table with recent/query/failure recall
└── recovery      SQLite `checkpoints` table for execution state recovery
```

The package creates the required SQLite schema in its constructor and enables WAL mode. Use `:memory:` for tests or pass a file path for persistent state.

## Memory schema versioning and migrations

Durable memory stores are explicitly versioned. `working_memory`, `episodic_events`, and `checkpoints` rows include a `schema_version` column, and the `memory_schema_versions` table records the current schema version for each store. `SqliteBrain#getMemorySchemaMetadata()` returns the active store versions and record counts so callers can audit what is on disk.

`SqliteBrain` automatically upgrades version-0/legacy SQLite files that have the old tables but no version metadata. Use the migration helper before opening a database when you want an audit plan or a backup:

```typescript
import { SqliteBrain } from '@franken/brain';

const plan = SqliteBrain.migrateMemorySchema('.fbeast/beast.db', {
  dryRun: true,
});
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
