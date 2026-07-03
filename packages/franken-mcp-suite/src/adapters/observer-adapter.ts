import {
  CostCalculator,
  DEFAULT_PRICING,
  createAuditEvent,
  hashContent,
} from '@frankenbeast/observer';
import { createSqliteStore } from '../shared/sqlite-store.js';

export interface ObserverLogInput {
  event: string;
  metadata: string;
  sessionId: string;
}

export interface ObserverLogResult {
  id: number | string;
  hash: string;
}

export interface ObserverCostSummary {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCostUsd: number;
  byModel: Array<{
    model: string;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
  }>;
}

export interface ObserverTrailEntry {
  eventType: string;
  payload: string;
  hash?: string;
  parentHash?: string;
  createdAt: string;
}

export interface ObserverVerifyResult {
  ok: boolean;
  checked: number;
  firstInvalid?: {
    index: number;
    expectedHash: string;
    actualHash?: string | undefined;
    expectedParentHash?: string | undefined;
    actualParentHash?: string | undefined;
  };
}

export interface ObserverCostInput {
  sessionId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd?: number;
}

export interface ObserverAdapter {
  log(input: ObserverLogInput): Promise<ObserverLogResult>;
  logCost(input: ObserverCostInput): Promise<void>;
  cost(input: { sessionId?: string }): Promise<ObserverCostSummary>;
  trail(sessionId: string): Promise<ObserverTrailEntry[]>;
  verify(sessionId: string): Promise<ObserverVerifyResult>;
}

export function createObserverAdapter(dbPath: string): ObserverAdapter {
  const store = createSqliteStore(dbPath);
  const costCalculator = new CostCalculator(DEFAULT_PRICING, {
    onUnknownModel: () => {},
  });

  return {
    async log(input) {
      const payload = parseMetadata(input.metadata);
      const metadata = canonicalMetadata(input.metadata);
      const preflight = verifyAuditTrail(store, input.sessionId, true);
      if (!preflight.ok) {
        throw new Error(`Cannot append audit row to invalid trail at index ${preflight.firstInvalid?.index ?? 'unknown'}`);
      }
      const lastRow = store.db.prepare(
        'SELECT hash FROM audit_trail WHERE session_id = ? ORDER BY id DESC LIMIT 1',
      ).get(input.sessionId) as { hash: string } | undefined;

      const auditEvent = createAuditEvent(input.event, payload, {
        phase: 'mcp',
        provider: 'fbeast-mcp',
        input: metadata,
      });

      const baseHash = buildEventBaseHash(input.sessionId, input.event, metadata, auditEvent.inputHash);
      const hash = buildAuditHash(baseHash, lastRow?.hash);
      const result = store.db.prepare(`
        INSERT INTO audit_trail (session_id, event_type, payload, hash, parent_hash)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        input.sessionId,
        input.event,
        metadata,
        hash,
        lastRow?.hash ?? null,
      );

      return { id: Number(result.lastInsertRowid), hash };
    },

    async logCost(input) {
      const costUsd = input.costUsd ?? costCalculator.calculate({
        model: input.model,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
      });
      store.db.prepare(`
        INSERT INTO cost_ledger (session_id, model, prompt_tokens, completion_tokens, cost_usd)
        VALUES (?, ?, ?, ?, ?)
      `).run(input.sessionId, input.model, input.promptTokens, input.completionTokens, costUsd);
    },

    async cost(input) {
      let sql = `
        SELECT model, prompt_tokens, completion_tokens, cost_usd
        FROM cost_ledger
      `;
      const params: unknown[] = [];

      if (input.sessionId) {
        sql += ' WHERE session_id = ?';
        params.push(input.sessionId);
      }

      const rows = store.db.prepare(sql).all(...params) as Array<{
        model: string;
        prompt_tokens: number;
        completion_tokens: number;
        cost_usd: number;
      }>;

      const grouped = new Map<string, {
        model: string;
        promptTokens: number;
        completionTokens: number;
        costUsd: number;
      }>();

      for (const row of rows) {
        const current = grouped.get(row.model) ?? {
          model: row.model,
          promptTokens: 0,
          completionTokens: 0,
          costUsd: 0,
        };

        current.promptTokens += row.prompt_tokens;
        current.completionTokens += row.completion_tokens;
        current.costUsd += row.cost_usd > 0
          ? row.cost_usd
          : costCalculator.calculate({
              model: row.model,
              promptTokens: row.prompt_tokens,
              completionTokens: row.completion_tokens,
            });

        grouped.set(row.model, current);
      }

      const byModel = [...grouped.values()];
      return {
        totalPromptTokens: byModel.reduce((sum, row) => sum + row.promptTokens, 0),
        totalCompletionTokens: byModel.reduce((sum, row) => sum + row.completionTokens, 0),
        totalCostUsd: byModel.reduce((sum, row) => sum + row.costUsd, 0),
        byModel,
      };
    },

    async trail(sessionId) {
      return store.db.prepare(
        'SELECT event_type AS eventType, payload, hash, parent_hash AS parentHash, created_at AS createdAt FROM audit_trail WHERE session_id = ? ORDER BY id ASC',
      ).all(sessionId) as ObserverTrailEntry[];
    },

    async verify(sessionId) {
      return verifyAuditTrail(store, sessionId, true);
    },
  };
}

interface AuditTrailRow extends ObserverTrailEntry {
  id: number;
}

interface PendingAuditMigration {
  id: number;
  hash: string;
  parentHash: string | undefined;
}

function verifyAuditTrail(
  store: ReturnType<typeof createSqliteStore>,
  sessionId: string,
  migrate: boolean,
): ObserverVerifyResult {
  const rows = store.db.prepare(
    'SELECT id, event_type AS eventType, payload, hash, parent_hash AS parentHash, created_at AS createdAt FROM audit_trail WHERE session_id = ? ORDER BY id ASC',
  ).all(sessionId) as AuditTrailRow[];
  const pendingMigrations: PendingAuditMigration[] = [];
  let expectedParentHash: string | undefined;
  let previousStoredHash: string | undefined;
  let expectedLegacy16ParentHash: string | undefined;

  for (const [index, row] of rows.entries()) {
    const metadata = row.payload;
    const payload = parseMetadata(metadata);
    const auditEvent = createAuditEvent(row.eventType, payload, {
      phase: 'mcp',
      provider: 'fbeast-mcp',
      input: metadata,
    });
    const baseHash = buildEventBaseHash(sessionId, row.eventType, metadata, auditEvent.inputHash);
    const expectedHash = buildAuditHash(baseHash, expectedParentHash);
    const expectedHashFromStoredParent = buildAuditHash(baseHash, previousStoredHash);
    const expectedLegacy16Hash = buildMatchingLegacy16Hash(row, expectedLegacy16ParentHash);
    const actualParentHash = row.parentHash ?? undefined;
    const matchesCurrent = actualParentHash === expectedParentHash && row.hash === expectedHash;
    const matchesStoredParent = !matchesCurrent
      && previousStoredHash !== expectedParentHash
      && actualParentHash === previousStoredHash
      && row.hash === expectedHashFromStoredParent;
    const matchesLegacy16 = expectedLegacy16Hash !== undefined
      && actualParentHash === expectedLegacy16ParentHash
      && row.hash === expectedLegacy16Hash;

    if (!matchesCurrent && !matchesStoredParent && !matchesLegacy16) {
      return invalidAuditResult(index, row, expectedHash, expectedParentHash, actualParentHash);
    }

    if (!matchesCurrent && matchesLegacy16 && !legacy16RowIsBoundToTrail(row, sessionId)) {
      return invalidAuditResult(index, row, expectedHash, expectedParentHash, actualParentHash);
    }

    if (!matchesCurrent) {
      pendingMigrations.push({ id: row.id, hash: expectedHash, parentHash: expectedParentHash });
    }

    previousStoredHash = row.hash;
    expectedParentHash = expectedHash;
    expectedLegacy16ParentHash = matchesLegacy16 ? row.hash : undefined;
  }

  if (migrate) {
    for (const migration of pendingMigrations) {
      migrateAuditRow(store, migration.id, migration.hash, migration.parentHash);
    }
  }

  return { ok: true, checked: rows.length };
}

function invalidAuditResult(
  index: number,
  row: AuditTrailRow,
  expectedHash: string,
  expectedParentHash: string | undefined,
  actualParentHash: string | undefined,
): ObserverVerifyResult {
  return {
    ok: false,
    checked: index,
    firstInvalid: {
      index,
      expectedHash,
      actualHash: row.hash,
      expectedParentHash,
      actualParentHash,
    },
  };
}

function buildAuditHash(baseHash: string, parentHash?: string): string {
  if (!parentHash) {
    return baseHash;
  }

  return hashContent(`${parentHash}:${baseHash}`);
}

function buildEventBaseHash(sessionId: string, eventType: string, metadata: string, inputHash?: string): string {
  return hashContent(`${sessionId}:${eventType}:${inputHash ?? ''}:${metadata}`);
}

function buildLegacy16AuditHash(inputHash?: string, parentHash?: string): string {
  const baseHash = (inputHash ?? hashContent('')).slice(0, 16);
  if (!parentHash) {
    return baseHash;
  }

  return hashContent(`${parentHash}:${baseHash}`).slice(0, 16);
}

function buildMatchingLegacy16Hash(row: AuditTrailRow, parentHash?: string): string | undefined {
  if (!isLegacy16Hash(row.hash)) return undefined;

  for (const metadata of legacyMetadataCandidates(row.payload)) {
    const expected = buildLegacy16AuditHash(hashContent(metadata), parentHash);
    if (row.hash === expected) return expected;
  }

  // Older loggers hashed the caller's raw metadata but stored JSON.stringify(payload).
  // Once insignificant whitespace was discarded, some intact legacy hashes cannot be
  // recomputed from the stored row. Treat only structurally bound JSON-object rows as
  // plausible legacy entries; the caller still enforces the session/event binding
  // before migrating them to the current full-hash format.
  return isPlainObject(parseMetadata(row.payload)) ? row.hash : undefined;
}

function isLegacy16Hash(hash: string | undefined): hash is string {
  return /^sha256:[a-f0-9]{9}$/.test(hash ?? '');
}

function legacyMetadataCandidates(storedMetadata: string): string[] {
  const candidates = [storedMetadata];
  try {
    const parsed = JSON.parse(storedMetadata) as unknown;
    candidates.push(JSON.stringify(parsed, null, 2));
    if (isPlainObject(parsed)) {
      candidates.push(prettyOneLineJson(parsed));
    }
  } catch {
    // Non-JSON legacy metadata has no alternate insignificant-whitespace form.
  }

  return [...new Set(candidates)];
}

function prettyOneLineJson(value: Record<string, unknown>): string {
  return `{ ${Object.entries(value)
    .map(([key, nested]) => `${JSON.stringify(key)}: ${JSON.stringify(nested)}`)
    .join(', ')} }`;
}

function legacy16RowIsBoundToTrail(row: AuditTrailRow, sessionId: string): boolean {
  const payload = parseMetadata(row.payload);
  if (!isPlainObject(payload)) return false;

  const payloadSession = payload['sessionId'] ?? payload['session_id'];
  const payloadEvent = payload['eventType'] ?? payload['event_type'] ?? payload['event'];
  return payloadSession === sessionId && (payloadEvent === undefined || payloadEvent === row.eventType);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function migrateAuditRow(store: ReturnType<typeof createSqliteStore>, id: number, hash: string, parentHash?: string): void {
  store.db.prepare('UPDATE audit_trail SET hash = ?, parent_hash = ? WHERE id = ?').run(hash, parentHash ?? null, id);
}

function parseMetadata(metadata: string): unknown {
  try {
    return JSON.parse(metadata);
  } catch {
    return metadata;
  }
}

function canonicalMetadata(metadata: string): string {
  try {
    return JSON.stringify(JSON.parse(metadata));
  } catch {
    return metadata;
  }
}
