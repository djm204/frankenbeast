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
  createdAt: string;
}

export interface ObserverAdapter {
  log(input: ObserverLogInput): Promise<ObserverLogResult>;
  cost(input: { sessionId?: string }): Promise<ObserverCostSummary>;
  trail(sessionId: string): Promise<ObserverTrailEntry[]>;
}

export function createObserverAdapter(dbPath: string): ObserverAdapter {
  const store = createSqliteStore(dbPath);
  const costCalculator = new CostCalculator(DEFAULT_PRICING, {
    onUnknownModel: () => {},
  });

  return {
    async log(input) {
      const payload = parseMetadata(input.metadata);
      const lastRow = store.db.prepare(
        'SELECT hash FROM audit_trail WHERE session_id = ? ORDER BY id DESC LIMIT 1',
      ).get(input.sessionId) as { hash: string } | undefined;

      const auditEvent = createAuditEvent(input.event, payload, {
        phase: 'mcp',
        provider: 'fbeast-mcp',
        input: input.metadata,
      });

      const baseHash = auditEvent.inputHash ?? hashContent(`${input.event}:${input.metadata}`);
      const hash = buildAuditHash(baseHash, lastRow?.hash);
      const result = store.db.prepare(`
        INSERT INTO audit_trail (session_id, event_type, payload, hash, parent_hash)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        input.sessionId,
        input.event,
        JSON.stringify(payload),
        hash,
        lastRow?.hash ?? null,
      );

      return { id: Number(result.lastInsertRowid), hash };
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
        'SELECT event_type AS eventType, payload, hash, created_at AS createdAt FROM audit_trail WHERE session_id = ? ORDER BY id ASC',
      ).all(sessionId) as ObserverTrailEntry[];
    },
  };
}

function buildAuditHash(baseHash: string, parentHash?: string): string {
  if (!parentHash) {
    return baseHash.slice(0, 16);
  }

  return hashContent(`${parentHash}:${baseHash}`).slice(0, 16);
}

function parseMetadata(metadata: string): unknown {
  try {
    return JSON.parse(metadata);
  } catch {
    return metadata;
  }
}
