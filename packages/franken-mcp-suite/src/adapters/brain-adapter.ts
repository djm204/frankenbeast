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

export interface AgentScopedInput {
  /** Agent id used to address agent-scoped working memory. */
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
  forget(key: string, input?: AgentScopedInput): Promise<boolean>;
  rightToForget(
    input: RightToForgetSelector & AgentScopedInput,
  ): Promise<RightToForgetReport>;
}

const SUPPORTED_MEMORY_TYPES = ["working", "episodic"] as const;
const DEFAULT_QUERY_LIMIT = 20;
const MAX_QUERY_LIMIT = 1000;
const AGENT_WORKING_KEY_PREFIX = "__fbeast_agent_memory__/";
const AGENT_MEMORY_SCOPE_MARKER = "fbeast:agent-memory";

type SupportedMemoryType = (typeof SUPPORTED_MEMORY_TYPES)[number];

function resolveAgentId(agentId: string | undefined): string | undefined {
  if (agentId === undefined) return undefined;
  const trimmed = agentId.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed;
}

function encodeScopeComponent(value: string): string {
  return encodeURIComponent(value);
}

function decodeScopeComponent(value: string): string {
  return decodeURIComponent(value);
}

interface AgentScopedWorkingValue {
  __fbeastMemoryScope: typeof AGENT_MEMORY_SCOPE_MARKER;
  agentId: string;
  value: string;
}

function isAgentScopedWorkingValue(
  value: unknown,
): value is AgentScopedWorkingValue {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __fbeastMemoryScope?: unknown }).__fbeastMemoryScope ===
      AGENT_MEMORY_SCOPE_MARKER &&
    typeof (value as { agentId?: unknown }).agentId === "string" &&
    typeof (value as { value?: unknown }).value === "string"
  );
}

function scopedWorkingKey(key: string, agentId: string | undefined): string {
  const resolvedAgentId = resolveAgentId(agentId);
  return resolvedAgentId
    ? `${AGENT_WORKING_KEY_PREFIX}${encodeScopeComponent(resolvedAgentId)}/${encodeScopeComponent(key)}`
    : key;
}

function scopedWorkingValue(
  value: string,
  agentId: string | undefined,
): string | AgentScopedWorkingValue {
  const resolvedAgentId = resolveAgentId(agentId);
  return resolvedAgentId
    ? {
        __fbeastMemoryScope: AGENT_MEMORY_SCOPE_MARKER,
        agentId: resolvedAgentId,
        value,
      }
    : value;
}

function parseScopedWorkingEntry(
  key: string,
  value: unknown,
): { key: string; value: string; agentId?: string } {
  if (
    key.startsWith(AGENT_WORKING_KEY_PREFIX) &&
    isAgentScopedWorkingValue(value)
  ) {
    const rest = key.slice(AGENT_WORKING_KEY_PREFIX.length);
    const slash = rest.indexOf("/");
    if (slash > 0) {
      try {
        return {
          key: decodeScopeComponent(rest.slice(slash + 1)),
          value: value.value,
          agentId: value.agentId,
        };
      } catch {
        // Fall through to treating malformed reserved keys as ordinary shared keys.
      }
    }
  }
  return {
    key,
    value: typeof value === "string" ? value : JSON.stringify(value),
  };
}

function parseAgentFromEpisodicDetails(
  details: Record<string, unknown> | undefined,
): string | undefined {
  if (!details) return undefined;
  return details["__fbeastMemoryScope"] === AGENT_MEMORY_SCOPE_MARKER &&
    typeof details["agentId"] === "string"
    ? details["agentId"]
    : undefined;
}

function scopedEpisodicDetails(
  agentId: string | undefined,
): Record<string, unknown> | undefined {
  const resolvedAgentId = resolveAgentId(agentId);
  return resolvedAgentId
    ? {
        __fbeastMemoryScope: AGENT_MEMORY_SCOPE_MARKER,
        agentId: resolvedAgentId,
      }
    : undefined;
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
  const agentId = resolveAgentId(input.agentId);
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

function takeVisibleEntries<T>(
  entries: T[],
  limit: number,
  canRead: (entry: T) => boolean,
): T[] {
  return entries.filter(canRead).slice(0, limit);
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
        const episodicLimit = readScope.readScope === "all" ? limit : -1;
        const events = takeVisibleEntries(
          brain.episodic.recall(input.query, episodicLimit),
          limit,
          (event) =>
            canReadMemoryEntry(
              parseAgentFromEpisodicDetails(event.details),
              readScope,
            ),
        );
        for (const event of events) {
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
          const entry = parseScopedWorkingEntry(key, value);
          if (!canReadMemoryEntry(entry.agentId, readScope)) continue;
          if (
            entry.key.toLowerCase().includes(query) ||
            entry.value.toLowerCase().includes(query)
          ) {
            results.push({
              key: entry.key,
              value: entry.value,
              type: "working",
            });
          }
        }
      }

      return results.slice(0, limit);
    },

    async store(input) {
      const memoryType = resolveMemoryType(input.type);

      if (memoryType === "episodic") {
        const details = scopedEpisodicDetails(input.agentId);
        brain.episodic.record({
          type: "success",
          summary: `${input.key}: ${input.value}`,
          ...(details ? { details } : {}),
          createdAt: isoNow(),
        });
        return;
      }

      brain.working.set(
        scopedWorkingKey(input.key, input.agentId),
        scopedWorkingValue(input.value, input.agentId),
      );
      brain.flush();
    },

    async frontload(input = {}) {
      const readScope = resolveMemoryReadScope(input);
      const sections: BrainFrontloadSection[] = [];

      // Working memory
      const snapshot = brain.working.snapshot();
      const workingEntries = Object.entries(snapshot)
        .map(([k, v]) => parseScopedWorkingEntry(k, v))
        .filter((entry) => canReadMemoryEntry(entry.agentId, readScope))
        .map((entry) => `${entry.key}: ${entry.value}`);
      if (workingEntries.length > 0) {
        sections.push({ type: "working", entries: workingEntries });
      }

      // Recent episodic events
      const episodicLimit = readScope.readScope === "all" ? 100 : -1;
      const events = takeVisibleEntries(
        brain.episodic.recent(episodicLimit),
        100,
        (event) =>
          canReadMemoryEntry(
            parseAgentFromEpisodicDetails(event.details),
            readScope,
          ),
      );
      const episodicEntries = events.map((e) => `${e.id ?? "-"}: ${e.summary}`);
      if (episodicEntries.length > 0) {
        sections.push({ type: "episodic", entries: episodicEntries });
      }

      return sections;
    },

    async forget(key, input = {}) {
      const resolvedKey = scopedWorkingKey(key, input.agentId);
      if (brain.working.has(resolvedKey)) {
        brain.working.delete(resolvedKey);
        brain.flush();
        return true;
      }
      return false;
    },

    async rightToForget(input) {
      const { agentId, ...selector } = input;
      return brain.rightToForget({
        ...selector,
        ...(selector.key !== undefined
          ? { key: scopedWorkingKey(selector.key, agentId) }
          : {}),
      });
    },
  };
}
