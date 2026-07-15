import {
  SqliteBrain,
  type RightToForgetReport,
  type RightToForgetSelector,
} from "@franken/brain";
import Database from "better-sqlite3";
import { isoNow } from "@franken/types";

function configureBrainAdapterDb(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
}

export type MemoryReadScope = "all" | "shared" | "agent";

export interface MemoryScopeInput {
  /**
   * Read scope for memory retrieval. `all` preserves legacy behavior,
   * `shared` hides agent-scoped entries, and `agent` returns shared entries
   * plus entries explicitly scoped to agentId.
   */
  readScope?: MemoryReadScope;
  /** Agent id required when readScope is `agent`. */
  agentId?: string;
}

export interface BrainQueryInput extends MemoryScopeInput {
  query: string;
  type?: string;
  limit?: number;
}

export interface BrainMemoryEntry {
  key: string;
  value: string;
  type: string;
  createdAt?: string;
}

export interface BrainFrontloadSection {
  type: string;
  entries: string[];
}

export interface BrainAdapter {
  query(input: BrainQueryInput): Promise<BrainMemoryEntry[]>;
  store(input: {
    key: string;
    value: string;
    type: string;
    agentId?: string;
  }): Promise<void>;
  frontload(input?: MemoryScopeInput): Promise<BrainFrontloadSection[]>;
  forget(key: string): Promise<boolean>;
  rightToForget(input: RightToForgetSelector): Promise<RightToForgetReport>;
}

const SUPPORTED_MEMORY_TYPES = ["working", "episodic"] as const;
const DEFAULT_QUERY_LIMIT = 20;
const MAX_QUERY_LIMIT = 1000;
const AGENT_KEY_PREFIX = "agents/";
const AGENT_EPISODIC_PREFIX = "[agent:";

type SupportedMemoryType = (typeof SUPPORTED_MEMORY_TYPES)[number];

function normalizeAgentId(agentId: string | undefined): string | undefined {
  if (agentId === undefined) return undefined;
  const trimmed = agentId.trim();
  if (trimmed.length === 0) return undefined;
  return (
    trimmed.replace(/[^a-zA-Z0-9_.-]/g, "-").replace(/^-+|-+$/g, "") ||
    undefined
  );
}

function parseAgentFromWorkingKey(key: string): string | undefined {
  if (!key.startsWith(AGENT_KEY_PREFIX)) return undefined;
  const rest = key.slice(AGENT_KEY_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return undefined;
  return rest.slice(0, slash);
}

function parseAgentFromEpisodicSummary(summary: string): string | undefined {
  if (!summary.startsWith(AGENT_EPISODIC_PREFIX)) return undefined;
  const end = summary.indexOf("]");
  if (end <= AGENT_EPISODIC_PREFIX.length) return undefined;
  return summary.slice(AGENT_EPISODIC_PREFIX.length, end);
}

function scopedWorkingKey(key: string, agentId: string | undefined): string {
  const normalized = normalizeAgentId(agentId);
  return normalized ? `${AGENT_KEY_PREFIX}${normalized}/${key}` : key;
}

function scopedEpisodicSummary(
  key: string,
  value: string,
  agentId: string | undefined,
): string {
  const normalized = normalizeAgentId(agentId);
  const summary = `${key}: ${value}`;
  return normalized
    ? `${AGENT_EPISODIC_PREFIX}${normalized}] ${summary}`
    : summary;
}

function resolveMemoryReadScope(input: MemoryScopeInput): {
  readScope: MemoryReadScope;
  agentId?: string;
} {
  const readScope = input.readScope ?? "all";
  if (!["all", "shared", "agent"].includes(readScope)) {
    throw new Error(
      `Unsupported memory readScope: ${readScope}. Supported scopes: all, shared, agent`,
    );
  }
  const agentId = normalizeAgentId(input.agentId);
  if (readScope === "agent" && !agentId) {
    throw new Error("agentId is required when readScope is agent");
  }
  return agentId ? { readScope, agentId } : { readScope };
}

function canReadMemoryEntry(
  entryAgentId: string | undefined,
  scope: { readScope: MemoryReadScope; agentId?: string },
): boolean {
  if (scope.readScope === "all") return true;
  if (scope.readScope === "shared") return entryAgentId === undefined;
  return entryAgentId === undefined || entryAgentId === scope.agentId;
}

function resolveQueryLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_QUERY_LIMIT;
  if (
    !Number.isFinite(limit) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_QUERY_LIMIT
  ) {
    throw new Error(
      `limit must be a positive integer between 1 and ${MAX_QUERY_LIMIT}`,
    );
  }
  return limit;
}

export function createBrainAdapter(dbPath: string): BrainAdapter {
  const brain = new SqliteBrain(dbPath);

  const resolveMemoryType = (
    type: string | undefined,
  ): SupportedMemoryType | undefined => {
    if (type === undefined) return undefined;
    if (SUPPORTED_MEMORY_TYPES.includes(type as SupportedMemoryType)) {
      return type as SupportedMemoryType;
    }
    throw new Error(
      `Unsupported memory type: ${type}. Supported types: ${SUPPORTED_MEMORY_TYPES.join(", ")}`,
    );
  };

  // Rehydrate working memory from SQLite so entries survive process restarts.
  // SqliteBrain's constructor starts with an empty in-memory Map; flush() writes
  // to the working_memory table but construction doesn't read it back.
  const readDb = new Database(dbPath);
  configureBrainAdapterDb(readDb);
  try {
    const rows = readDb
      .prepare("SELECT key, value FROM working_memory")
      .all() as Array<{ key: string; value: string }>;
    const snap: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        snap[row.key] = JSON.parse(row.value);
      } catch {
        snap[row.key] = row.value;
      }
    }
    if (Object.keys(snap).length > 0) {
      brain.working.restore(snap);
    }
  } catch {
    // Table may not exist yet on first run — that's fine
  } finally {
    readDb.close();
  }

  return {
    async query(input) {
      const memoryType = resolveMemoryType(input.type);
      const limit = resolveQueryLimit(input.limit);
      const readScope = resolveMemoryReadScope(input);
      const results: BrainMemoryEntry[] = [];

      // Search episodic memory
      if (!memoryType || memoryType === "episodic") {
        const events = brain.episodic.recall(input.query, limit);
        for (const event of events) {
          if (
            !canReadMemoryEntry(
              parseAgentFromEpisodicSummary(event.summary),
              readScope,
            )
          )
            continue;
          results.push({
            key: String(event.id ?? event.summary),
            value: event.summary,
            type: "episodic",
            createdAt: event.createdAt,
          });
        }
      }

      // Search working memory
      if (!memoryType || memoryType === "working") {
        const snapshot = brain.working.snapshot();
        const query = input.query.toLowerCase();
        for (const [key, value] of Object.entries(snapshot)) {
          if (!canReadMemoryEntry(parseAgentFromWorkingKey(key), readScope))
            continue;
          const strValue =
            typeof value === "string" ? value : JSON.stringify(value);
          if (
            key.toLowerCase().includes(query) ||
            strValue.toLowerCase().includes(query)
          ) {
            results.push({ key, value: strValue, type: "working" });
          }
        }
      }

      return results.slice(0, limit);
    },

    async store(input) {
      const memoryType = resolveMemoryType(input.type);

      if (memoryType === "episodic") {
        brain.episodic.record({
          type: "success",
          summary: scopedEpisodicSummary(input.key, input.value, input.agentId),
          createdAt: isoNow(),
        });
        return;
      }

      brain.working.set(
        scopedWorkingKey(input.key, input.agentId),
        input.value,
      );
      brain.flush();
    },

    async frontload(input = {}) {
      const readScope = resolveMemoryReadScope(input);
      const sections: BrainFrontloadSection[] = [];

      // Working memory
      const snapshot = brain.working.snapshot();
      const workingEntries = Object.entries(snapshot)
        .filter(([k]) =>
          canReadMemoryEntry(parseAgentFromWorkingKey(k), readScope),
        )
        .map(
          ([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`,
        );
      if (workingEntries.length > 0) {
        sections.push({ type: "working", entries: workingEntries });
      }

      // Recent episodic events
      const events = brain.episodic.recent(100);
      const episodicEntries = events
        .filter((e) =>
          canReadMemoryEntry(
            parseAgentFromEpisodicSummary(e.summary),
            readScope,
          ),
        )
        .map((e) => `${e.id ?? "-"}: ${e.summary}`);
      if (episodicEntries.length > 0) {
        sections.push({ type: "episodic", entries: episodicEntries });
      }

      return sections;
    },

    async forget(key) {
      if (brain.working.has(key)) {
        brain.working.delete(key);
        brain.flush();
        return true;
      }
      return false;
    },

    async rightToForget(input) {
      return brain.rightToForget(input);
    },
  };
}
