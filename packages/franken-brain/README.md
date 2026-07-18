# @franken/brain — MOD-03: Memory Systems

Current public API: `SqliteBrain`, `SqliteMemoryReviewQueue`, `SqliteMemoryAccessAuditTrail`, `WorkingMemoryLimitError`, `UnsupportedMemorySchemaVersionError`, memory-encryption error classes, `MemoryConfidenceDecayError`, `DEFAULT_WORKING_MEMORY_LIMITS`, `DEFAULT_MEMORY_CONFIDENCE_HALF_LIFE_MS`, `CURRENT_MEMORY_SCHEMA_VERSION`, `calculateMemoryConfidenceDecay`, and the `WorkingMemoryLimits`, `SqliteBrainOptions`, `MemoryCandidateProposal`, `MemoryCandidate`, `MemoryCandidateEdit`, `MemoryCandidateStatus`, `MemoryReviewDecisionOptions`, `MemoryProvenanceRecord`, `MemoryAccessAuditEvent`, `MemoryAccessAuditListOptions`, `MemoryAccessAuditOperation`, `MemoryAccessAuditOutcome`, `MemoryAccessAuditStore`, `MemorySchemaMetadata`, `MemorySchemaStoreMetadata`, `MemorySchemaMigrationOptions`, `MemorySchemaMigrationOperation`, `MemorySchemaMigrationResult`, `MemoryEncryptionOptions`, `MemoryEncryptionMetadata`, `MemoryEncryptionMigrationOptions`, `MemoryEncryptionMigrationResult`, `MemoryConfidenceDecayOptions`, and `MemoryConfidenceDecayResult` types.

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

// Agent learning capture can opt into a cooldown so retrospectives or coordinator
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

// Repeated skill/workflow failures can open an evidence-backed review gate for
// procedural skill evolution without storing raw logs. Callers store a sanitized
// failure pattern plus evidence pointers; once the threshold is met, a normal
// memory-review candidate is created so an operator can accept, edit, or discard
// the suggested skill update.
for (const evidenceId of ['run-1', 'run-2', 'run-3']) {
  brain.episodic.recordSkillFailure({
    skillName: 'resolve-issues',
    workflowName: 'issue-to-pr',
    failureSignature: 'Codex feedback was not folded back into the skill',
    evidenceId,
    suggestedPatchArea: 'Codex review loop pitfalls',
  });
}
const [skillReview] = brain.createSkillEvolutionReviewGate({ threshold: 3 });
if (skillReview) {
  brain.memoryReview.edit(skillReview.id, {
    value: {
      ...skillReview.value,
      suggestedPatchArea: 'Add a required lesson-forwarding closeout step',
    },
    reason: 'Reviewer narrowed the actionable skill section.',
  });
}

// Candidate durable memories stay user-visible until reviewed. They are not
// written to working memory until approval, and approvals retain provenance.
const candidate = brain.memoryReview.propose({
  targetStore: 'working',
  key: 'user.preference.response-style',
  value: 'concise',
  source: 'chat:turn-42',
  sourceType: 'user',
  sourceId: 'msg-42',
  confidence: 0.92,
  reason: 'User explicitly requested concise responses.',
  revalidateAt: '2026-08-01T00:00:00.000Z',
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
const compactForAgent = brain.memoryReview.listForAgent({
  key: 'user.preference.response-style',
});
// Contradictory candidates for an existing key are surfaced before approval so
// callers can explicitly keep the durable fact, replace it, keep both values
// under explicit scope, reject the new candidate, or expire the old value with
// an auditable decision note.
const changedPreference = brain.memoryReview.propose({
  targetStore: 'working',
  key: 'user.preference.response-style',
  value: 'detailed',
  source: 'chat:turn-43',
  confidence: 0.75,
  reason: 'A later message appeared to contradict the stored preference.',
});
const conflicts = brain.memoryReview.conflictsFor(changedPreference.id);
const prompt = brain.memoryReview.resolutionPromptFor(changedPreference.id);
if (conflicts.length > 0 && prompt) {
  brain.memoryReview.resolveConflict(changedPreference.id, {
    resolution: 'keep_both_scoped',
    scopedKey: 'user.preference.response-style.scope.longform-docs',
    reviewer: 'operator',
  });
}

// Confidence decay gives injection/retrieval code a deterministic way to lower
// old memory certainty without mutating the stored record. The result is
// structured so coordination/liveness tools can log the age, half-life, and applied floor.
const confidence = calculateMemoryConfidenceDecay({
  confidence: provenance?.confidence ?? 0.5,
  observedAt: provenance?.approvedAt ?? new Date().toISOString(),
  halfLifeMs: 30 * 24 * 60 * 60 * 1000,
  floor: 0.1,
});
if (confidence.confidence < 0.3) {
  console.log('Memory is low-confidence; ask for confirmation before injection.');
}

// Access auditing records memory operations with hashed keys/queries and
// metadata only; raw memory keys and values are not written to the audit table.
const accessAudit = brain.accessAudit.list({
  store: 'working',
  limit: 20,
});

// Confidence/update rules:
// - `sourceType: 'user'` means the user explicitly stated the fact/preference;
//   prefer it over lower-confidence inferred observations during injection.
// - `sourceType: 'inferred'` should use lower confidence, include a safe source id,
//   and usually set `expiresAt` or `revalidateAt` so stale observations are not
//   injected forever.
// - `sourceType: 'system' | 'tool' | 'operator'` should describe reproducible
//   evidence such as repository config, CLI output, or an operator decision.
// - Direct overwrites/deletes hide stale provenance; conflicting candidates must
//   be resolved explicitly with `resolveConflict()` so update history remains
//   explainable.
// `listForAgent()` returns compact strings plus metadata (created/updated time,
// source type/id, confidence, decayed confidence, expiry, revalidation status)
// and hides expired memories by default unless `includeExpired` is true.

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
