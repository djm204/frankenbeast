import { createHash } from "node:crypto";
import {
  SqliteBrain,
  type MemoryCandidate,
  type MemoryCandidateStatus,
  type MemoryConflict,
  type MemoryConflictResolution,
  type MemoryReviewDecisionOptions,
  type RightToForgetReport,
  type RightToForgetSelector,
} from "@franken/brain";
import Database from "better-sqlite3";
import { isoNow, type EpisodicEvent } from "@franken/types";

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

export type MemoryExportRedactionMode = "safe" | "none";

export interface MemoryExportInput extends MemoryScopeInput {
  /** Defaults to safe. Use none only for trusted operator-only exports. */
  redaction?: MemoryExportRedactionMode;
  /** Maximum entries returned from each store. Defaults to 1000. */
  limit?: number;
}

export interface MemoryAccessAuditReportInput {
  agentId?: string;
  profile?: string;
  repo?: string;
  since?: string;
  until?: string;
  operation?: string;
  decision?: string;
  limit?: number;
}

export interface MemoryAccessAuditEvent {
  timestamp: string;
  agentId?: string;
  cardId?: string;
  profile?: string;
  repo?: string;
  source: "governor_log" | "audit_trail";
  tool: string;
  operation: string;
  targetStore: string;
  targetClass: string;
  decision: string;
  reason: string;
}

export interface MemoryAccessAuditReport {
  generatedAt: string;
  filters: MemoryAccessAuditReportInput;
  count: number;
  events: MemoryAccessAuditEvent[];
  summary: {
    byTool: Record<string, number>;
    byOperation: Record<string, number>;
    byDecision: Record<string, number>;
    byAgent: Record<string, number>;
    byProfile: Record<string, number>;
    byRepo: Record<string, number>;
  };
}

export interface MemoryExportWorkingEntry {
  key: string;
  value: unknown;
  agentId?: string;
  expiresAt?: string;
}

export interface MemoryExportEpisodicEntry {
  id?: number | string;
  eventType: string;
  step?: string;
  summary: string;
  details?: unknown;
  agentId?: string;
  createdAt: string;
}

export interface ProjectMemoryExport {
  version: 1;
  exportedAt: string;
  scope: { readScope: MemoryReadScope; agentId?: string };
  redaction: MemoryExportRedactionMode;
  counts: { working: number; episodic: number };
  working: MemoryExportWorkingEntry[];
  episodic: MemoryExportEpisodicEntry[];
}

export interface BrainAdapter {
  query(input: BrainQueryInput): Promise<BrainMemoryEntry[]>;
  store(input: {
    key: string;
    value: string;
    type: string;
    agentId?: string;
    ttlMs?: number;
  }): Promise<void>;
  frontload(input?: MemoryScopeInput): Promise<BrainFrontloadSection[]>;
  exportProjectMemory(input?: MemoryExportInput): Promise<ProjectMemoryExport>;
  memoryAccessAuditReport(input?: MemoryAccessAuditReportInput): Promise<MemoryAccessAuditReport>;
  forget(key: string, input?: AgentScopedInput): Promise<boolean>;
  rightToForget(
    input: RightToForgetSelector & AgentScopedInput,
  ): Promise<RightToForgetReport>;
  proposeMemory(input: {
    key: string;
    value: string;
    source: string;
    reason: string;
    confidence: number;
    evidenceId?: string;
    agentId?: string;
  }): Promise<MemoryCandidate>;
  listMemoryReview(status?: MemoryCandidateStatus): Promise<MemoryCandidate[]>;
  conflictsForMemoryReview(id: string): Promise<MemoryConflict[]>;
  decideMemoryReview(input: {
    id: string;
    action: 'approve' | 'reject' | 'never_store' | 'resolve_conflict';
    resolution?: MemoryConflictResolution;
    options?: MemoryReviewDecisionOptions;
  }): Promise<MemoryCandidate>;
}

const SUPPORTED_MEMORY_TYPES = ["working", "episodic"] as const;
const DEFAULT_QUERY_LIMIT = 20;
const MAX_QUERY_LIMIT = 1000;
const AGENT_WORKING_KEY_PREFIX = "__fbeast_agent_memory__/";
const AGENT_MEMORY_SCOPE_MARKER = "fbeast:agent-memory";
const MAX_OPERATIONAL_TTL_MS = 365 * 24 * 60 * 60 * 1000;

type SupportedMemoryType = (typeof SUPPORTED_MEMORY_TYPES)[number];

function isTemporaryOperationalValue(record: Record<string, unknown>): boolean {
  const markers = [record.category, record.kind, record.type, record.scope];
  return markers.some(
    (marker) =>
      typeof marker === "string" &&
      /^(temporary[-_\s]?operational|operational[-_\s]?temporary|temp[-_\s]?operational|operational[-_\s]?temp|transient[-_\s]?operational)$/i.test(
        marker.trim(),
      ),
  );
}

function resolveOperationalTtlMs(ttlMs: number | undefined): number | undefined {
  if (ttlMs === undefined) return undefined;
  if (
    !Number.isFinite(ttlMs) ||
    !Number.isSafeInteger(ttlMs) ||
    ttlMs < 1 ||
    ttlMs > MAX_OPERATIONAL_TTL_MS
  ) {
    throw new Error(
      `ttlMs must be a positive integer no greater than ${MAX_OPERATIONAL_TTL_MS}`,
    );
  }
  return ttlMs;
}

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
  expiresAt?: string;
  category?: string;
  sourceScope?: string;
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
  ttlMs: number | undefined,
): string | AgentScopedWorkingValue | { value: string; category: string; sourceScope: string; expiresAt: string } {
  const expiresAt =
    ttlMs === undefined ? undefined : new Date(Date.now() + ttlMs).toISOString();
  const resolvedAgentId = resolveAgentId(agentId);

  if (resolvedAgentId) {
    return {
      __fbeastMemoryScope: AGENT_MEMORY_SCOPE_MARKER,
      agentId: resolvedAgentId,
      value,
      ...(expiresAt
        ? { category: "temporary-operational", sourceScope: "mcp-memory-store", expiresAt }
        : {}),
    };
  }

  return expiresAt
    ? {
        value,
        category: "temporary-operational",
        sourceScope: "mcp-memory-store",
        expiresAt,
      }
    : value;
}

function unwrapWorkingMemoryExportValue(value: unknown): { value: unknown; expiresAt?: string } {
  if (isAgentScopedWorkingValue(value)) {
    const record = value as unknown as Record<string, unknown>;
    return {
      value: value.value,
      ...(typeof value.expiresAt === "string" && isTemporaryOperationalValue(record) ? { expiresAt: value.expiresAt } : {}),
    };
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown> & { value?: unknown; expiresAt?: unknown };
    if ('value' in record && typeof record.expiresAt === 'string' && isTemporaryOperationalValue(record)) {
      return {
        value: record.value,
        expiresAt: record.expiresAt,
      };
    }
  }
  return { value };
}

function parseScopedWorkingEntry(
  key: string,
  value: unknown,
): { key: string; value: string; agentId?: string; expiresAt?: string } {
  const entry = parseScopedWorkingExportEntry(key, value);
  return {
    key: entry.key,
    value: typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value),
    ...(entry.agentId === undefined ? {} : { agentId: entry.agentId }),
    ...(entry.expiresAt ? { expiresAt: entry.expiresAt } : {}),
  };
}

function parseScopedWorkingExportEntry(
  key: string,
  value: unknown,
): { key: string; value: unknown; agentId?: string; expiresAt?: string } {
  const unwrapped = unwrapWorkingMemoryExportValue(value);
  if (key.startsWith(AGENT_WORKING_KEY_PREFIX)) {
    const rest = key.slice(AGENT_WORKING_KEY_PREFIX.length);
    const slash = rest.indexOf("/");
    if (slash > 0) {
      try {
        const decodedAgentId = decodeScopeComponent(rest.slice(0, slash));
        return {
          key: decodeScopeComponent(rest.slice(slash + 1)),
          value: unwrapped.value,
          agentId: isAgentScopedWorkingValue(value)
            ? value.agentId
            : decodedAgentId,
          ...(unwrapped.expiresAt ? { expiresAt: unwrapped.expiresAt } : {}),
        };
      } catch {
        // Fall through to treating malformed reserved keys as ordinary shared keys.
      }
    }
  }
  return {
    key,
    value: unwrapped.value,
    ...(unwrapped.expiresAt ? { expiresAt: unwrapped.expiresAt } : {}),
  };
}

function formatWorkingEntryValue(entry: { value: string; expiresAt?: string }): string {
  return entry.expiresAt ? `${entry.value} (expires ${entry.expiresAt})` : entry.value;
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

function resolveExportLimit(limit: number | undefined): number {
  return resolveQueryLimit(limit ?? MAX_QUERY_LIMIT);
}

const SENSITIVE_EXPORT_KEY = /(?:password|passphrase|passw?d|pwd|secret|token|api[_-]?key|access[_-]?key|authorization|credential|private[_-]?key|session|cookie|webhook(?:[_-]?url)?)/i;
const SECRET_EXPORT_VALUES: Array<[RegExp, string]> = [
  [/\bAuthorization\s*:\s*[^\r\n]+/gi, "Authorization: [redacted]"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]"],
  [/\bBasic\s+[A-Za-z0-9._~+/-]+=*/gi, "Basic [redacted]"],
  [/https:\/\/hooks\.slack(?:-gov)?\.com\/services\/[^\s"'<>]+/gi, "[redacted-webhook-url]"],
  [/https:\/\/(?:discord(?:app)?\.com)\/api\/webhooks\/[^\s"'<>]+/gi, "[redacted-webhook-url]"],
  [/\b([A-Za-z][A-Za-z0-9+.-]*:\/\/)\S+@/g, "$1[redacted]@"],
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, "[redacted-private-key]"],
  [/\b([A-Z][A-Z0-9_]*(?:PASSWORD|PASS(?:PHRASE)?|PASSWD|PWD|SECRET|TOKEN|API_?KEY|ACCESS_?KEY|AUTH(?:ORIZATION)?|CREDENTIAL|PRIVATE_?KEY|SESSION(?:_?COOKIE)?|COOKIE|WEBHOOK(?:_?URL)?)[A-Z0-9_]*\s*[=:]\s*)[^\s,;&]+/g, "$1[redacted]"],
  [/\b([A-Za-z0-9_]*(?:password|passphrase|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|authorization|credential|private[_-]?key|session(?:[_-]?cookie)?|cookie|webhook(?:[_-]?url)?)[A-Za-z0-9_]*)\s*([:=])\s*([^\s,;&]+)/gi, "$1$2[redacted]"],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9][A-Za-z0-9_-]{7,}\b/g, "[redacted-secret]"],
  [/\b(?:sk|gh[opusr])_[A-Za-z0-9_]{8,}\b/g, "[redacted-secret]"],
  [/\bgithub_pat_[A-Za-z0-9_]{8,}\b/g, "[redacted-secret]"],
  [/\b(?:gho|ghp|glpat|xox[baprs])-[A-Za-z0-9_-]{12,}\b/g, "[redacted-secret]"],
  [/\btoken\s+[A-Za-z0-9._~+/=-]{20,}\b/gi, "token [redacted]"],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]"],
];

const MEMORY_ACCESS_TOOL_OPERATIONS: Record<string, { operation: string; targetStore: string; targetClass: string }> = {
  fbeast_memory_store: { operation: "write", targetStore: "working|episodic", targetClass: "memory-entry" },
  fbeast_memory_query: { operation: "read", targetStore: "working|episodic", targetClass: "memory-query" },
  fbeast_memory_frontload: { operation: "read", targetStore: "working|episodic", targetClass: "memory-frontload" },
  fbeast_memory_export: { operation: "read", targetStore: "working|episodic", targetClass: "memory-export" },
  fbeast_memory_forget: { operation: "delete", targetStore: "working", targetClass: "memory-entry" },
  fbeast_memory_right_to_forget: { operation: "delete", targetStore: "working|episodic|derived", targetClass: "right-to-forget" },
  fbeast_memory_review_propose: { operation: "review", targetStore: "working", targetClass: "memory-review-candidate" },
  fbeast_memory_review_list: { operation: "read", targetStore: "working", targetClass: "memory-review-queue" },
  fbeast_memory_review_conflicts: { operation: "read", targetStore: "working", targetClass: "memory-review-conflict" },
  fbeast_memory_review_decide: { operation: "review", targetStore: "working", targetClass: "memory-review-candidate" },
  fbeast_memory_access_audit_report: { operation: "read", targetStore: "audit", targetClass: "memory-access-audit" },
};

function unqualifyToolName(toolName: string): string {
  const marker = "__";
  const index = toolName.lastIndexOf(marker);
  return index >= 0 ? toolName.slice(index + marker.length) : toolName;
}

function parseAuditContext(context: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(context) as unknown;
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Redacted/non-JSON contexts are still valid audit evidence.
  }
  return {};
}

function stringAuditField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function nestedObjectField(context: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = context[key];
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function auditToolArgs(context: Record<string, unknown>): Record<string, unknown> {
  const toolInput = nestedObjectField(context, "tool_input");
  if (toolInput) return nestedObjectField(toolInput, "args") ?? toolInput;
  return nestedObjectField(context, "args") ?? context;
}

function nestedAuditTool(context: Record<string, unknown>): string | undefined {
  const toolInput = nestedObjectField(context, "tool_input");
  return stringAuditField(toolInput ?? {}, "tool")
    ?? stringAuditField(toolInput ?? {}, "toolName")
    ?? stringAuditField(context, "tool")
    ?? stringAuditField(context, "toolName");
}

function inferMemoryAccess(toolName: string, context: Record<string, unknown>): { operation: string; targetStore: string; targetClass: string } {
  const unqualified = unqualifyToolName(toolName);
  const defaults = MEMORY_ACCESS_TOOL_OPERATIONS[unqualified] ?? { operation: "unknown", targetStore: "memory", targetClass: "memory-access" };
  const nestedTool = nestedAuditTool(context);
  if (unqualified === "execute_tool" && nestedTool) {
    return inferMemoryAccess(nestedTool, auditToolArgs(context));
  }
  const accessArgs = auditToolArgs(context);
  const explicitOperation = stringAuditField(accessArgs, "operation");
  const action = stringAuditField(accessArgs, "action");
  const type = stringAuditField(accessArgs, "type");
  return {
    operation: explicitOperation ?? (unqualified === "fbeast_memory_review_decide" && action ? `review:${action}` : defaults.operation),
    targetStore: type ?? defaults.targetStore,
    targetClass: defaults.targetClass,
  };
}

function memoryAuditToolName(toolName: string, context: Record<string, unknown> = {}): string | undefined {
  const unqualified = unqualifyToolName(toolName);
  if (Object.prototype.hasOwnProperty.call(MEMORY_ACCESS_TOOL_OPERATIONS, unqualified)) return unqualified;
  if (unqualified !== "execute_tool") return undefined;
  const nestedTool = nestedAuditTool(context);
  if (!nestedTool) return undefined;
  return memoryAuditToolName(nestedTool, auditToolArgs(context));
}

function includeMemoryAuditTool(toolName: string, context: Record<string, unknown> = {}): boolean {
  return memoryAuditToolName(toolName, context) !== undefined;
}

function normalizeAuditTimestamp(timestamp: string): string {
  const trimmed = timestamp.trim();
  if (trimmed.length === 0) return trimmed;
  const normalized = trimmed.includes("T") ? trimmed : `${trimmed.replace(" ", "T")}Z`;
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? trimmed : new Date(ms).toISOString();
}

function auditTimestampMs(timestamp: string): number {
  const ms = Date.parse(normalizeAuditTimestamp(timestamp));
  return Number.isNaN(ms) ? 0 : ms;
}

function sqliteTableExists(db: Database.Database, tableName: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName) as { name?: string } | undefined;
  return row?.name === tableName;
}

function auditDecisionFromPayload(payload: Record<string, unknown>): string {
  const explicitDecision = stringAuditField(payload, "decision");
  if (explicitDecision) return explicitDecision;
  const ok = payload["ok"];
  if (ok === false) return stringAuditField(payload, "error") ? "error" : "denied";
  if (ok === true) return "approved";
  return "unknown";
}

function dedupeMemoryAccessEvents(events: MemoryAccessAuditEvent[]): MemoryAccessAuditEvent[] {
  const governorEvents = events.filter((event) => event.source === "governor_log");
  return events.filter((event) => {
    if (event.source !== "audit_trail") return true;
    const eventTime = auditTimestampMs(event.timestamp);
    return !governorEvents.some((governorEvent) => {
      if (governorEvent.tool !== event.tool || governorEvent.agentId !== event.agentId || governorEvent.profile !== event.profile || governorEvent.repo !== event.repo || governorEvent.operation !== event.operation) return false;
      const governorTime = auditTimestampMs(governorEvent.timestamp);
      return Math.abs(governorTime - eventTime) <= 10_000;
    });
  });
}

function summarizeAuditEvents(events: MemoryAccessAuditEvent[]): MemoryAccessAuditReport["summary"] {
  const summary: MemoryAccessAuditReport["summary"] = { byTool: {}, byOperation: {}, byDecision: {}, byAgent: {}, byProfile: {}, byRepo: {} };
  for (const event of events) {
    summary.byTool[event.tool] = (summary.byTool[event.tool] ?? 0) + 1;
    summary.byOperation[event.operation] = (summary.byOperation[event.operation] ?? 0) + 1;
    summary.byDecision[event.decision] = (summary.byDecision[event.decision] ?? 0) + 1;
    if (event.agentId) summary.byAgent[event.agentId] = (summary.byAgent[event.agentId] ?? 0) + 1;
    if (event.profile) summary.byProfile[event.profile] = (summary.byProfile[event.profile] ?? 0) + 1;
    if (event.repo) summary.byRepo[event.repo] = (summary.byRepo[event.repo] ?? 0) + 1;
  }
  return summary;
}

function filterMemoryAccessEvents(events: MemoryAccessAuditEvent[], input: MemoryAccessAuditReportInput): MemoryAccessAuditEvent[] {
  const sinceMs = input.since === undefined ? undefined : auditTimestampMs(input.since);
  const untilMs = input.until === undefined ? undefined : auditTimestampMs(input.until);
  return events.filter((event) => {
    if (input.agentId !== undefined && event.agentId !== input.agentId) return false;
    if (input.profile !== undefined && event.profile !== input.profile) return false;
    if (input.repo !== undefined && event.repo !== input.repo) return false;
    if (input.operation !== undefined && event.operation !== input.operation) return false;
    if (input.decision !== undefined && event.decision !== input.decision) return false;
    const eventMs = auditTimestampMs(event.timestamp);
    if (sinceMs !== undefined && eventMs < sinceMs) return false;
    if (untilMs !== undefined && eventMs > untilMs) return false;
    return true;
  });
}

function stableRedactedKey(key: string): string {
  const digest = createHash("sha256").update(key).digest("hex").slice(0, 12);
  return `[redacted-key:${digest}]`;
}

function stableRedactedAgentId(_agentId: string): string {
  return "[redacted-agent-id]";
}

function redactExportString(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.stringify(redactExportValue(JSON.parse(value)));
    } catch {
      // Fall through to pattern-based redaction for non-JSON strings.
    }
  }

  const withJsonSecretsRedacted = value.replace(
    /"((?:password|passphrase|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|authorization|credential|private[_-]?key|session(?:[_-]?cookie)?|cookie|webhook(?:[_-]?url)?))"\s*:\s*(?:"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/gi,
    (_match, key: string) => `"${stableRedactedKey(key)}":"[redacted]"`,
  );
  return SECRET_EXPORT_VALUES.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    withJsonSecretsRedacted,
  );
}

function redactExportValue(
  value: unknown,
  keyHint?: string,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (keyHint === "agentId" && typeof value === "string") {
    return stableRedactedAgentId(value);
  }
  if (keyHint && SENSITIVE_EXPORT_KEY.test(keyHint)) {
    return "[redacted]";
  }
  if (typeof value === "string") return redactExportString(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[redacted-circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactExportValue(item, undefined, seen));
  }
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    const redactedKey = SENSITIVE_EXPORT_KEY.test(key)
      ? stableRedactedKey(key)
      : redactExportString(key);
    const outputKey = redactedKey === key ? key : stableRedactedKey(key);
    output[outputKey] = redactExportValue(nested, key, seen);
  }
  return output;
}

function redactExportKey(key: string, redaction: MemoryExportRedactionMode): string {
  if (redaction === "none") return key;
  return SENSITIVE_EXPORT_KEY.test(key) ? stableRedactedKey(key) : redactExportString(key);
}

function redactExportField<T>(
  value: T,
  redaction: MemoryExportRedactionMode,
  keyHint?: string,
): T | unknown {
  if (redaction !== "none" && keyHint === "agentId") return "[redacted-agent-id]";
  return redaction === "none" ? value : redactExportValue(value, keyHint);
}

function redactExportScope(
  scope: { readScope: MemoryReadScope; agentId?: string },
  redaction: MemoryExportRedactionMode,
): { readScope: MemoryReadScope; agentId?: string } {
  if (redaction === "none" || scope.agentId === undefined) return scope;
  return {
    readScope: scope.readScope,
    agentId: redactExportField(scope.agentId, redaction, "agentId") as string,
  };
}

function redactEpisodicSummary(
  summary: string,
  redaction: MemoryExportRedactionMode,
): string {
  if (redaction === "none") return summary;
  const colon = summary.indexOf(":");
  if (colon > 0 && colon <= 200) {
    const key = summary.slice(0, colon).trim();
    const value = summary.slice(colon + 1).trimStart();
    if (key.length > 0 && SENSITIVE_EXPORT_KEY.test(key)) {
      const redactedValue = redactExportValue(value, key);
      return `${redactExportKey(key, redaction)}: ${String(redactedValue)}`;
    }
  }
  const fullStringRedaction = redactExportString(summary);
  if (fullStringRedaction !== summary) return fullStringRedaction;
  if (colon > 0 && colon <= 200) {
    const key = summary.slice(0, colon).trim();
    const value = summary.slice(colon + 1).trimStart();
    if (key.length > 0) {
      const redactedValue = redactExportValue(value, key);
      return `${redactExportKey(key, redaction)}: ${String(redactedValue)}`;
    }
  }
  return fullStringRedaction;
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
          brain.episodic.recall(input.query, episodicLimit) as EpisodicEvent[],
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
          const formattedValue = formatWorkingEntryValue(entry);
          if (!canReadMemoryEntry(entry.agentId, readScope)) continue;
          if (
            entry.key.toLowerCase().includes(query) ||
            formattedValue.toLowerCase().includes(query)
          ) {
            results.push({
              key: entry.key,
              value: formattedValue,
              type: "working",
            });
          }
        }
      }

      return results.slice(0, limit);
    },

    async store(input) {
      const memoryType = resolveMemoryType(input.type);
      if (input.ttlMs !== undefined && memoryType !== 'working') {
        throw new Error('ttlMs is only supported for working memory entries');
      }

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

      const ttlMs = resolveOperationalTtlMs(input.ttlMs);
      brain.working.set(
        scopedWorkingKey(input.key, input.agentId),
        scopedWorkingValue(input.value, input.agentId, ttlMs),
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
        .map((entry) => `${entry.key}: ${formatWorkingEntryValue(entry)}`);
      if (workingEntries.length > 0) {
        sections.push({ type: "working", entries: workingEntries });
      }

      // Recent episodic events
      const episodicLimit = readScope.readScope === "all" ? 100 : -1;
      const events = takeVisibleEntries(
        brain.episodic.recent(episodicLimit) as EpisodicEvent[],
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

    async exportProjectMemory(input = {}) {
      const readScope = resolveMemoryReadScope(input);
      const redaction = input.redaction ?? "safe";
      if (redaction !== "safe" && redaction !== "none") {
        throw new Error("redaction must be one of: safe, none");
      }
      const limit = resolveExportLimit(input.limit);
      const snapshot = brain.working.snapshot();
      const working = Object.entries(snapshot)
        .map(([key, value]) => parseScopedWorkingExportEntry(key, value))
        .filter((entry) => canReadMemoryEntry(entry.agentId, readScope))
        .slice(0, limit)
        .map((entry) => {
          const exported: MemoryExportWorkingEntry = {
            key: redactExportKey(entry.key, redaction),
            value: redactExportField(entry.value, redaction, entry.key),
          };
          if (entry.agentId !== undefined) {
            exported.agentId = redactExportField(
              entry.agentId,
              redaction,
              "agentId",
            ) as string;
          }
          if (entry.expiresAt !== undefined) {
            exported.expiresAt = entry.expiresAt;
          }
          return exported;
        });

      const episodicLimit = readScope.readScope === "all" ? limit : -1;
      const episodic = takeVisibleEntries(
        brain.episodic.recent(episodicLimit) as EpisodicEvent[],
        limit,
        (event) =>
          canReadMemoryEntry(
            parseAgentFromEpisodicDetails(event.details),
            readScope,
          ),
      ).map((event) => {
        const entryAgentId = parseAgentFromEpisodicDetails(event.details);
        const exported: MemoryExportEpisodicEntry = {
          ...(event.id === undefined ? {} : { id: event.id }),
          eventType: event.type,
          ...(event.step === undefined
            ? {}
            : { step: redactExportField(event.step, redaction, "step") as string }),
          summary: redactEpisodicSummary(event.summary, redaction),
          ...(event.details === undefined
            ? {}
            : { details: redactExportField(event.details, redaction, "details") }),
          ...(entryAgentId === undefined
            ? {}
            : {
                agentId: redactExportField(
                  entryAgentId,
                  redaction,
                  "agentId",
                ) as string,
              }),
          createdAt: event.createdAt,
        };
        return exported;
      });

      return {
        version: 1,
        exportedAt: isoNow(),
        scope: redactExportScope(readScope, redaction),
        redaction,
        counts: { working: working.length, episodic: episodic.length },
        working,
        episodic,
      };
    },

    async memoryAccessAuditReport(input = {}) {
      const limit = resolveQueryLimit(input.limit ?? MAX_QUERY_LIMIT);
      const reportDb = new Database(dbPath);
      configureBrainAdapterDb(reportDb);
      try {
        const events: MemoryAccessAuditEvent[] = [];
        const governorRows = sqliteTableExists(reportDb, "governor_log")
          ? reportDb.prepare(`
          SELECT action, context, decision, reason, created_at AS createdAt
          FROM governor_log
          ORDER BY id DESC
        `).all() as Array<{ action: string; context: string; decision: string; reason: string | null; createdAt: string }>
          : [];
        for (const row of governorRows) {
          const context = parseAuditContext(row.context);
          if (!includeMemoryAuditTool(row.action, context)) continue;
          const access = inferMemoryAccess(row.action, context);
          const accessArgs = auditToolArgs(context);
          const auditedTool = memoryAuditToolName(row.action, context) ?? unqualifyToolName(row.action);
          const profile = stringAuditField(accessArgs, "profile") ?? stringAuditField(accessArgs, "activeProfile") ?? stringAuditField(context, "profile") ?? stringAuditField(context, "activeProfile");
          const agentId = stringAuditField(accessArgs, "agentId") ?? stringAuditField(context, "agentId");
          const cardId = stringAuditField(accessArgs, "cardId") ?? stringAuditField(accessArgs, "taskId") ?? stringAuditField(context, "cardId") ?? stringAuditField(context, "taskId");
          const repo = stringAuditField(accessArgs, "repo") ?? stringAuditField(context, "repo");
          events.push({
            timestamp: normalizeAuditTimestamp(row.createdAt),
            ...(agentId ? { agentId } : {}),
            ...(cardId ? { cardId } : {}),
            ...(profile ? { profile } : {}),
            ...(repo ? { repo } : {}),
            source: "governor_log" as const,
            tool: auditedTool,
            operation: access.operation,
            targetStore: access.targetStore,
            targetClass: access.targetClass,
            decision: row.decision,
            reason: redactExportString(row.reason ?? ""),
          });
        }

        const auditRows = sqliteTableExists(reportDb, "audit_trail")
          ? reportDb.prepare(`
          SELECT event_type AS eventType, payload, created_at AS createdAt
          FROM audit_trail
          WHERE event_type = 'tool_call'
          ORDER BY id DESC
        `).all() as Array<{ eventType: string; payload: string; createdAt: string }>
          : [];
        for (const row of auditRows) {
          const payload = parseAuditContext(row.payload);
          const toolName = stringAuditField(payload, "toolName") ?? stringAuditField(payload, "tool") ?? "unknown";
          if (!includeMemoryAuditTool(toolName, payload)) continue;
          const access = inferMemoryAccess(toolName, payload);
          const accessArgs = auditToolArgs(payload);
          const auditedTool = memoryAuditToolName(toolName, payload) ?? unqualifyToolName(toolName);
          const agentId = stringAuditField(accessArgs, "agentId") ?? stringAuditField(payload, "agentId");
          const cardId = stringAuditField(accessArgs, "cardId") ?? stringAuditField(accessArgs, "taskId") ?? stringAuditField(payload, "cardId") ?? stringAuditField(payload, "taskId");
          const profile = stringAuditField(accessArgs, "profile") ?? stringAuditField(payload, "profile");
          const repo = stringAuditField(accessArgs, "repo") ?? stringAuditField(payload, "repo");
          events.push({
            timestamp: normalizeAuditTimestamp(row.createdAt),
            ...(agentId ? { agentId } : {}),
            ...(cardId ? { cardId } : {}),
            ...(profile ? { profile } : {}),
            ...(repo ? { repo } : {}),
            source: "audit_trail" as const,
            tool: auditedTool,
            operation: access.operation,
            targetStore: access.targetStore,
            targetClass: access.targetClass,
            decision: auditDecisionFromPayload(payload),
            reason: redactExportString(stringAuditField(payload, "error") ?? "post-tool audit event"),
          });
        }

        const filtered = filterMemoryAccessEvents(dedupeMemoryAccessEvents(events), input)
          .sort((a, b) => auditTimestampMs(b.timestamp) - auditTimestampMs(a.timestamp))
          .slice(0, limit);
        return {
          generatedAt: isoNow(),
          filters: input,
          count: filtered.length,
          events: filtered,
          summary: summarizeAuditEvents(filtered),
        };
      } finally {
        reportDb.close();
      }
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

    async proposeMemory(input) {
      return brain.memoryReview.propose({
        targetStore: 'working',
        key: scopedWorkingKey(input.key, input.agentId),
        value: input.value,
        source: input.source,
        ...(input.evidenceId ? { evidenceId: input.evidenceId } : {}),
        confidence: input.confidence,
        reason: input.reason,
      });
    },

    async listMemoryReview(status = 'pending') {
      return brain.memoryReview.list(status);
    },

    async conflictsForMemoryReview(id) {
      return brain.memoryReview.conflictsFor(id);
    },

    async decideMemoryReview(input) {
      const options = input.options ?? {};
      if (input.action === 'approve') {
        return brain.memoryReview.approve(input.id, options);
      }
      if (input.action === 'reject') {
        return brain.memoryReview.reject(input.id, options);
      }
      if (input.action === 'never_store') {
        return brain.memoryReview.neverStore(input.id, options);
      }
      if (input.action === 'resolve_conflict') {
        if (!input.resolution) {
          throw new Error('resolution is required when action is resolve_conflict');
        }
        return brain.memoryReview.resolveConflict(input.id, {
          ...options,
          resolution: input.resolution,
        });
      }
      throw new Error(`Unsupported memory review action: ${String(input.action)}`);
    },
  };
}
