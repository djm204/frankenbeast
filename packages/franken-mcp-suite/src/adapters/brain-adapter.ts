import { createHash } from "node:crypto";
import {
  DEFAULT_WORKING_MEMORY_LIMITS,
  SqliteBrain,
  type MemoryAttributionListOptions,
  type MemoryCandidate,
  type MemoryCandidateStatus,
  type MemoryConflict,
  type MemoryConflictResolution,
  type MemoryProvenanceRecord,
  type MemoryRetentionEntryReport,
  type MemoryRetentionReport,
  type MemoryRetentionReportOptions,
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
  tool?: string;
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

type MemoryAccessAuditSourceDetail = "central-dispatch" | "fbeast-hook";

interface MemoryAccessAuditEventInternal extends MemoryAccessAuditEvent {
  sourceDetail?: MemoryAccessAuditSourceDetail;
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

export interface MemoryRetentionReportInput extends MemoryRetentionReportOptions, MemoryScopeInput {}

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
  memoryRetentionReport(input?: MemoryRetentionReportInput): Promise<MemoryRetentionReport>;  forget(key: string, input?: AgentScopedInput): Promise<boolean>;
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
    scopedKey?: string;
    options?: MemoryReviewDecisionOptions;
  }): Promise<MemoryCandidate>;
  memoryAttribution(input?: MemoryAttributionListOptions & MemoryScopeInput): Promise<MemoryProvenanceRecord[]>;
}

const SUPPORTED_MEMORY_TYPES = ["working", "episodic"] as const;
const DEFAULT_QUERY_LIMIT = 20;
const DEFAULT_ATTRIBUTION_LIMIT = 50;
const MAX_QUERY_LIMIT = 1000;
const MAX_EPISODIC_VISIBILITY_SCAN = 10_000;
const MEMORY_ACCESS_AUDIT_SCAN_MULTIPLIER = 50;
const MAX_MEMORY_ACCESS_AUDIT_SCAN_LIMIT = 10_000;
const AGENT_WORKING_KEY_PREFIX = "__fbeast_agent_memory__/";
const AGENT_MEMORY_SCOPE_MARKER = "fbeast:agent-memory";
const MAX_OPERATIONAL_TTL_MS = 365 * 24 * 60 * 60 * 1000;
export interface BrainAdapterOptions {
  hydration?: {
    /** Maximum working-memory rows restored during adapter construction. */
    maxRows?: number;
    /** Maximum combined UTF-8 bytes of working-memory keys and values restored. */
    maxBytes?: number;
  };
}

function resolveHydrationBudget(options: BrainAdapterOptions): {
  maxRows: number;
  maxBytes: number;
} {
  const maxRows =
    options.hydration?.maxRows ?? DEFAULT_WORKING_MEMORY_LIMITS.maxEntries;
  const maxBytes =
    options.hydration?.maxBytes ?? DEFAULT_WORKING_MEMORY_LIMITS.maxTotalBytes;
  for (const [name, value] of [
    ["maxRows", maxRows],
    ["maxBytes", maxBytes],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`hydration.${name} must be a positive safe integer`);
    }
  }
  return { maxRows, maxBytes };
}

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
  eventId?: unknown,
): string | null | undefined {
  if (!details) return undefined;
  const detailKeys = Object.keys(details);
  const quarantine = details["quarantine"];
  if (
    detailKeys.length === 1 &&
    detailKeys[0] === "quarantine" &&
    quarantine !== null &&
    typeof quarantine === "object" &&
    !Array.isArray(quarantine) &&
    Object.keys(quarantine as Record<string, unknown>).sort().join(",") === "eventId,field,reason" &&
    (quarantine as Record<string, unknown>)["field"] === "details" &&
    (quarantine as Record<string, unknown>)["reason"] === "invalid JSON" &&
    (quarantine as Record<string, unknown>)["eventId"] === eventId
  ) {
    return null;
  }
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
  entryAgentId: string | null | undefined,
  scope: { readScope: MemoryReadScope; agentId?: string },
): boolean {
  // Corrupt episodic details can no longer prove whether an event was shared or
  // agent-scoped, so quarantine envelopes are hidden from every memory scope.
  if (entryAgentId === null) return false;
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

function collectVisibleEntries<T>(
  fetchEntries: (limit: number) => T[],
  limit: number,
  canRead: (entry: T) => boolean,
): T[] {
  if (limit <= 0) return [];
  let scanLimit = Math.min(MAX_EPISODIC_VISIBILITY_SCAN, Math.max(100, limit * 2));

  for (;;) {
    const entries = fetchEntries(scanLimit);
    const visible = takeVisibleEntries(entries, limit, canRead);
    if (
      visible.length >= limit
      || entries.length < scanLimit
      || scanLimit >= MAX_EPISODIC_VISIBILITY_SCAN
    ) {
      return visible;
    }
    scanLimit = Math.min(MAX_EPISODIC_VISIBILITY_SCAN, scanLimit * 2);
  }
}

function scopedReportEntry(entry: MemoryRetentionEntryReport): MemoryRetentionEntryReport {
  if (entry.store !== "working") return entry;
  const scoped = parseScopedWorkingExportEntry(entry.key, undefined);
  return {
    ...entry,
    key: scoped.key,
    ...(entry.agentId !== undefined || scoped.agentId === undefined
      ? {}
      : { agentId: scoped.agentId }),
  };
}

function applyRetentionBudget(
  entries: MemoryRetentionEntryReport[],
  maxEntries: number | undefined,
): MemoryRetentionEntryReport[] {
  const scopedEntries = entries.map((entry) => ({ ...entry }));
  if (maxEntries === undefined) return scopedEntries;
  const activeEntries = scopedEntries.filter((entry) => entry.action !== "expired");
  const existingCompactionCount = activeEntries.filter((entry) => entry.action === "compact").length;
  const extraBudgetCompactions = Math.max(0, activeEntries.length - maxEntries - existingCompactionCount);
  if (extraBudgetCompactions === 0) return scopedEntries;
  const retainedCandidates = scopedEntries
    .filter((entry) => !entry.protected && (entry.action === "retain" || entry.action === "nearing_expiry"))
    .sort((a, b) => b.policy.compactPriority - a.policy.compactPriority || a.key.localeCompare(b.key));
  for (const entry of retainedCandidates.slice(0, extraBudgetCompactions)) {
    entry.action = "compact";
    entry.reason = `Scoped memory report has ${activeEntries.length} active entries, over report budget ${maxEntries}; ${entry.class} has compaction priority ${entry.policy.compactPriority}`;
  }
  return scopedEntries;
}

function filterRetentionReportByScope(
  report: MemoryRetentionReport,
  scope: { readScope: MemoryReadScope; agentId?: string },
  maxEntries?: number,
): MemoryRetentionReport {
  const entries = applyRetentionBudget(
    report.entries
      .filter((entry) => canReadMemoryEntry(entry.agentId, scope))
      .map(scopedReportEntry),
    maxEntries,
  );
  const compactionCandidates = entries
    .filter((entry) => entry.action === "compact")
    .sort((a, b) => b.policy.compactPriority - a.policy.compactPriority || a.key.localeCompare(b.key));
  return {
    ...report,
    counts: {
      total: entries.length,
      protected: entries.filter((entry) => entry.protected).length,
      expired: entries.filter((entry) => entry.action === "expired").length,
      nearingExpiry: entries.filter((entry) => entry.action === "nearing_expiry").length,
      compactionCandidates: compactionCandidates.length,
    },
    entries,
    compactionCandidates,
  };
}

function resolveQueryLimit(limit: number | undefined, defaultLimit = DEFAULT_QUERY_LIMIT): number {
  if (limit === undefined) return defaultLimit;
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
  fbeast_memory_source_attribution: { operation: "read", targetStore: "working", targetClass: "memory-source-attribution" },
  fbeast_memory_forget: { operation: "delete", targetStore: "working", targetClass: "memory-entry" },
  fbeast_memory_right_to_forget: { operation: "delete", targetStore: "working|episodic|derived", targetClass: "right-to-forget" },
  fbeast_memory_review_propose: { operation: "review", targetStore: "working", targetClass: "memory-review-candidate" },
  fbeast_memory_review_list: { operation: "read", targetStore: "working", targetClass: "memory-review-queue" },
  fbeast_memory_review_conflicts: { operation: "read", targetStore: "working", targetClass: "memory-review-conflict" },
  fbeast_memory_review_decide: { operation: "review", targetStore: "working", targetClass: "memory-review-candidate" },
  fbeast_memory_access_audit_report: { operation: "read", targetStore: "audit", targetClass: "memory-access-audit" },
  fbeast_memory_retention_report: { operation: "read", targetStore: "working|episodic", targetClass: "memory-retention-report" },
};

const MEMORY_REVIEW_DECISIONS = new Set(["approve", "reject", "never_store", "resolve_conflict"]);

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
  const directArgs = nestedObjectField(context, "args");
  const directTool = stringAuditField(context, "tool") ?? stringAuditField(context, "toolName");
  if (directArgs && directTool !== undefined && unqualifyToolName(directTool) === "execute_tool") {
    const nestedTool = stringAuditField(directArgs, "tool") ?? stringAuditField(directArgs, "toolName");
    if (nestedTool && unqualifyToolName(nestedTool) === "execute_tool") {
      return auditToolArgs(directArgs);
    }
    return nestedObjectField(directArgs, "args") ?? directArgs;
  }
  return directArgs ?? context;
}

function nestedAuditTool(context: Record<string, unknown>): string | undefined {
  const toolInput = nestedObjectField(context, "tool_input");
  const directTool = stringAuditField(context, "tool") ?? stringAuditField(context, "toolName");
  const directArgs = nestedObjectField(context, "args");
  const proxiedArgTool = directArgs && directTool !== undefined && unqualifyToolName(directTool) === "execute_tool"
    ? stringAuditField(directArgs, "tool") ?? stringAuditField(directArgs, "toolName")
    : undefined;
  return stringAuditField(toolInput ?? {}, "tool")
    ?? stringAuditField(toolInput ?? {}, "toolName")
    ?? proxiedArgTool
    ?? directTool;
}

function nestedMemoryAuditContext(toolName: string, context: Record<string, unknown>): { tool: string; args: Record<string, unknown> } | undefined {
  if (unqualifyToolName(toolName) !== "execute_tool") return undefined;
  const nestedTool = nestedAuditTool(context);
  if (!nestedTool) return undefined;
  const directArgs = nestedObjectField(context, "args");
  if (unqualifyToolName(nestedTool) === "execute_tool") {
    if (!directArgs || directArgs === context) return undefined;
    return { tool: nestedTool, args: directArgs };
  }
  return { tool: nestedTool, args: auditToolArgs(context) };
}

function inferMemoryAccess(toolName: string, context: Record<string, unknown>): { operation: string; targetStore: string; targetClass: string } {
  const unqualified = unqualifyToolName(toolName);
  const defaults = MEMORY_ACCESS_TOOL_OPERATIONS[unqualified] ?? { operation: "unknown", targetStore: "memory", targetClass: "memory-access" };
  const nested = nestedMemoryAuditContext(toolName, context);
  if (nested) {
    return inferMemoryAccess(nested.tool, nested.args);
  }
  const accessArgs = auditToolArgs(context);
  const action = stringAuditField(accessArgs, "action");
  const type = stringAuditField(accessArgs, "type");
  const operation = unqualified === "fbeast_memory_right_to_forget" && accessArgs["dryRun"] === true
    ? "delete:dry_run"
    : unqualified === "fbeast_memory_review_decide" && action && MEMORY_REVIEW_DECISIONS.has(action)
      ? `review:${action}`
      : defaults.operation;
  return {
    operation,
    targetStore: type === "working" || type === "episodic" ? type : defaults.targetStore,
    targetClass: defaults.targetClass,
  };
}

function memoryAuditToolName(toolName: string, context: Record<string, unknown> = {}): string | undefined {
  const unqualified = unqualifyToolName(toolName);
  if (Object.prototype.hasOwnProperty.call(MEMORY_ACCESS_TOOL_OPERATIONS, unqualified)) return unqualified;
  if (unqualified.startsWith("fbeast_memory_")) return UNKNOWN_MEMORY_AUDIT_TOOL;
  if (unqualified !== "execute_tool") return undefined;
  const nested = nestedMemoryAuditContext(toolName, context);
  if (!nested) return undefined;
  return memoryAuditToolName(nested.tool, nested.args);
}

function includeMemoryAuditTool(toolName: string, context: Record<string, unknown> = {}): boolean {
  return memoryAuditToolName(toolName, context) !== undefined;
}

function normalizeAuditTimestamp(timestamp: string): string {
  const trimmed = timestamp.trim();
  if (trimmed.length === 0) return trimmed;
  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const normalized = trimmed.includes("T")
    ? `${trimmed}${hasExplicitTimezone ? "" : "Z"}`
    : `${trimmed.replace(" ", "T")}Z`;
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

const CENTRAL_AUDIT_SOURCE = "central-dispatch";
const AUDIT_TRAIL_SOURCE_KEY = "__fbeastAuditTrailSource";
const GOVERNANCE_SOURCE_KEY = "__fbeastGovernanceSource";
const HOOK_GOVERNANCE_SOURCE_KEY = "__fbeastHookSource";
const HOOK_GOVERNANCE_SOURCE = "fbeast-hook";
const UNKNOWN_MEMORY_AUDIT_TOOL = "fbeast_memory_unknown";

function hasTrustedGovernorProvenance(context: Record<string, unknown>): boolean {
  return context[GOVERNANCE_SOURCE_KEY] === CENTRAL_AUDIT_SOURCE
    || context[HOOK_GOVERNANCE_SOURCE_KEY] === HOOK_GOVERNANCE_SOURCE;
}

function governorSourceDetail(context: Record<string, unknown>): MemoryAccessAuditSourceDetail | undefined {
  if (context[GOVERNANCE_SOURCE_KEY] === CENTRAL_AUDIT_SOURCE) return "central-dispatch";
  if (context[HOOK_GOVERNANCE_SOURCE_KEY] === HOOK_GOVERNANCE_SOURCE) return "fbeast-hook";
  return undefined;
}

function hasTrustedAuditTrailProvenance(payload: Record<string, unknown>): boolean {
  return payload[AUDIT_TRAIL_SOURCE_KEY] === CENTRAL_AUDIT_SOURCE
    || payload[AUDIT_TRAIL_SOURCE_KEY] === HOOK_GOVERNANCE_SOURCE;
}

function auditTrailSourceDetail(payload: Record<string, unknown>): MemoryAccessAuditSourceDetail | undefined {
  if (payload[AUDIT_TRAIL_SOURCE_KEY] === CENTRAL_AUDIT_SOURCE) return "central-dispatch";
  if (payload[AUDIT_TRAIL_SOURCE_KEY] === HOOK_GOVERNANCE_SOURCE) return "fbeast-hook";
  return undefined;
}

const SAFE_AUDIT_DECISIONS = new Set([
  "approved",
  "denied",
  "review_recommended",
  "validation_error",
  "unknown_tool",
  "error",
  "unknown",
]);

const AUDIT_DECISION_PRECEDENCE: Record<string, number> = {
  error: 5,
  denied: 4,
  validation_error: 3,
  unknown_tool: 3,
  review_recommended: 2,
  approved: 1,
  unknown: 0,
};

function safeAuditDecision(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return SAFE_AUDIT_DECISIONS.has(value) ? value : "unknown";
}

function auditDecisionFromPayload(payload: Record<string, unknown>): string {
  const explicitDecision = safeAuditDecision(stringAuditField(payload, "decision"));
  if (explicitDecision) return explicitDecision;
  const ok = payload["ok"];
  if (ok === false) return "error";
  if (ok === true) return "approved";
  return "unknown";
}

function isRedactedAuditValue(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return normalized.includes("[redacted]")
    || /\[[^\]]*redacted[^\]]*\]/i.test(value)
    || normalized.includes("«redacted:")
    || value.includes("***");
}

function auditValuesCorrelate(left: string | undefined, right: string | undefined): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (isRedactedAuditValue(left) || isRedactedAuditValue(right)) return true;
  return left === right;
}

function auditOperationsCorrelate(left: string, right: string): boolean {
  return left === right;
}

function auditDecisionsCorrelate(left: string, right: string): boolean {
  const safeLeft = safeAuditDecision(left) ?? "unknown";
  const safeRight = safeAuditDecision(right) ?? "unknown";
  return !((safeLeft === "denied" || safeRight === "denied") && safeLeft !== safeRight);
}

function auditTargetStoresCorrelate(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.includes('|') || right.includes('|')) return true;
  return false;
}

function auditEventsCorrelate(left: MemoryAccessAuditEventInternal, right: MemoryAccessAuditEventInternal): boolean {
  return left.tool === right.tool
    && auditOperationsCorrelate(left.operation, right.operation)
    && auditDecisionsCorrelate(left.decision, right.decision)
    && auditTargetStoresCorrelate(left.targetStore, right.targetStore)
    && auditValuesCorrelate(left.agentId, right.agentId)
    && auditValuesCorrelate(left.cardId, right.cardId)
    && auditValuesCorrelate(left.profile, right.profile)
    && auditValuesCorrelate(left.repo, right.repo);
}

function richerAuditField(left: string | undefined, right: string | undefined): string | undefined {
  if (left === undefined || isRedactedAuditValue(left)) return right ?? left;
  if (right === undefined || isRedactedAuditValue(right)) return left;
  return right.length > left.length ? right : left;
}

function richerAuditTargetStore(left: string | undefined, right: string | undefined): string | undefined {
  const richer = richerAuditField(left, right);
  if (left && right && left.includes("|") !== right.includes("|")) {
    return left.includes("|") ? right : left;
  }
  return richer;
}

function strongerAuditDecision(left: string, right: string): string {
  const leftDecision = safeAuditDecision(left) ?? "unknown";
  const rightDecision = safeAuditDecision(right) ?? "unknown";
  return (AUDIT_DECISION_PRECEDENCE[rightDecision] ?? 0) > (AUDIT_DECISION_PRECEDENCE[leftDecision] ?? 0)
    ? rightDecision
    : leftDecision;
}

function mergeAuditEvents(left: MemoryAccessAuditEventInternal, right: MemoryAccessAuditEventInternal): MemoryAccessAuditEventInternal {
  const mergedDecision = strongerAuditDecision(left.decision, right.decision);
  const agentId = richerAuditField(left.agentId, right.agentId);
  const cardId = richerAuditField(left.cardId, right.cardId);
  const profile = richerAuditField(left.profile, right.profile);
  const repo = richerAuditField(left.repo, right.repo);
  const rightSuppliedRicherMetadata = (agentId !== undefined && agentId === right.agentId && left.agentId !== right.agentId)
    || (cardId !== undefined && cardId === right.cardId && left.cardId !== right.cardId)
    || (profile !== undefined && profile === right.profile && left.profile !== right.profile)
    || (repo !== undefined && repo === right.repo && left.repo !== right.repo);
  const rightDecisionIsStronger = mergedDecision === safeAuditDecision(right.decision)
    && mergedDecision !== safeAuditDecision(left.decision);
  const useRightSource = rightSuppliedRicherMetadata || rightDecisionIsStronger;
  const mergedSourceDetail = useRightSource ? right.sourceDetail : left.sourceDetail;
  const merged: MemoryAccessAuditEventInternal = {
    ...left,
    source: useRightSource ? right.source : left.source,
    operation: richerAuditField(left.operation, right.operation) ?? left.operation,
    targetStore: richerAuditTargetStore(left.targetStore, right.targetStore) ?? left.targetStore,
    targetClass: richerAuditField(left.targetClass, right.targetClass) ?? left.targetClass,
    decision: mergedDecision,
    reason: rightDecisionIsStronger ? right.reason : (richerAuditField(left.reason, right.reason) ?? left.reason),
  };
  if (mergedSourceDetail !== undefined) {
    merged.sourceDetail = mergedSourceDetail;
  } else {
    delete merged.sourceDetail;
  }
  if (agentId !== undefined) merged.agentId = agentId;
  if (cardId !== undefined) merged.cardId = cardId;
  if (profile !== undefined) merged.profile = profile;
  if (repo !== undefined) merged.repo = repo;
  return merged;
}
function auditEventSourceKey(event: MemoryAccessAuditEventInternal): string {
  return event.sourceDetail === undefined ? event.source : `${event.source}:${event.sourceDetail}`;
}

function dedupeMemoryAccessEvents(events: MemoryAccessAuditEventInternal[]): MemoryAccessAuditEventInternal[] {
  const deduped: MemoryAccessAuditEventInternal[] = [];
  const mergedSources: Array<Set<string>> = [];
  for (const event of events) {
    const eventTime = auditTimestampMs(event.timestamp);
    const eventSourceKey = auditEventSourceKey(event);
    let duplicateIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < deduped.length; index += 1) {
      const candidate = deduped[index];
      if (!candidate || auditEventSourceKey(candidate) === eventSourceKey) continue;
      if (mergedSources[index]?.has(eventSourceKey)) continue;
      if (!auditEventsCorrelate(candidate, event)) continue;
      const candidateTime = auditTimestampMs(candidate.timestamp);
      const distance = Math.abs(candidateTime - eventTime);
      if (distance <= 10_000 && distance < closestDistance) {
        duplicateIndex = index;
        closestDistance = distance;
      }
    }
    if (duplicateIndex < 0) {
      deduped.push(event);
      mergedSources.push(new Set([eventSourceKey]));
      continue;
    }
    const existing = deduped[duplicateIndex];
    if (existing !== undefined) {
      deduped[duplicateIndex] = mergeAuditEvents(existing, event);
      mergedSources[duplicateIndex]?.add(eventSourceKey);
    }
  }
  return deduped;
}

function publicAuditEvent(event: MemoryAccessAuditEventInternal): MemoryAccessAuditEvent {
  const publicEvent: Partial<MemoryAccessAuditEventInternal> = { ...event };
  delete publicEvent.sourceDetail;
  return publicEvent as MemoryAccessAuditEvent;
}

function sqliteAuditTimestamp(value: string): string {
  return normalizeAuditTimestamp(value).replace("T", " ").replace(/\.\d{3}Z$/, "");
}

function auditSqlTimeClause(column: string, input: MemoryAccessAuditReportInput): { clause: string; params: string[] } {
  const clauses: string[] = [];
  const params: string[] = [];
  if (input.since !== undefined) {
    clauses.push(`datetime(replace(replace(${column}, 'T', ' '), 'Z', '')) >= datetime(?)`);
    params.push(sqliteAuditTimestamp(input.since));
  }
  if (input.until !== undefined) {
    clauses.push(`datetime(replace(replace(${column}, 'T', ' '), 'Z', '')) <= datetime(?)`);
    params.push(sqliteAuditTimestamp(input.until));
  }
  return { clause: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

function summarizeAuditEvents(events: MemoryAccessAuditEvent[]): MemoryAccessAuditReport["summary"] {
  const summary: MemoryAccessAuditReport["summary"] = { byTool: {}, byOperation: {}, byDecision: {}, byAgent: {}, byProfile: {}, byRepo: {} };
  const increment = (bucket: Record<string, number>, key: string) => {
    const current = Object.prototype.hasOwnProperty.call(bucket, key) ? bucket[key] ?? 0 : 0;
    Object.defineProperty(bucket, key, {
      value: current + 1,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  };
  for (const event of events) {
    increment(summary.byTool, event.tool);
    increment(summary.byOperation, event.operation);
    increment(summary.byDecision, event.decision);
    if (event.agentId) increment(summary.byAgent, event.agentId);
    if (event.profile) increment(summary.byProfile, event.profile);
    if (event.repo) increment(summary.byRepo, event.repo);
  }
  return summary;
}

function sqlExcludesAuditReportTool(jsonExpression: string, paths: string[]): { clause: string; params: string[] } {
  const reportToolClause = sqlJsonToolEqualsAny(jsonExpression, paths, "fbeast_memory_access_audit_report");
  return { clause: `NOT ${reportToolClause.clause}`, params: reportToolClause.params };
}

function filterMemoryAccessEvents(events: MemoryAccessAuditEvent[], input: MemoryAccessAuditReportInput): MemoryAccessAuditEvent[] {
  const sinceMs = input.since === undefined ? undefined : auditTimestampMs(input.since);
  const untilMs = input.until === undefined ? undefined : auditTimestampMs(input.until);
  return events.filter((event) => {
    if (input.agentId !== undefined && event.agentId !== input.agentId) return false;
    if (input.profile !== undefined && event.profile !== input.profile) return false;
    if (input.repo !== undefined && event.repo !== input.repo) return false;
    if (input.tool !== undefined && event.tool !== input.tool) return false;
    if (input.operation !== undefined && event.operation !== input.operation) return false;
    if (input.decision !== undefined && event.decision !== input.decision) return false;
    const eventMs = auditTimestampMs(event.timestamp);
    if (sinceMs !== undefined && eventMs < sinceMs) return false;
    if (untilMs !== undefined && eventMs > untilMs) return false;
    return true;
  });
}

function resolveMemoryAccessAuditScanLimit(resultLimit: number): number {
  return Math.min(
    Math.max(resultLimit * MEMORY_ACCESS_AUDIT_SCAN_MULTIPLIER, MAX_QUERY_LIMIT),
    MAX_MEMORY_ACCESS_AUDIT_SCAN_LIMIT,
  );
}

function sqlLimitClause(limit: number | undefined): string {
  return limit === undefined ? "" : "LIMIT ?";
}

function sqlLimitParams(limit: number | undefined): number[] {
  return limit === undefined ? [] : [limit];
}

function sqlJsonEqualsAny(jsonExpression: string, paths: string[], value: string | undefined): { clause: string; params: string[] } {
  if (value === undefined) return { clause: "", params: [] };
  return {
    clause: `(${paths.map((path) => `json_extract(${jsonExpression}, '${path}') = ?`).join(" OR ")})`,
    params: paths.map(() => value),
  };
}

function sqlToolEqualsExpression(expression: string): string {
  return `(COALESCE(${expression} = ?, 0) OR COALESCE(${expression} LIKE ('%__' || ?), 0))`;
}

function sqlJsonToolEqualsAny(jsonExpression: string, paths: string[], value: string | undefined): { clause: string; params: string[] } {
  if (value === undefined) return { clause: "", params: [] };
  return {
    clause: `(${paths.map((path) => sqlToolEqualsExpression(`json_extract(${jsonExpression}, '${path}')`)).join(" OR ")})`,
    params: paths.flatMap(() => [value, value]),
  };
}

function sqlAuditDecisionEquals(jsonExpression: string, value: string | undefined): { clause: string; params: string[] } {
  if (value === undefined) return { clause: "", params: [] };
  const derivedClause = value === "approved"
    ? ` OR json_extract(${jsonExpression}, '$.ok') = 1`
    : value === "error"
      ? ` OR json_extract(${jsonExpression}, '$.ok') = 0`
      : value === "unknown"
        ? ` OR (json_type(${jsonExpression}, '$.decision') IS NULL AND json_type(${jsonExpression}, '$.ok') IS NULL) OR (json_type(${jsonExpression}, '$.decision') = 'text' AND json_extract(${jsonExpression}, '$.decision') NOT IN (${Array.from(SAFE_AUDIT_DECISIONS).map(() => "?").join(", ")}))`
        : "";
  return {
    clause: `(json_extract(${jsonExpression}, '$.decision') = ?${derivedClause})`,
    params: value === "unknown" ? [value, ...Array.from(SAFE_AUDIT_DECISIONS)] : [value],
  };
}

function auditSqlFilterParts(parts: Array<{ clause: string; params: string[] }>): { clauses: string[]; params: string[] } {
  const clauses: string[] = [];
  const params: string[] = [];
  for (const part of parts) {
    if (!part.clause) continue;
    clauses.push(part.clause);
    params.push(...part.params);
  }
  return { clauses, params };
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

export function createBrainAdapter(
  dbPath: string,
  options: BrainAdapterOptions = {},
): BrainAdapter {
  const hydrationBudget = resolveHydrationBudget(options);
  // SqliteBrain owns the single startup hydration read and its concurrency
  // safety. Startup-only limits avoid the adapter's former unbounded second
  // SELECT/restore cycle without changing normal working-memory write limits.
  const brain = new SqliteBrain(dbPath, undefined, {
    workingMemoryHydrationLimits: {
      maxRows: hydrationBudget.maxRows,
      maxBytes: hydrationBudget.maxBytes,
    },
  });

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

  return {
    async query(input) {
      const memoryType = resolveMemoryType(input.type);
      const limit = resolveQueryLimit(input.limit);
      const readScope = resolveMemoryReadScope(input);
      const results: BrainMemoryEntry[] = [];

      // Search episodic memory
      if (!memoryType || memoryType === "episodic") {
        const events = collectVisibleEntries(
          (scanLimit) => brain.episodic.recall(input.query, scanLimit) as EpisodicEvent[],
          limit,
          (event) =>
            canReadMemoryEntry(
              parseAgentFromEpisodicDetails(event.details, event.id),
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
      const events = collectVisibleEntries(
        (scanLimit) => brain.episodic.recent(scanLimit) as EpisodicEvent[],
        100,
        (event) =>
          canReadMemoryEntry(
            parseAgentFromEpisodicDetails(event.details, event.id),
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

      const episodic = collectVisibleEntries(
        (scanLimit) => brain.episodic.recent(scanLimit) as EpisodicEvent[],
        limit,
        (event) =>
          canReadMemoryEntry(
            parseAgentFromEpisodicDetails(event.details, event.id),
            readScope,
          ),
      ).map((event) => {
        const entryAgentId = parseAgentFromEpisodicDetails(event.details, event.id);
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
          ...(entryAgentId == null
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
      const scanLimit = resolveMemoryAccessAuditScanLimit(limit);
      const sourceScanLimit = input.operation === undefined ? scanLimit : undefined;
      const reportDb = new Database(dbPath);
      configureBrainAdapterDb(reportDb);
      try {
        const events: MemoryAccessAuditEventInternal[] = [];
        const governorTimeFilter = auditSqlTimeClause("created_at", input);
        const safeGovernorJson = "CASE WHEN json_valid(context) THEN context ELSE '{}' END";
        const governorSqlFilters = auditSqlFilterParts([
          sqlJsonEqualsAny(safeGovernorJson, ["$.agentId", "$.args.agentId", "$.args.args.agentId", "$.args.args.args.agentId"], input.agentId),
          sqlJsonEqualsAny(safeGovernorJson, ["$.profile", "$.activeProfile", "$.args.profile", "$.args.activeProfile", "$.args.args.profile", "$.args.args.activeProfile", "$.args.args.args.profile", "$.args.args.args.activeProfile"], input.profile),
          sqlJsonEqualsAny(safeGovernorJson, ["$.repo", "$.args.repo", "$.args.args.repo", "$.args.args.args.repo"], input.repo),
          input.tool === undefined || input.tool === UNKNOWN_MEMORY_AUDIT_TOOL ? { clause: "", params: [] } : {
            clause: `(${[
              sqlToolEqualsExpression("action"),
              sqlToolEqualsExpression("json_extract(" + safeGovernorJson + ", '$.tool')"),
              sqlToolEqualsExpression("json_extract(" + safeGovernorJson + ", '$.toolName')"),
              sqlToolEqualsExpression("json_extract(" + safeGovernorJson + ", '$.args.tool')"),
              sqlToolEqualsExpression("json_extract(" + safeGovernorJson + ", '$.args.toolName')"),
              sqlToolEqualsExpression("json_extract(" + safeGovernorJson + ", '$.args.args.tool')"),
              sqlToolEqualsExpression("json_extract(" + safeGovernorJson + ", '$.args.args.toolName')"),
              sqlToolEqualsExpression("json_extract(" + safeGovernorJson + ", '$.args.args.args.tool')"),
              sqlToolEqualsExpression("json_extract(" + safeGovernorJson + ", '$.args.args.args.toolName')"),
            ].join(" OR ")})`,
            params: Array.from({ length: 18 }, () => input.tool!),
          },
          input.decision === undefined ? { clause: "", params: [] } : { clause: "decision = ?", params: [input.decision] },
        ]);
        const governorProvenanceCondition = `(
            json_extract(${safeGovernorJson}, '$.${GOVERNANCE_SOURCE_KEY}') = ?
            OR json_extract(${safeGovernorJson}, '$.${HOOK_GOVERNANCE_SOURCE_KEY}') = ?
          )`;
        const governorMemoryCondition = "(action LIKE '%fbeast_memory%' OR action LIKE '%execute_tool%' OR context LIKE '%fbeast_memory%')";
        const governorTimeCondition = governorTimeFilter.clause ? governorTimeFilter.clause.slice("WHERE ".length) : "";
        const governorWhere = `WHERE ${[
          governorProvenanceCondition,
          governorMemoryCondition,
          governorTimeCondition,
          ...governorSqlFilters.clauses,
        ].filter(Boolean).join(" AND ")}`;
        const governorRows = sqliteTableExists(reportDb, "governor_log")
          ? reportDb.prepare(`
          SELECT action, context, decision, reason, created_at AS createdAt
          FROM governor_log
          ${governorWhere}
          ORDER BY id DESC
          ${sqlLimitClause(sourceScanLimit)}
        `).all(CENTRAL_AUDIT_SOURCE, HOOK_GOVERNANCE_SOURCE, ...governorTimeFilter.params, ...governorSqlFilters.params, ...sqlLimitParams(sourceScanLimit)) as Array<{ action: string; context: string; decision: string; reason: string | null; createdAt: string }>
          : [];
        for (const row of governorRows) {
          const context = parseAuditContext(row.context);
          if (!hasTrustedGovernorProvenance(context)) continue;
          if (!includeMemoryAuditTool(row.action, context)) continue;
          const sourceDetail = governorSourceDetail(context);
          const access = inferMemoryAccess(row.action, context);
          const accessArgs = auditToolArgs(context);
          const auditedTool = memoryAuditToolName(row.action, context) ?? unqualifyToolName(row.action);
          const isAuditReportInvocation = auditedTool === "fbeast_memory_access_audit_report";
          const profile = isAuditReportInvocation
            ? undefined
            : stringAuditField(accessArgs, "profile") ?? stringAuditField(accessArgs, "activeProfile") ?? stringAuditField(context, "profile") ?? stringAuditField(context, "activeProfile");
          const agentId = isAuditReportInvocation
            ? undefined
            : stringAuditField(accessArgs, "agentId") ?? stringAuditField(context, "agentId");
          const cardId = isAuditReportInvocation
            ? undefined
            : stringAuditField(accessArgs, "cardId") ?? stringAuditField(accessArgs, "taskId") ?? stringAuditField(context, "cardId") ?? stringAuditField(context, "taskId");
          const repo = isAuditReportInvocation
            ? undefined
            : stringAuditField(accessArgs, "repo") ?? stringAuditField(context, "repo");
          events.push({
            timestamp: normalizeAuditTimestamp(row.createdAt),
            ...(agentId ? { agentId } : {}),
            ...(cardId ? { cardId } : {}),
            ...(profile ? { profile } : {}),
            ...(repo ? { repo } : {}),
            source: "governor_log" as const,
            ...(sourceDetail ? { sourceDetail } : {}),
            tool: auditedTool,
            operation: access.operation,
            targetStore: access.targetStore,
            targetClass: access.targetClass,
            decision: row.decision,
            reason: redactExportString(row.reason ?? ""),
          });
        }

        const auditTimeFilter = auditSqlTimeClause("created_at", input);
        const safeAuditPayloadJson = "CASE WHEN json_valid(payload) THEN payload ELSE '{}' END";
        const auditSqlFilters = auditSqlFilterParts([
          sqlJsonEqualsAny(safeAuditPayloadJson, ["$.args.agentId", "$.args.args.agentId", "$.args.args.args.agentId", "$.agentId"], input.agentId),
          sqlJsonEqualsAny(safeAuditPayloadJson, ["$.args.profile", "$.args.activeProfile", "$.args.args.profile", "$.args.args.activeProfile", "$.args.args.args.profile", "$.args.args.args.activeProfile", "$.profile", "$.activeProfile"], input.profile),
          sqlJsonEqualsAny(safeAuditPayloadJson, ["$.args.repo", "$.args.args.repo", "$.args.args.args.repo", "$.repo"], input.repo),
          input.tool === "fbeast_memory_access_audit_report" ? { clause: "", params: [] } : sqlExcludesAuditReportTool(safeAuditPayloadJson, ["$.toolName", "$.tool", "$.args.tool", "$.args.toolName", "$.args.args.tool", "$.args.args.toolName", "$.args.args.args.tool", "$.args.args.args.toolName"]),
          input.tool === UNKNOWN_MEMORY_AUDIT_TOOL ? { clause: "", params: [] } : sqlJsonToolEqualsAny(safeAuditPayloadJson, ["$.toolName", "$.tool", "$.args.tool", "$.args.toolName", "$.args.args.tool", "$.args.args.toolName", "$.args.args.args.tool", "$.args.args.args.toolName"], input.tool),
          sqlAuditDecisionEquals(safeAuditPayloadJson, input.decision),
        ]);
        const auditTimeCondition = auditTimeFilter.clause ? `AND ${auditTimeFilter.clause.slice("WHERE ".length)}` : "";
        const auditMetadataCondition = auditSqlFilters.clauses.length ? `AND ${auditSqlFilters.clauses.join(" AND ")}` : "";
        const auditRows = sqliteTableExists(reportDb, "audit_trail")
          ? reportDb.prepare(`
          SELECT event_type AS eventType, payload, created_at AS createdAt
          FROM audit_trail
          WHERE event_type = 'tool_call'
            AND json_valid(payload)
            AND (
              json_extract(payload, '$.__fbeastAuditTrailSource') = ?
              OR json_extract(payload, '$.__fbeastAuditTrailSource') = ?
            )
            AND (payload LIKE '%fbeast_memory%' OR payload LIKE '%execute_tool%')
            ${auditTimeCondition}
            ${auditMetadataCondition}
          ORDER BY id DESC
          ${sqlLimitClause(sourceScanLimit)}
        `).all(CENTRAL_AUDIT_SOURCE, HOOK_GOVERNANCE_SOURCE, ...auditTimeFilter.params, ...auditSqlFilters.params, ...sqlLimitParams(sourceScanLimit)) as Array<{ eventType: string; payload: string; createdAt: string }>
          : [];
        for (const row of auditRows) {
          const payload = parseAuditContext(row.payload);
          if (!hasTrustedAuditTrailProvenance(payload)) continue;
          const sourceDetail = auditTrailSourceDetail(payload);
          const toolName = stringAuditField(payload, "toolName") ?? stringAuditField(payload, "tool") ?? "unknown";
          if (!includeMemoryAuditTool(toolName, payload)) continue;
          const access = inferMemoryAccess(toolName, payload);
          const accessArgs = auditToolArgs(payload);
          const auditedTool = memoryAuditToolName(toolName, payload) ?? unqualifyToolName(toolName);
          const isAuditReportInvocation = auditedTool === "fbeast_memory_access_audit_report";
          const agentId = isAuditReportInvocation ? undefined : stringAuditField(accessArgs, "agentId") ?? stringAuditField(payload, "agentId");
          const cardId = isAuditReportInvocation ? undefined : stringAuditField(accessArgs, "cardId") ?? stringAuditField(accessArgs, "taskId") ?? stringAuditField(payload, "cardId") ?? stringAuditField(payload, "taskId");
          const profile = isAuditReportInvocation ? undefined : stringAuditField(accessArgs, "profile") ?? stringAuditField(accessArgs, "activeProfile") ?? stringAuditField(payload, "profile") ?? stringAuditField(payload, "activeProfile");
          const repo = isAuditReportInvocation ? undefined : stringAuditField(accessArgs, "repo") ?? stringAuditField(payload, "repo");
          events.push({
            timestamp: normalizeAuditTimestamp(row.createdAt),
            ...(agentId ? { agentId } : {}),
            ...(cardId ? { cardId } : {}),
            ...(profile ? { profile } : {}),
            ...(repo ? { repo } : {}),
            source: "audit_trail" as const,
            ...(sourceDetail ? { sourceDetail } : {}),
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
          .slice(0, limit)
          .map(publicAuditEvent);
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

    async memoryRetentionReport(input = {}) {
      const readScope = resolveMemoryReadScope(input);
      const reportOptions: MemoryRetentionReportOptions = {
        ...(input.now === undefined ? {} : { now: input.now }),
        ...(input.expiryHorizonMs === undefined ? {} : { expiryHorizonMs: input.expiryHorizonMs }),
        ...(input.maxEntries !== undefined
          ? { maxEntries: Number.MAX_SAFE_INTEGER }
          : {}),
      };
      return filterRetentionReportByScope(
        brain.memoryRetentionReport(reportOptions),
        readScope,
        input.maxEntries,
      );    },

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
          ...(input.scopedKey ? { scopedKey: input.scopedKey } : {}),
        });
      }
      throw new Error(`Unsupported memory review action: ${String(input.action)}`);
    },

    async memoryAttribution(input = {}) {
      const readScope = resolveMemoryReadScope(input);
      const requestedLimit = resolveQueryLimit(input.limit, DEFAULT_ATTRIBUTION_LIMIT);
      const scopedAgentKeyPrefix = readScope.agentId
        ? `${AGENT_WORKING_KEY_PREFIX}${encodeScopeComponent(readScope.agentId)}/`
        : undefined;
      const provenanceKeys = input.key === undefined || readScope.readScope !== "agent"
        ? undefined
        : [input.key, scopedWorkingKey(input.key, readScope.agentId)];
      const lookupKey = input.key === undefined || readScope.readScope === "agent"
        ? undefined
        : input.key;
      const attributions: MemoryProvenanceRecord[] = brain.memoryReview.listProvenance({
        ...(input.targetStore !== undefined ? { targetStore: input.targetStore } : {}),
        ...(provenanceKeys !== undefined ? { keys: provenanceKeys } : {}),
        ...(lookupKey !== undefined ? { key: lookupKey } : {}),
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(readScope.readScope === "shared" ? { excludeKeyPrefixes: [AGENT_WORKING_KEY_PREFIX] } : {}),
        ...(readScope.readScope === "agent" && input.key === undefined && scopedAgentKeyPrefix !== undefined
          ? {
              visibleKeyPrefixes: [scopedAgentKeyPrefix],
              includeUnprefixedKeys: true,
              unprefixedKeyPrefixExclusions: [AGENT_WORKING_KEY_PREFIX],
            }
          : {}),
        limit: requestedLimit,
      });

      return attributions
        .map((attribution) => {
          const entry = parseScopedWorkingExportEntry(attribution.key, attribution.value);
          return { attribution, entry };
        })
        .filter(({ entry }) => canReadMemoryEntry(entry.agentId, readScope))
        .slice(0, requestedLimit)
        .map(({ attribution, entry }) => ({
          ...attribution,
          key: entry.key,
          value: entry.value,
        }));
    },
  };
}
