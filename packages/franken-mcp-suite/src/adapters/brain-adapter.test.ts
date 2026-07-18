import { beforeEach, describe, expect, it, vi } from "vitest";

const { databaseInstances, brainInstances, workingMemoryRowsByPath } = vi.hoisted(() => {
  const workingMemoryRowsByPath = new Map<string, Array<{ key: string; value: string }>>();
  const databaseInstances: Array<{
    pragma: ReturnType<typeof vi.fn>;
    prepare: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    dbPath: string;
    options: unknown;
  }> = [];
  const brainInstances: Array<{
    dbPath: string;
    limits: { maxEntries?: number; maxTotalBytes?: number } | undefined;
    working: {
      restore: ReturnType<typeof vi.fn>;
      snapshot: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
      has: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    episodic: {
      recall: ReturnType<typeof vi.fn>;
      recent: ReturnType<typeof vi.fn>;
      record: ReturnType<typeof vi.fn>;
    };
    rightToForget: ReturnType<typeof vi.fn>;
    memoryRetentionReport: ReturnType<typeof vi.fn>;
    memoryReview: {
      propose: ReturnType<typeof vi.fn>;
      approve: ReturnType<typeof vi.fn>;
      reject: ReturnType<typeof vi.fn>;
      neverStore: ReturnType<typeof vi.fn>;
      listProvenance: ReturnType<typeof vi.fn>;
      conflictsFor: ReturnType<typeof vi.fn>;
      resolveConflict: ReturnType<typeof vi.fn>;
    };
    flush: ReturnType<typeof vi.fn>;
  }> = [];
  return { databaseInstances, brainInstances, workingMemoryRowsByPath };
});

vi.mock("better-sqlite3", () => ({
  default: vi.fn(function MockDatabase(
    this: unknown,
    _dbPath: string,
    options?: unknown,
  ) {
    const db = {
      pragma: vi.fn(),
      prepare: vi.fn((sql: string) => ({
        get: vi.fn((tableName?: string) => {
          if (sql.includes("sqlite_master") && (tableName === "governor_log" || tableName === "audit_trail")) {
            return { name: tableName };
          }
          return undefined;
        }),
        all: vi.fn(() => {
          if (sql.includes("FROM governor_log")) {
            return [
              {
                action: "fbeast_memory_query",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-a", profile: "default", repo: "djm204/frankenbeast", type: "working" }),
                decision: "approved",
                reason: "allowed",
                createdAt: "2026-07-16T10:00:00.000Z",
              },
              {
                action: "fbeast_memory_review_decide",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-b", action: "approve" }),
                decision: "approved",
                reason: "reviewed",
                createdAt: "2026-07-16T11:00:00.000Z",
              },
              {
                action: "fbeast_memory_store",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-c", cardId: "t_abc123", profile: "default", repo: "djm204/frankenbeast", type: "working", value: "ghp_secretvalue123456" }),
                decision: "denied",
                reason: "blocked token ghp_secretvalue123456",
                createdAt: "2026-07-16T10:30:00.000Z",
              },
              {
                action: "shell_command",
                context: "rm -rf tmp",
                decision: "review_recommended",
                reason: "dangerous",
                createdAt: "2026-07-16T12:00:00.000Z",
              },
              {
                action: "fbeast_memory_query",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-secret", profile: "security-test", operation: "sk-secretvalue123456", type: "ghp_secretvalue123456" }),
                decision: "validation_error",
                reason: "invalid args",
                createdAt: "2026-07-16T12:10:00.000Z",
              },
              {
                action: "fbeast_memory_right_to_forget",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-dry", profile: "dry-run-test", dryRun: true }),
                decision: "approved",
                reason: "dry run",
                createdAt: "2026-07-16T12:20:00.000Z",
              },
              {
                action: "fbeast_memory_store",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "«redacted:agent…»", profile: "duplicate-test", repo: "djm204/frankenbeast", type: "working" }),
                decision: "approved",
                reason: "allowed",
                createdAt: "2026-07-16T12:30:00.000Z",
              },
              {
                action: "fbeast_memory_store",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", profile: "sparse-duplicate-test", repo: "djm204/frankenbeast", type: "working" }),
                decision: "approved",
                reason: "allowed",
                createdAt: "2026-07-16T12:50:00.000Z",
              },
              {
                action: "fbeast_memory_store",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "[right-to-forget-selector-redacted]", profile: "placeholder-duplicate-test", repo: "djm204/frankenbeast", type: "working" }),
                decision: "approved",
                reason: "allowed",
                createdAt: "2026-07-16T13:00:00.000Z",
              },
              {
                action: "fbeast_memory_right_to_forget",
                context: "[right-to-forget-context-redacted]",
                decision: "approved",
                reason: "dry-run approval",
                createdAt: "2026-07-16T13:10:00.000Z",
              },
              {
                action: "fbeast_memory_query",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-rapid", profile: "rapid-repeat-test", type: "working" }),
                decision: "approved",
                reason: "allowed first",
                createdAt: "2026-07-16T13:20:00.000Z",
              },
              {
                action: "fbeast_memory_query",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-rapid", profile: "rapid-repeat-test", type: "working" }),
                decision: "approved",
                reason: "allowed second",
                createdAt: "2026-07-16T13:20:02.000Z",
              },
              {
                action: "fbeast_memory_query",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-error-merge", profile: "error-merge-test", type: "working" }),
                decision: "approved",
                reason: "allowed before handler failure",
                createdAt: "2026-07-16T13:30:00.000Z",
              },
              {
                action: "fbeast_memory_store",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-specific", profile: "target-specific-test", repo: "djm204/frankenbeast" }),
                decision: "approved",
                reason: "allowed write",
                createdAt: "2026-07-16T13:50:00.000Z",
              },
              {
                action: "fbeast_memory_store",
                context: JSON.stringify({ agentId: "agent-forged-governor", profile: "forgery-test", type: "working" }),
                decision: "approved",
                reason: "public governor probe",
                createdAt: "2026-07-16T13:55:00.000Z",
              },
              {
                action: "fbeast_memory_query",
                context: JSON.stringify({ __fbeastAuditTrailSource: "fbeast-hook", __fbeastHookSource: "fbeast-hook", agentId: "agent-hook-pre", profile: "hook-test", type: "working" }),
                decision: "approved",
                reason: "hook pre-tool approval",
                createdAt: "2026-07-16T14:00:00.000Z",
              },
              {
                action: "fbeast_memory_right_to_forget",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", dryRun: false, context: "[right-to-forget-context-redacted]" }),
                decision: "approved",
                reason: "redacted central deletion approval",
                createdAt: "2026-07-16T14:05:00.000Z",
              },
              {
                action: "fbeast_memory_store",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-governor-dedupe", profile: "governor-source-dedupe-test", type: "working" }),
                decision: "approved",
                reason: "central approval",
                createdAt: "2026-07-16T14:15:00.000Z",
              },
              {
                action: "fbeast_memory_store",
                context: JSON.stringify({ __fbeastAuditTrailSource: "fbeast-hook", __fbeastHookSource: "fbeast-hook", agentId: "agent-governor-dedupe", profile: "governor-source-dedupe-test", type: "working" }),
                decision: "approved",
                reason: "hook approval",
                createdAt: "2026-07-16T14:15:05.000Z",
              },
              {
                action: "fbeast_memory_store",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "[redacted]", profile: "source-detail-sync-test", type: "working" }),
                decision: "approved",
                reason: "central approval before hook metadata",
                createdAt: "2026-07-16T14:18:00.000Z",
              },
              {
                action: "fbeast_memory_store",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-target-dedupe", profile: "target-dedupe-test", type: "working", cardId: "card-a" }),
                decision: "approved",
                reason: "working write",
                createdAt: "2026-07-16T14:30:00.000Z",
              },
              {
                action: "fbeast_memory_store",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-card-dedupe", profile: "card-dedupe-test", type: "working", cardId: "card-a" }),
                decision: "approved",
                reason: "card a write",
                createdAt: "2026-07-16T14:35:00.000Z",
              },
              {
                action: "fbeast_memory_delete_all",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-unknown-tool", profile: "unknown-tool-test" }),
                decision: "unknown_tool",
                reason: "unknown memory tool probe",
                createdAt: "2026-07-16T14:36:00.000Z",
              },
              {
                action: "fbeast_memory_query",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "__proto__", profile: "toString", repo: "constructor", type: "working" }),
                decision: "approved",
                reason: "prototype-name audit subject",
                createdAt: "2026-07-16T14:40:00.000Z",
              },
              {
                action: "fbeast_memory_access_audit_report",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-a", profile: "default", repo: "djm204/frankenbeast" }),
                decision: "approved",
                reason: "report query",
                createdAt: "2026-07-16T14:45:00.000Z",
              },
              {
                action: "fbeast_memory_store",
                context: JSON.stringify({ __fbeastGovernanceSource: "central-dispatch", agentId: "agent-denied-merge", profile: "denied-merge-test", type: "working" }),
                decision: "denied",
                reason: "blocked before tool",
                createdAt: "2026-07-16T14:50:00.000Z",
              },
            ];
          }
          if (sql.includes("FROM audit_trail")) {
            return [
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "fbeast_memory_export", ok: true, profile: "default", repo: "djm204/frankenbeast" }),
                createdAt: "2026-07-16T09:00:00.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "fbeast_memory_store", ok: true, profile: "duplicate-test", repo: "djm204/frankenbeast", agentId: "agent-actual" }),
                createdAt: "2026-07-16T12:30:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "fbeast_memory_query", ok: false, profile: "error-test", error: "limit must be numeric" }),
                createdAt: "2026-07-16T12:40:00.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "fbeast_memory_store", ok: true, args: { agentId: "agent-sparse", profile: "sparse-duplicate-test", repo: "djm204/frankenbeast", type: "working" } }),
                createdAt: "2026-07-16T12:50:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "fbeast_memory_store", ok: true, args: { agentId: "agent-placeholder", profile: "placeholder-duplicate-test", repo: "djm204/frankenbeast", type: "working" } }),
                createdAt: "2026-07-16T13:00:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "fbeast_memory_right_to_forget", ok: true, args: { agentId: "agent-dry-redacted", profile: "rtf-redacted-test", dryRun: true } }),
                createdAt: "2026-07-16T13:10:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "fbeast_memory_right_to_forget", ok: true, args: { agentId: "agent-dry-redacted", profile: "rtf-redacted-test", dryRun: false } }),
                createdAt: "2026-07-16T13:10:06.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "fbeast_memory_query", ok: true, args: { agentId: "agent-rapid", profile: "rapid-repeat-test", type: "working" } }),
                createdAt: "2026-07-16T13:20:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "fbeast_memory_query", ok: true, args: { agentId: "agent-rapid", profile: "rapid-repeat-test", type: "working" } }),
                createdAt: "2026-07-16T13:20:07.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "fbeast_memory_query", ok: false, args: { agentId: "agent-error-merge", profile: "error-merge-test", type: "working" }, error: "handler failed" }),
                createdAt: "2026-07-16T13:30:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "fbeast_memory_query", decision: "sk-secret-decision", args: { agentId: "agent-decision", profile: "decision-secret-test", type: "working" } }),
                createdAt: "2026-07-16T13:40:00.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "fbeast_memory_store", ok: true, args: { agentId: "agent-specific", profile: "target-specific-test", repo: "djm204/frankenbeast", type: "episodic" } }),
                createdAt: "2026-07-16T13:50:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ source: "observer-user", toolName: "fbeast_memory_store", ok: true, args: { agentId: "agent-forged-observer", profile: "forgery-test", type: "working" } }),
                createdAt: "2026-07-16T13:55:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ toolName: "fbeast_memory_query", phase: "post-tool", ok: true, args: { agentId: "agent-forged-phase", profile: "forgery-test", type: "working" } }),
                createdAt: "2026-07-16T13:55:06.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "execute_tool", ok: true, args: { toolName: "execute_tool", agentId: "agent-self-execute", profile: "execute-self-test" } }),
                createdAt: "2026-07-16T13:58:00.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "execute_tool", ok: false, args: { tool: "fbeast_memory_store", agentId: "agent-proxied", profile: "proxied-args-test", type: "working" }, error: "validation failed" }),
                createdAt: "2026-07-16T13:58:30.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "execute_tool", ok: false, args: { tool: "fbeast_memory_store", args: { agentId: "agent-nested-proxied", profile: "nested-proxied-args-test", type: "working" } }, error: "nested validation failed" }),
                createdAt: "2026-07-16T13:58:40.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "execute_tool", ok: true, args: { tool: "execute_tool", args: { tool: "fbeast_memory_store", args: { agentId: "agent-deep-proxied", profile: "deep-proxied-tool-filter-test", type: "working" } } } }),
                createdAt: "2026-07-16T13:58:45.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "fbeast-hook", __fbeastHookSource: "fbeast-hook", toolName: "fbeast_memory_store", phase: "post-tool", ok: true, args: { agentId: "agent-hook-post", profile: "hook-test", type: "working" } }),
                createdAt: "2026-07-16T14:00:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "fbeast_memory_store", ok: true, args: { agentId: "agent-source-dedupe", profile: "source-dedupe-test", type: "working" } }),
                createdAt: "2026-07-16T14:10:00.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "fbeast-hook", __fbeastHookSource: "fbeast-hook", toolName: "fbeast_memory_store", phase: "post-tool", ok: true, args: { agentId: "agent-source-dedupe", profile: "source-dedupe-test", type: "working" } }),
                createdAt: "2026-07-16T14:10:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "fbeast-hook", __fbeastHookSource: "fbeast-hook", toolName: "fbeast_memory_store", phase: "post-tool", ok: true, args: { agentId: "agent-source-detail", profile: "source-detail-sync-test", type: "working" } }),
                createdAt: "2026-07-16T14:18:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "fbeast_memory_store", ok: true, args: { agentId: "agent-source-detail", profile: "source-detail-sync-test", type: "working" } }),
                createdAt: "2026-07-16T14:18:08.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "fbeast_memory_source_attribution", ok: true, args: { profile: "source-attribution-test", readScope: "shared" } }),
                createdAt: "2026-07-16T14:20:00.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "fbeast-hook", __fbeastHookSource: "fbeast-hook", toolName: "fbeast_memory_retention_report", phase: "post-tool", ok: true, args: { agentId: "agent-retention", profile: "retention-audit-test", readScope: "agent" } }),
                createdAt: "2026-07-16T14:25:00.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "fbeast_memory_store", ok: true, args: { agentId: "agent-target-dedupe", profile: "target-dedupe-test", type: "episodic", cardId: "card-a" } }),
                createdAt: "2026-07-16T14:30:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "fbeast_memory_store", ok: true, args: { agentId: "agent-card-dedupe", profile: "card-dedupe-test", type: "working", cardId: "card-b" } }),
                createdAt: "2026-07-16T14:35:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "fbeast_memory_access_audit_report", ok: true, args: { agentId: "agent-a", profile: "default", repo: "djm204/frankenbeast" } }),
                createdAt: "2026-07-16T14:45:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "fbeast_memory_store", ok: true, args: { agentId: "agent-denied-merge", profile: "denied-merge-test", type: "working" } }),
                createdAt: "2026-07-16T14:50:05.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "mcp__fbeast-memory__fbeast_memory_store", ok: true, args: { agentId: "agent-qualified", profile: "qualified-tool-test", type: "working" } }),
                createdAt: "2026-07-16T15:00:00.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "central-dispatch", source: "central-dispatch", toolName: "fbeast_memory_query", ok: true, args: { agentId: "agent-active-profile", activeProfile: "active-profile-test", type: "working" } }),
                createdAt: "2026-07-16T15:05:00.000Z",
              },
              {
                eventType: "tool_call",
                payload: JSON.stringify({ __fbeastAuditTrailSource: "fbeast-hook", __fbeastHookSource: "fbeast-hook", toolName: "fbeast_memory_query", args: { agentId: "agent-derived-unknown", profile: "derived-unknown-test", type: "working" } }),
                createdAt: "2026-07-16T15:10:00.000Z",
              },
            ];
          }
          return workingMemoryRowsByPath.get(_dbPath) ?? [];
        }),
      })),
      close: vi.fn(),
      dbPath: _dbPath,
      options,
    };
    databaseInstances.push(db);
    Object.assign(this as object, db);
  }),
}));

vi.mock("@franken/brain", () => ({
  DEFAULT_WORKING_MEMORY_LIMITS: {
    maxEntries: 10_000,
    maxValueBytes: 5 * 1024 * 1024,
    maxTotalBytes: 64 * 1024 * 1024,
  },
  SqliteBrain: vi.fn(function MockSqliteBrain(
    this: unknown,
    dbPath: string,
    limits?: { maxEntries?: number; maxTotalBytes?: number },
  ) {
    let workingSnapshot: Record<string, unknown> = {
      "task-1": "working entry",
      "agents/oncall/runbook": "shared runbook",
      "temporary-operational": {
        value: "rotate release key",
        category: "temporary-operational",
        sourceScope: "mcp-memory-store",
        expiresAt: "2026-07-16T06:00:00.000Z",
      },
      "github-token": "ghp_" + "supersecretvalue123456",
      "public-key": "sk-" + "secretvalue123456",
      "deployment-notes":
        "-----BEGIN " +
        "OPENSSH PRIVATE KEY-----\nsecret\n-----END " +
        "OPENSSH PRIVATE KEY-----",
      "status-page": "password=hunter2 session_cookie=abc123value",
      "legacy-db-passwd": "legacy-password-alias",
      "ops-note": "slack_webhook_url=https://hooks.slack.com/services/T000/B000/SECRET discord webhook https://discord.com/api/webhooks/1234567890/abcdef_SECRET",
      "env-snippet": "AWS_SECRET_ACCESS_KEY=AKIA" + "supersecretvalue123456 REGION=us-east-1",
      "legacy-token-snippet": "xoxb-" + "legacytokenvalue123 glpat-legacytokenvalue123",
      "basic-auth": "Authorization: *** " + "dXNlcjpwYXNz",
      "token-auth": "Authorization: Token " + "secret-token-value-that-must-not-leak",
      "db_pwd": "super-pwd-value",
      "db_passwd": "super-passwd-value",
      "slack_webhook_url": "https://hooks.slack.com/services/T000/B000/secretwebhookvalue",
      "ops-notes": "Mirror alerts to https://discord.com/api/webhooks/123456/secretwebhookvalue",

      "json-literal-secrets": '{"password":123456,"token":true,"authToken":{"raw":"«redacted:ghs_…»"},"accessKey":["secretvalue123456"],"safe":"ok"}',
      profile: {
        password: "hunter2",
        "alice@example.com": "oncall",
        "bob@example.com": "backup",
      },
      "object-secret": {
        password: "hunter2",
        nested: { token: 987654 },
        "alice@example.com": "oncall",
      },
      "__fbeast_agent_memory__/alpha/private-task": {
        __fbeastMemoryScope: "fbeast:agent-memory",
        agentId: "alpha",
        value: "private entry",
      },
      "__fbeast_agent_memory__/beta/private-task": {
        __fbeastMemoryScope: "fbeast:agent-memory",
        agentId: "beta",
        value: "beta entry",
      },
    };
    const persistedRows = workingMemoryRowsByPath.get(dbPath);
    if (persistedRows !== undefined) {
      workingSnapshot = Object.fromEntries(
        persistedRows.map((row) => {
          try {
            return [row.key, JSON.parse(row.value)];
          } catch {
            return [row.key, row.value];
          }
        }),
      );
    }
    const brain = {
      working: {
        restore: vi.fn((snapshot: Record<string, unknown>) => {
          workingSnapshot = snapshot;
        }),
        snapshot: vi.fn(() => workingSnapshot),
        set: vi.fn(),
        has: vi.fn(() => false),
        delete: vi.fn(),
      },
      episodic: {
        recall: vi.fn(() => [
          {
            id: "evt-1",
            type: "success",
            summary: "episode summary",
            createdAt: "2026-07-06T00:00:00.000Z",
          },
        ]),
        recent: vi.fn(() => [
          {
            id: "evt-shared",
            type: "success",
            summary: "password: correct horse battery staple",
            details: {
              apiKey: "sk_" + "secretvalue123456",
              "bob@example.com": "operator",
              __fbeastMemoryScope: "fbeast:agent-memory",
              agentId: "alice@example.com",
            },
            createdAt: "2026-07-06T00:00:00.000Z",
          },
          {
            id: "evt-credentialed-uri",
            type: "success",
            summary: "postgres://alice:hunter2@db.internal/app",
            details: {},
            createdAt: "2026-07-06T00:00:00.000Z",
          },
          {
            id: "evt-alpha",
            type: "success",
            summary: "alpha episode",
            details: {
              __fbeastMemoryScope: "fbeast:agent-memory",
              agentId: "alpha",
            },
            createdAt: "2026-07-06T00:00:00.000Z",
          },
          {
            id: "evt-beta",
            type: "success",
            summary: "beta episode",
            details: {
              __fbeastMemoryScope: "fbeast:agent-memory",
              agentId: "beta",
            },
            createdAt: "2026-07-06T00:00:00.000Z",
          },
        ]),
        record: vi.fn(),
      },
      rightToForget: vi.fn(() => ({
        selectorHash: "hash",
        dryRun: false,
        deleted: { working: 1, episodic: 0, derived: 0 },
        remainingReferences: 0,
      })),
      memoryRetentionReport: vi.fn(() => ({
        generatedAt: "2026-07-16T00:00:00.000Z",
        policies: [],
        counts: { total: 4, protected: 0, expired: 0, nearingExpiry: 0, compactionCandidates: 0 },
        entries: [
          {
            store: "working",
            key: "shared.low",
            class: "environment_fact",
            action: "retain",
            policy: { class: "environment_fact", retentionDays: 180, compactPriority: 30, protected: false, description: "env" },
            protected: false,
            reason: "retain",
          },
          {
            store: "working",
            key: "shared.high",
            class: "temporary_operational",
            action: "retain",
            policy: { class: "temporary_operational", retentionDays: 1, compactPriority: 100, protected: false, description: "tmp" },
            protected: false,
            reason: "retain",
          },
          {
            store: "working",
            key: "__fbeast_agent_memory__/beta/private",
            agentId: "beta",
            class: "temporary_operational",
            action: "retain",
            policy: { class: "temporary_operational", retentionDays: 1, compactPriority: 100, protected: false, description: "tmp" },
            protected: false,
            reason: "retain",
          },
          {
            store: "working",
            key: "__fbeast_agent_memory__/alpha/private",
            agentId: "alpha",
            class: "project_convention",
            action: "retain",
            policy: { class: "project_convention", retentionDays: 365, compactPriority: 20, protected: false, description: "project" },
            protected: false,
            reason: "retain",
          },
        ],
        compactionCandidates: [],
      })),
      memoryReview: {
        propose: vi.fn((input: Record<string, unknown>) => ({
          ...input,
          id: "memcand_1",
          status: "pending",
          createdAt: "2026-07-16T00:00:00.000Z",
          updatedAt: "2026-07-16T00:00:00.000Z",
        })),
        approve: vi.fn(() => ({ id: "memcand_1", status: "approved" })),
        reject: vi.fn(() => ({ id: "memcand_1", status: "rejected" })),
        neverStore: vi.fn(() => ({ id: "memcand_1", status: "never_store" })),
        listProvenance: vi.fn((options?: {
          key?: string;
          keys?: string[];
          limit?: number;
          visibleKeyPrefixes?: string[];
          includeUnprefixedKeys?: boolean;
          unprefixedKeyPrefixExclusions?: string[];
          excludeKeyPrefixes?: string[];
        }) => {
          const rows = [
            {
              targetStore: "working",
              key: "task-1",
              value: "working entry",
              candidateId: "memcand_shared",
              source: "shared-source",
              confidence: 0.9,
              reason: "shared",
              approvedAt: "2026-07-16T00:00:00.000Z",
            },
            {
              targetStore: "working",
              key: "__fbeast_agent_memory__/alpha/private-task",
              value: {
                __fbeastMemoryScope: "fbeast:agent-memory",
                agentId: "alpha",
                value: "alpha entry",
              },
              candidateId: "memcand_alpha",
              source: "alpha-source",
              confidence: 0.9,
              reason: "alpha",
              approvedAt: "2026-07-16T00:01:00.000Z",
            },
            {
              targetStore: "working",
              key: "__fbeast_agent_memory__/beta/private-task",
              value: {
                __fbeastMemoryScope: "fbeast:agent-memory",
                agentId: "beta",
                value: "beta entry",
              },
              candidateId: "memcand_beta",
              source: "beta-source",
              confidence: 0.9,
              reason: "beta",
              approvedAt: "2026-07-16T00:02:00.000Z",
            },
          ];
          let filtered = rows;
          if (options?.key !== undefined) {
            filtered = filtered.filter((row) => row.key === options.key);
          }
          if (options?.keys !== undefined) {
            filtered = filtered.filter((row) => options.keys!.includes(row.key));
          }
          for (const prefix of options?.excludeKeyPrefixes ?? []) {
            filtered = filtered.filter((row) => !row.key.startsWith(prefix));
          }
          if ((options?.visibleKeyPrefixes?.length ?? 0) > 0) {
            const visiblePrefixes = options!.visibleKeyPrefixes!;
            const unprefixedExclusions = options!.unprefixedKeyPrefixExclusions ?? visiblePrefixes;
            filtered = filtered.filter((row) =>
              visiblePrefixes.some((prefix) => row.key.startsWith(prefix))
              || (options!.includeUnprefixedKeys === true
                && unprefixedExclusions.every((prefix) => !row.key.startsWith(prefix))),
            );
          }
          return filtered.slice(0, options?.limit ?? filtered.length);
        }),
        conflictsFor: vi.fn(() => []),
        resolveConflict: vi.fn(() => ({ id: "memcand_1", status: "approved" })),
      },
      flush: vi.fn(),
    };
    brainInstances.push({ ...brain, dbPath, limits });
    Object.assign(this as object, brain);
  }),
}));

import { createBrainAdapter } from "./brain-adapter.js";

describe("createBrainAdapter", () => {
  beforeEach(() => {
    databaseInstances.length = 0;
    brainInstances.length = 0;
    workingMemoryRowsByPath.clear();
    vi.clearAllMocks();
  });

  it("delegates startup hydration to SqliteBrain with its bounded defaults", () => {
    createBrainAdapter("/tmp/beast.db");

    expect(databaseInstances).toHaveLength(0);
    expect(brainInstances).toHaveLength(1);
    expect(brainInstances[0]).toMatchObject({
      dbPath: "/tmp/beast.db",
      limits: { maxEntries: 10_000, maxTotalBytes: 64 * 1024 * 1024 },
    });
    expect(brainInstances[0]!.working.restore).not.toHaveBeenCalled();
  });

  it("passes configurable hydration budgets to SqliteBrain's bounded startup path", () => {
    createBrainAdapter("/tmp/bounded.db", {
      hydration: { maxRows: 2, maxBytes: 1_000 },
    });

    expect(brainInstances[0]).toMatchObject({
      dbPath: "/tmp/bounded.db",
      limits: { maxEntries: 2, maxTotalBytes: 1_000 },
    });
  });

  it("rejects invalid hydration budgets before opening the database", () => {
    expect(() =>
      createBrainAdapter("/tmp/beast.db", {
        hydration: { maxRows: 0 },
      }),
    ).toThrow("hydration.maxRows must be a positive safe integer");
    expect(databaseInstances).toHaveLength(0);
    expect(brainInstances).toHaveLength(0);
  });

  it("keeps direct API memory reads isolated by profile database path", async () => {
    workingMemoryRowsByPath.set("/tmp/profiles/default/beast.db", [
      { key: "profile-note", value: JSON.stringify("default profile memory") },
    ]);
    workingMemoryRowsByPath.set("/tmp/profiles/doctor/beast.db", [
      { key: "profile-note", value: JSON.stringify("doctor profile memory") },
    ]);

    const defaultProfile = createBrainAdapter("/tmp/profiles/default/beast.db");
    const doctorProfile = createBrainAdapter("/tmp/profiles/doctor/beast.db");

    const defaultRows = await defaultProfile.query({
      query: "profile memory",
      type: "working",
      readScope: "shared",
      limit: 10,
    });
    const doctorRows = await doctorProfile.query({
      query: "profile memory",
      type: "working",
      readScope: "shared",
      limit: 10,
    });

    expect(defaultRows).toEqual([
      { key: "profile-note", value: "default profile memory", type: "working" },
    ]);
    expect(doctorRows).toEqual([
      { key: "profile-note", value: "doctor profile memory", type: "working" },
    ]);
    expect(brainInstances.map((brain) => brain.dbPath)).toEqual([
      "/tmp/profiles/default/beast.db",
      "/tmp/profiles/doctor/beast.db",
    ]);
    expect(JSON.stringify(defaultRows)).not.toContain("doctor profile memory");
    expect(JSON.stringify(doctorRows)).not.toContain("default profile memory");
  });

  it("stores and queries only supported memory types", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    await brain.store({
      key: "task-1",
      value: "working entry",
      type: "working",
    });
    await brain.store({
      key: "evt-1",
      value: "episode summary",
      type: "episodic",
    });

    const mockBrain = brainInstances[0];
    expect(mockBrain.working.set).toHaveBeenCalledWith(
      "task-1",
      "working entry",
    );
    expect(mockBrain.flush).toHaveBeenCalledOnce();
    expect(mockBrain.episodic.record).toHaveBeenCalledWith(
      expect.objectContaining({ summary: "evt-1: episode summary" }),
    );

    const workingResult = await brain.query({
      query: "task",
      type: "working",
      limit: 5,
    });
    expect(
      workingResult.some(
        (row) => row.key === "task-1" && row.type === "working",
      ),
    ).toBe(true);

    const episodicResult = await brain.query({
      query: "episode",
      type: "episodic",
      limit: 5,
    });
    expect(episodicResult.some((row) => row.type === "episodic")).toBe(true);
  });

  it("stores temporary operational working facts with expiresAt metadata when ttlMs is provided", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      const brain = createBrainAdapter("/tmp/beast.db");
      await brain.store({ key: "run:tmp", value: "short-lived status", type: "working", ttlMs: 60_000 });

      const mockBrain = brainInstances[0];
      expect(mockBrain.working.set).toHaveBeenCalledWith("run:tmp", {
        value: "short-lived status",
        category: "temporary-operational",
        sourceScope: "mcp-memory-store",
        expiresAt: "2026-01-01T00:01:00.000Z",
      });
      expect(mockBrain.flush).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects unsafe working-memory TTLs before writing memory", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];

    for (const invalidTtlMs of [NaN, Infinity, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(
        brain.store({ key: "run:tmp", value: "status", type: "working", ttlMs: invalidTtlMs as number }),
      ).rejects.toThrow("ttlMs must be a positive integer");
    }

    expect(mockBrain.working.set).not.toHaveBeenCalled();
    expect(mockBrain.flush).not.toHaveBeenCalled();
  });

  it("rejects ttlMs for episodic memory because episodic records are durable", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];

    await expect(
      brain.store({ key: "evt-ttl", value: "should stay durable", type: "episodic", ttlMs: 60_000 }),
    ).rejects.toThrow("ttlMs is only supported for working memory");

    expect(mockBrain.episodic.record).not.toHaveBeenCalled();
    expect(mockBrain.working.set).not.toHaveBeenCalled();
  });

  it("does not label durable working values with expiresAt fields as TTL-expiring", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];
    mockBrain.working.snapshot.mockReturnValue({
      asset: { value: "certificate metadata", category: "asset", expiresAt: "2099-01-01T00:00:00.000Z" },
      tmp: { value: "runtime status", category: "temporary-operational", expiresAt: "2099-01-01T00:00:00.000Z" },
      tmpAlias: { value: "aliased runtime status", category: "operational-temporary", expiresAt: "2099-01-01T00:00:00.000Z" },
    });

    const result = await brain.query({ query: "", type: "working", limit: 5 });

    expect(result).toEqual([
      { key: "asset", value: JSON.stringify({ value: "certificate metadata", category: "asset", expiresAt: "2099-01-01T00:00:00.000Z" }), type: "working" },
      { key: "tmp", value: "runtime status (expires 2099-01-01T00:00:00.000Z)", type: "working" },
      { key: "tmpAlias", value: "aliased runtime status (expires 2099-01-01T00:00:00.000Z)", type: "working" },
    ]);
  });

  it("rejects unsafe query limits before reading memory", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];

    for (const invalidLimit of [
      NaN,
      Infinity,
      0,
      -1,
      1.5,
      1001,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      await expect(
        brain.query({ query: "task", limit: invalidLimit as number }),
      ).rejects.toThrow("limit must be a positive integer between 1 and 1000");
    }

    expect(mockBrain.episodic.recall).not.toHaveBeenCalled();
    expect(mockBrain.working.snapshot).not.toHaveBeenCalled();
  });

  it("filters reads to shared plus matching agent-scoped memory when requested", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const alphaRows = await brain.query({
      query: "entry",
      readScope: "agent",
      agentId: "alpha",
      limit: 30,
    });
    expect(alphaRows.map((row) => row.key)).toContain("task-1");
    expect(alphaRows.map((row) => row.key)).toContain("private-task");
    expect(alphaRows.some((row) => row.key === "private-task" && String(row.value).includes("private entry"))).toBe(true);
    expect(alphaRows.map((row) => row.value)).not.toContain("beta entry");

    const sharedRows = await brain.query({
      query: "entry",
      type: "working",
      readScope: "shared",
      limit: 20,
    });
    expect(sharedRows.map((row) => row.key)).toEqual(["task-1"]);

    const sections = await brain.frontload({
      readScope: "agent",
      agentId: "alpha",
    });
    const text = sections.flatMap((section) => section.entries).join("\n");
    expect(text).toContain("task-1: working entry");
    expect(text).toContain("agents/oncall/runbook: shared runbook");
    expect(text).toContain("private-task: private entry");
    expect(text).toContain("alpha episode");
    expect(text).not.toContain("beta entry");
    expect(text).not.toContain("beta episode");

    const mockBrain = brainInstances[0];
    expect(mockBrain.episodic.recall).toHaveBeenCalledWith("entry", -1);
    expect(mockBrain.episodic.recent).toHaveBeenCalledWith(-1);
  });

  it("exports scoped project memory with safe redaction by default", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const exported = await brain.exportProjectMemory({
      readScope: "shared",
      limit: 20,
    });
    const serialized = JSON.stringify(exported);

    expect(exported.version).toBe(1);
    expect(exported.redaction).toBe("safe");
    expect(exported.scope).toEqual({ readScope: "shared" });
    expect(exported.working.map((entry) => entry.key)).toContain("task-1");
    expect(exported.working.map((entry) => entry.key)).toContain("agents/oncall/runbook");
    expect(exported.working.map((entry) => entry.value)).not.toContain("beta entry");
    expect(serialized).toContain("[redacted]");
    expect(serialized).not.toContain("ghp_" + "supersecretvalue123456");
    expect(serialized).not.toContain("sk-" + "secretvalue123456");
    expect(serialized).not.toContain("sk_" + "secretvalue123456");
    expect(serialized).not.toContain("OPENSSH PRIVATE KEY");
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("correct horse battery staple");
    expect(serialized).not.toContain("horse battery staple");
    expect(serialized).not.toContain("short-password-alias");
    expect(serialized).not.toContain("legacy-password-alias");
    expect(serialized).not.toContain("hooks.slack.com/services/T000/B000/SECRET");
    expect(serialized).not.toContain("discord.com/api/webhooks/1234567890/abcdef_SECRET");
    expect(serialized).not.toContain("abc123value");
    expect(serialized).not.toContain("super-pwd-value");
    expect(serialized).not.toContain("super-passwd-value");
    expect(serialized).not.toContain("secretwebhookvalue");
    expect(serialized).not.toContain("hooks.slack.com/services");
    expect(serialized).not.toContain("discord.com/api/webhooks");
    expect(serialized).not.toContain("dXNlcjpwYXNz");
    expect(serialized).not.toContain("secret-token-value-that-must-not-leak");
    expect(serialized).not.toContain("postgres://alice:hunter2@db.internal/app");
    expect(serialized).not.toContain("//alice:hunter2@db.internal/app");
    expect(serialized).not.toContain('"password":123456');
    expect(serialized).not.toContain('"token":true');
    expect(serialized).not.toContain("987654");
    expect(serialized).toContain("oncall");
    expect(serialized).toContain("backup");
    expect(serialized).not.toContain("alice@example.com");
    expect(serialized).not.toContain("bob@example.com");
    expect(serialized).not.toContain("apiKey");
    expect(serialized).not.toContain("dXNlcjpwYXNz");
    expect(serialized).not.toContain("secret-token-value-that-must-not-leak");
    expect(serialized).not.toContain("postgres://alice:hunter2");
    expect(serialized).not.toContain("ghs_secretvalue123456");
    expect(serialized).not.toContain("secretvalue123456");
    expect(serialized).not.toContain("AKIA" + "supersecretvalue123456");
    expect(serialized).not.toContain("xoxb-legacytokenvalue123");
    expect(serialized).not.toContain("glpat-legacytokenvalue123");
    expect(serialized).not.toContain("123456");
    expect(serialized).not.toContain('"token":true');
    expect(exported.working).toContainEqual(
      expect.objectContaining({
        key: "temporary-operational",
        value: "rotate release key",
        expiresAt: "2026-07-16T06:00:00.000Z",
      }),
    );
  });

  it("redacts all agent export identifiers in safe mode", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const exported = await brain.exportProjectMemory({
      readScope: "agent",
      agentId: "alpha",
      limit: 40,
    });

    expect(exported.scope).toEqual({
      readScope: "agent",
      agentId: "[redacted-agent-id]",
    });
    expect(exported.working).toContainEqual(expect.objectContaining({
      key: "private-task",
      agentId: "[redacted-agent-id]",
      value: "private entry",
    }));
    const exportedText = JSON.stringify(exported);
    expect(exportedText).not.toContain('"agentId":"alpha"');
    expect(exportedText).not.toContain('"agentId":"beta"');
  });

  it("applies retention report budgets after read-scope filtering", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryRetentionReport({
      readScope: "shared",
      maxEntries: 1,
    });

    expect(brainInstances[0].memoryRetentionReport).toHaveBeenCalledWith({
      maxEntries: Number.MAX_SAFE_INTEGER,
    });
    expect(report.entries.map((entry) => entry.key)).toEqual([
      "shared.low",
      "shared.high",
    ]);
    expect(report.compactionCandidates).toEqual([
      expect.objectContaining({ key: "shared.high", action: "compact" }),
    ]);
    expect(report.counts).toMatchObject({
      total: 2,
      compactionCandidates: 1,
    });
  });

  it("counts existing scoped compaction candidates before applying retention budgets", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    brainInstances[0].memoryRetentionReport.mockReturnValueOnce({
      generatedAt: "2026-07-16T00:00:00.000Z",
      policies: [],
      counts: { total: 3, protected: 0, expired: 0, nearingExpiry: 0, compactionCandidates: 1 },
      entries: [
        {
          store: "working",
          key: "shared.fresh-high",
          class: "temporary_operational",
          action: "retain",
          policy: { class: "temporary_operational", retentionDays: 1, compactPriority: 100, protected: false, description: "tmp" },
          protected: false,
          reason: "retain",
        },
        {
          store: "working",
          key: "shared.fresh-low",
          class: "environment_fact",
          action: "retain",
          policy: { class: "environment_fact", retentionDays: 180, compactPriority: 30, protected: false, description: "env" },
          protected: false,
          reason: "retain",
        },
        {
          store: "working",
          key: "shared.already-compact",
          class: "transient_observation",
          action: "compact",
          policy: { class: "transient_observation", retentionDays: 7, compactPriority: 80, protected: false, description: "transient" },
          protected: false,
          reason: "retention window elapsed",
        },
      ],
      compactionCandidates: [],
    });

    const report = await brain.memoryRetentionReport({
      readScope: "shared",
      maxEntries: 2,
    });

    expect(report.compactionCandidates.map((entry) => entry.key)).toEqual(["shared.already-compact"]);
    expect(report.entries.find((entry) => entry.key === "shared.fresh-high")).toMatchObject({ action: "retain" });
  });

  it("includes scoped near-expiry rows when applying retention budgets", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    brainInstances[0].memoryRetentionReport.mockReturnValueOnce({
      generatedAt: "2026-07-16T00:00:00.000Z",
      policies: [],
      counts: { total: 2, protected: 0, expired: 0, nearingExpiry: 1, compactionCandidates: 0 },
      entries: [
        {
          store: "working",
          key: "shared.fresh-low",
          class: "environment_fact",
          action: "retain",
          policy: { class: "environment_fact", retentionDays: 180, compactPriority: 30, protected: false, description: "env" },
          protected: false,
          reason: "retain",
        },
        {
          store: "working",
          key: "shared.near-expiry",
          class: "temporary_operational",
          action: "nearing_expiry",
          policy: { class: "temporary_operational", retentionDays: 1, compactPriority: 100, protected: false, description: "tmp" },
          protected: false,
          reason: "TTL expires soon",
        },
      ],
      compactionCandidates: [],
    });

    const report = await brain.memoryRetentionReport({
      readScope: "shared",
      maxEntries: 1,
    });

    expect(report.compactionCandidates.map((entry) => entry.key)).toEqual(["shared.near-expiry"]);
    expect(report.entries.find((entry) => entry.key === "shared.near-expiry")).toMatchObject({ action: "compact" });
  });

  it("rejects agent read scope without an agent id before reading memory", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];

    await expect(
      brain.query({ query: "entry", readScope: "agent", limit: 10 }),
    ).rejects.toThrow("agentId is required when readScope is agent");

    expect(mockBrain.episodic.recall).not.toHaveBeenCalled();
    expect(mockBrain.working.snapshot).not.toHaveBeenCalled();
  });

  it("stores agent-scoped keys and episodic details without lossy agent id normalization", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    await brain.store({
      key: "task",
      value: "scoped",
      type: "working",
      agentId: "Alpha Team!",
    });
    await brain.store({
      key: "episode",
      value: "scoped",
      type: "episodic",
      agentId: "Alpha Team!",
    });

    const mockBrain = brainInstances[0];
    expect(mockBrain.working.set).toHaveBeenCalledWith(
      "__fbeast_agent_memory__/Alpha%20Team!/task",
      {
        __fbeastMemoryScope: "fbeast:agent-memory",
        agentId: "Alpha Team!",
        value: "scoped",
      },
    );
    expect(mockBrain.episodic.record).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "episode: scoped",
        details: {
          __fbeastMemoryScope: "fbeast:agent-memory",
          agentId: "Alpha Team!",
        },
      }),
    );
  });

  it("keeps all-scope episodic reads bounded while scoped reads can backfill visible rows", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];

    await brain.query({ query: "episode", type: "episodic", limit: 7 });
    await brain.frontload();
    await brain.query({
      query: "episode",
      type: "episodic",
      readScope: "shared",
      limit: 7,
    });
    await brain.frontload({ readScope: "shared" });

    expect(mockBrain.episodic.recall).toHaveBeenNthCalledWith(
      1,
      "episode",
      7,
    );
    expect(mockBrain.episodic.recent).toHaveBeenNthCalledWith(1, 100);
    expect(mockBrain.episodic.recall).toHaveBeenNthCalledWith(
      2,
      "episode",
      -1,
    );
    expect(mockBrain.episodic.recent).toHaveBeenNthCalledWith(2, -1);
  });

  it("translates right-to-forget exact keys for agent-scoped working memory", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    await brain.rightToForget({ key: "profile", agentId: "Alpha Team!" });

    expect(brainInstances[0].rightToForget).toHaveBeenCalledWith({
      key: "__fbeast_agent_memory__/Alpha%20Team!/profile",
    });
  });

  it("builds a redacted memory access audit report from governance and observer logs", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "default", limit: 20 });
    const serialized = JSON.stringify(report);

    expect(report.count).toBe(3);
    expect(report.events.map((event) => event.tool)).toEqual([
      "fbeast_memory_store",
      "fbeast_memory_query",
      "fbeast_memory_export",
    ]);
    expect(report.summary.byOperation).toEqual({ write: 1, read: 2 });
    expect(report.summary.byDecision).toEqual({ denied: 1, approved: 2 });
    expect(report.events[0]).toMatchObject({
      agentId: "agent-c",
      cardId: "t_abc123",
      operation: "write",
      targetStore: "working",
      decision: "denied",
    });
    expect(serialized).not.toContain("rm -rf");
    expect(serialized).not.toContain("ghp_secretvalue123456");
  });

  it("filters memory access audit reports by agent, operation, and decision", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({
      agentId: "agent-b",
      operation: "review:approve",
      decision: "approved",
      limit: 20,
    });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      agentId: "agent-b",
      tool: "fbeast_memory_review_decide",
      operation: "review:approve",
      targetClass: "memory-review-candidate",
      decision: "approved",
    });
  });

  it("does not echo unvalidated operation or type fields in memory access audit reports", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "security-test", limit: 20 });
    const serialized = JSON.stringify(report);

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      tool: "fbeast_memory_query",
      operation: "read",
      targetStore: "working|episodic",
      decision: "validation_error",
    });
    expect(serialized).not.toContain("sk-secretvalue123456");
    expect(serialized).not.toContain("ghp_secretvalue123456");
  });

  it("classifies wrapper-level execute_tool audit rows from args.tool", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "proxied-args-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      tool: "fbeast_memory_store",
      operation: "write",
      targetStore: "working",
      decision: "error",
      agentId: "agent-proxied",
    });
  });

  it("reads nested execute_tool args for audit metadata", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "nested-proxied-args-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      tool: "fbeast_memory_store",
      operation: "write",
      targetStore: "working",
      decision: "error",
      agentId: "agent-nested-proxied",
    });
  });

  it("distinguishes right-to-forget dry runs from deletion activity", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "dry-run-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      tool: "fbeast_memory_right_to_forget",
      operation: "delete:dry_run",
      decision: "approved",
    });
    expect(report.summary.byOperation).toEqual({ "delete:dry_run": 1 });
  });

  it("deduplicates governed and observed memory access events with redacted metadata", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "duplicate-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      source: "audit_trail",
      tool: "fbeast_memory_store",
      operation: "write",
    });

    const agentReport = await brain.memoryAccessAuditReport({ agentId: "agent-actual", profile: "duplicate-test", limit: 20 });
    expect(agentReport.count).toBe(1);
    expect(agentReport.events[0]).toMatchObject({
      agentId: "agent-actual",
      tool: "fbeast_memory_store",
    });
  });

  it("does not dedupe sparse governed rows with unrelated richer observer metadata", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "sparse-duplicate-test", limit: 20 });

    expect(report.count).toBe(2);
    expect(report.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tool: "fbeast_memory_store",
        operation: "write",
        agentId: "agent-sparse",
        profile: "sparse-duplicate-test",
      }),
      expect.objectContaining({
        tool: "fbeast_memory_store",
        operation: "write",
        profile: "sparse-duplicate-test",
      }),
    ]));
    expect(report.summary.byAgent).toEqual({ "agent-sparse": 1 });
  });

  it("deduplicates nonstandard redaction placeholders with observer metadata", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "placeholder-duplicate-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      tool: "fbeast_memory_store",
      agentId: "agent-placeholder",
      profile: "placeholder-duplicate-test",
    });
  });

  it("keeps dry-run classification when deduping redacted right-to-forget rows", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ tool: "fbeast_memory_right_to_forget", limit: 20 });

    expect(report.count).toBe(4);
    expect(report.summary.byOperation).toEqual({ "delete:dry_run": 2, delete: 2 });
  });

  it("bounds memory access audit source scans in SQL", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    await brain.memoryAccessAuditReport({ limit: 5 });

    const prepareSql = databaseInstances.flatMap((db) => db.prepare.mock.calls.map(([sql]) => String(sql)));
    const governorSql = prepareSql.find((sql) => sql.includes("FROM governor_log"));
    expect(governorSql).toContain("json_extract");
    expect(governorSql).toContain("__fbeastGovernanceSource");
    expect(governorSql).toContain("__fbeastHookSource");
    expect(governorSql).toContain("LIMIT ?");
    expect(prepareSql.find((sql) => sql.includes("FROM audit_trail"))).toContain("LIMIT ?");
  });

  it("keeps memory access audit source scans bounded when metadata filters are present", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    await brain.memoryAccessAuditReport({ profile: "sparse-duplicate-test", limit: 5 });

    const prepareSql = databaseInstances.at(-1)!.prepare.mock.calls.map(([sql]) => String(sql));
    const governorSql = prepareSql.find((sql) => sql.includes("FROM governor_log"));
    const auditSql = prepareSql.find((sql) => sql.includes("FROM audit_trail"));
    expect(governorSql).toContain("$.profile");
    expect(governorSql).toContain("LIMIT ?");
    expect(auditSql).toContain("$.args.profile");
    expect(auditSql).toContain("LIMIT ?");
  });

  it("normalizes qualified tool names in audit SQL prefilters", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ tool: "fbeast_memory_store", profile: "qualified-tool-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      tool: "fbeast_memory_store",
      agentId: "agent-qualified",
    });
    const prepareSql = databaseInstances.at(-1)!.prepare.mock.calls.map(([sql]) => String(sql));
    const governorSql = prepareSql.find((sql) => sql.includes("FROM governor_log"));
    const auditSql = prepareSql.find((sql) => sql.includes("FROM audit_trail"));
    expect(governorSql).toContain("LIKE ('%__' || ?)");
    expect(auditSql).toContain("LIKE ('%__' || ?)");
  });

  it("includes ok-derived decisions in audit-trail SQL filters and activeProfile extraction", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ decision: "approved", profile: "active-profile-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      agentId: "agent-active-profile",
      profile: "active-profile-test",
      decision: "approved",
    });
    const prepareSql = databaseInstances.at(-1)!.prepare.mock.calls.map(([sql]) => String(sql));
    const auditSql = prepareSql.find((sql) => sql.includes("FROM audit_trail"));
    expect(auditSql).toContain("$.ok");
  });

  it("includes derived unknown decisions in audit-trail SQL filters", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ decision: "unknown", profile: "derived-unknown-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      agentId: "agent-derived-unknown",
      profile: "derived-unknown-test",
      decision: "unknown",
    });
    const prepareSql = databaseInstances.at(-1)!.prepare.mock.calls.map(([sql]) => String(sql));
    const auditSql = prepareSql.find((sql) => sql.includes("FROM audit_trail"));
    expect(auditSql).toContain("json_type");
    expect(auditSql).toContain("$.decision");
    expect(auditSql).toContain("$.ok");
  });

  it("includes unsafe explicit decisions when filtering for unknown", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ decision: "unknown", profile: "decision-secret-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      agentId: "agent-decision",
      decision: "unknown",
    });
    const prepareSql = databaseInstances.at(-1)!.prepare.mock.calls.map(([sql]) => String(sql));
    const auditSql = prepareSql.find((sql) => sql.includes("FROM audit_trail"));
    expect(auditSql).toContain("NOT IN");
  });

  it("includes nested proxy tools in audit SQL tool filters", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ tool: "fbeast_memory_store", profile: "deep-proxied-tool-filter-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      agentId: "agent-deep-proxied",
      tool: "fbeast_memory_store",
    });
    const prepareSql = databaseInstances.at(-1)!.prepare.mock.calls.map(([sql]) => String(sql));
    const auditSql = prepareSql.find((sql) => sql.includes("FROM audit_trail"));
    expect(auditSql).toContain("$.args.args.tool");
    expect(auditSql).toContain("$.args.args.toolName");
    expect(auditSql).toContain("$.args.args.args.tool");
    expect(auditSql).toContain("$.args.args.args.toolName");
  });

  it("does not cap source scans before operation filtering", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    await brain.memoryAccessAuditReport({ operation: "read", limit: 5 });

    const prepareSql = databaseInstances.at(-1)!.prepare.mock.calls.map(([sql]) => String(sql));
    expect(prepareSql.find((sql) => sql.includes("FROM governor_log"))).not.toContain("LIMIT ?");
    expect(prepareSql.find((sql) => sql.includes("FROM audit_trail"))).not.toContain("LIMIT ?");
  });

  it("does not attribute access audit report filters to acting agents", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ tool: "fbeast_memory_access_audit_report", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      tool: "fbeast_memory_access_audit_report",
      operation: "read",
      decision: "approved",
    });
    expect(report.events[0]).not.toHaveProperty("agentId");
    expect(report.events[0]).not.toHaveProperty("profile");
    expect(report.summary.byAgent).toEqual({});
    expect(report.summary.byProfile).toEqual({});
  });

  it("does not merge denied governor rows into later successful accesses", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "denied-merge-test", limit: 20 });

    expect(report.count).toBe(2);
    expect(report.summary.byDecision).toEqual({ approved: 1, denied: 1 });
  });

  it("keeps rapid repeated memory accesses as separate audit events", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "rapid-repeat-test", limit: 20 });

    expect(report.count).toBe(2);
    expect(report.summary.byTool).toEqual({ fbeast_memory_query: 2 });
    expect(report.summary.byAgent).toEqual({ "agent-rapid": 2 });
  });

  it("preserves handler failure decisions when merging governed and observed rows", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "error-merge-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      decision: "error",
      reason: "handler failed",
    });
    expect(report.summary.byDecision).toEqual({ error: 1 });
  });

  it("prefers specific target stores over broad governed defaults", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "target-specific-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      targetStore: "episodic",
    });
  });

  it("does not echo untrusted audit decision strings", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "decision-secret-test", limit: 20 });
    const serialized = JSON.stringify(report);

    expect(report.events[0]).toMatchObject({ decision: "unknown" });
    expect(report.summary.byDecision).toEqual({ unknown: 1 });
    expect(serialized).not.toContain("«redacted:sk-…»");
  });

  it("treats timezone-less ISO audit filters as UTC", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const utcReport = await brain.memoryAccessAuditReport({ since: "2026-07-16T10:30:00Z", until: "2026-07-16T10:30:00Z", limit: 20 });
    const timezoneLessReport = await brain.memoryAccessAuditReport({ since: "2026-07-16T10:30:00", until: "2026-07-16T10:30:00", limit: 20 });

    expect(timezoneLessReport.events).toEqual(utcReport.events);
    expect(timezoneLessReport.events.map((event) => event.timestamp)).toEqual(["2026-07-16T10:30:00.000Z"]);
  });

  it("keeps filtered memory access audit scans bounded before dedupe", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    await brain.memoryAccessAuditReport({ profile: "default", limit: 50 });

    const reportDb = databaseInstances.at(-1);
    expect(reportDb).toBeDefined();
    const auditQueries = reportDb!.prepare.mock.calls
      .map(([sql]) => String(sql))
      .filter((sql) => sql.includes("FROM governor_log") || sql.includes("FROM audit_trail"));
    expect(auditQueries).toHaveLength(2);
    expect(auditQueries.every((sql) => sql.includes("LIMIT ?"))).toBe(true);
  });

  it("excludes access-audit report invocations before audit-trail scan limits", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    await brain.memoryAccessAuditReport({ profile: "default", limit: 50 });

    const reportDb = databaseInstances.at(-1);
    const auditQuery = reportDb!.prepare.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes("FROM audit_trail"));
    expect(auditQuery).toContain("NOT");
    expect(auditQuery!.indexOf("NOT")).toBeLessThan(auditQuery!.indexOf("ORDER BY id DESC"));
  });

  it("counts audit summary keys that collide with Object prototype properties", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "toString", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.summary.byAgent["__proto__"]).toBe(1);
    expect(report.summary.byProfile.toString).toBe(1);
    expect(report.summary.byRepo.constructor).toBe(1);
  });

  it("includes unknown memory-tool probes in audit reports", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ decision: "unknown_tool", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      tool: "fbeast_memory_unknown",
      operation: "unknown",
      targetStore: "memory",
      targetClass: "memory-access",
      decision: "unknown_tool",
      reason: "unknown memory tool probe",
    });
  });

  it("includes unknown memory-tool probes when filtering by the unknown sentinel", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ tool: "fbeast_memory_unknown", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      tool: "fbeast_memory_unknown",
      operation: "unknown",
      decision: "unknown_tool",
    });
  });

  it("ignores caller-forged observer and public governor memory probes", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "forgery-test", limit: 20 });

    expect(report.count).toBe(0);
    expect(report.events).toEqual([]);
  });

  it("ignores self-recursive execute_tool audit wrappers", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "execute-self-test", limit: 20 });

    expect(report.count).toBe(0);
    expect(report.events).toEqual([]);
  });

  it("keeps redacted central governor provenance for memory deletions", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ tool: "fbeast_memory_right_to_forget", decision: "approved", limit: 20 });

    expect(report.events.some((event) => event.operation === "delete" && event.reason === "redacted central deletion approval")).toBe(true);
  });

  it("deduplicates central dispatch and hook audit-trail rows without merging repeated hook rows", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "source-dedupe-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      source: "audit_trail",
      tool: "fbeast_memory_store",
      agentId: "agent-source-dedupe",
      operation: "write",
    });
  });

  it("deduplicates central and hook governor rows for the same memory access", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "governor-source-dedupe-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      source: "governor_log",
      tool: "fbeast_memory_store",
      agentId: "agent-governor-dedupe",
      operation: "write",
    });
    expect(report.summary.byTool).toEqual({ fbeast_memory_store: 1 });
  });

  it("keeps source detail aligned when richer hook rows merge with central rows", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "source-detail-sync-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      source: "audit_trail",
      tool: "fbeast_memory_store",
      agentId: "agent-source-detail",
      operation: "write",
    });
    expect(report.summary.byTool).toEqual({ fbeast_memory_store: 1 });
  });

  it("includes source attribution reads in memory access audit reports", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "source-attribution-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      source: "audit_trail",
      tool: "fbeast_memory_source_attribution",
      operation: "read",
      targetStore: "working",
      targetClass: "memory-source-attribution",
      decision: "approved",
    });
  });

  it("includes retention reports in memory access audit reports", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "retention-audit-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      agentId: "agent-retention",
      tool: "fbeast_memory_retention_report",
      operation: "read",
      targetStore: "working|episodic",
      targetClass: "memory-retention-report",
      decision: "approved",
    });
  });

  it("keeps distinct target stores and card ids as separate audit events", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const targetReport = await brain.memoryAccessAuditReport({ profile: "target-dedupe-test", limit: 20 });
    expect(targetReport.count).toBe(2);
    expect(targetReport.events.map((event) => event.targetStore).sort()).toEqual(["episodic", "working"]);

    const cardReport = await brain.memoryAccessAuditReport({ profile: "card-dedupe-test", limit: 20 });
    expect(cardReport.count).toBe(2);
    expect(cardReport.events.map((event) => event.cardId).sort()).toEqual(["card-a", "card-b"]);
  });

  it("includes trusted hook-based memory access records", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "hook-test", limit: 20 });

    expect(report.count).toBe(2);
    expect(report.events.map((event) => event.tool)).toEqual([
      "fbeast_memory_store",
      "fbeast_memory_query",
    ]);
    expect(report.events.map((event) => event.source)).toEqual([
      "audit_trail",
      "governor_log",
    ]);
    expect(report.summary.byOperation).toEqual({ write: 1, read: 1 });
  });

  it("classifies failed handler audit events as errors", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    const report = await brain.memoryAccessAuditReport({ profile: "error-test", limit: 20 });

    expect(report.count).toBe(1);
    expect(report.events[0]).toMatchObject({
      tool: "fbeast_memory_query",
      decision: "error",
    });
    expect(report.summary.byDecision).toEqual({ error: 1 });
  });

  it("translates memory review proposals for agent-scoped working memory", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    await brain.proposeMemory({
      key: "profile",
      value: "scoped review value",
      source: "test",
      reason: "review",
      confidence: 1,
      agentId: "Alpha Team!",
    });

    expect(brainInstances[0].memoryReview.propose).toHaveBeenCalledWith({
      targetStore: "working",
      key: "__fbeast_agent_memory__/Alpha%20Team!/profile",
      value: "scoped review value",
      source: "test",
      confidence: 1,
      reason: "review",
    });
  });

  it("frontloads approved scoped review values as agent-private entries", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];
    mockBrain.working.snapshot.mockReturnValueOnce({
      "__fbeast_agent_memory__/alpha/approved-secret": "approved scoped value",
    });

    const sharedSections = await brain.frontload({ readScope: "shared" });
    mockBrain.working.snapshot.mockReturnValueOnce({
      "__fbeast_agent_memory__/alpha/approved-secret": "approved scoped value",
    });
    const alphaSections = await brain.frontload({ readScope: "agent", agentId: "alpha" });

    expect(sharedSections.flatMap((section) => section.entries).join("\n")).not.toContain("approved scoped value");
    expect(alphaSections.flatMap((section) => section.entries).join("\n")).toContain("approved-secret: approved scoped value");
  });

  it("filters memory attribution by read scope and redacts internal scoped keys", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];

    const sharedAttribution = await brain.memoryAttribution({ readScope: "shared", limit: 10 });
    const alphaAttribution = await brain.memoryAttribution({ readScope: "agent", agentId: "alpha", limit: 10 });
    const alphaExactAttribution = await brain.memoryAttribution({ key: "private-task", readScope: "agent", agentId: "alpha", limit: 10 });

    expect(sharedAttribution.map((row) => row.key)).toEqual(["task-1"]);
    expect(sharedAttribution.map((row) => row.value)).not.toContain("alpha entry");
    expect(alphaAttribution.map((row) => row.key)).toEqual(["task-1", "private-task"]);
    expect(alphaAttribution.map((row) => row.value)).toEqual(["working entry", "alpha entry"]);
    expect(alphaAttribution.map((row) => row.key).join("\n")).not.toContain("__fbeast_agent_memory__");
    expect(alphaExactAttribution.map((row) => row.key)).toEqual(["private-task"]);
    expect(mockBrain.memoryReview.listProvenance).toHaveBeenLastCalledWith({
      keys: ["private-task", "__fbeast_agent_memory__/alpha/private-task"],
      limit: 10,
    });
  });

  it("preserves structured memory attribution values while decoding scoped keys", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];
    const structuredValue = { nested: { enabled: true }, count: 2 };
    mockBrain.memoryReview.listProvenance.mockReturnValueOnce([
      {
        targetStore: "working",
        key: "structured-memory",
        value: structuredValue,
        candidateId: "memcand_structured",
        source: "shared-source",
        confidence: 0.9,
        reason: "structured",
        approvedAt: "2026-07-16T00:00:00.000Z",
      },
    ]);

    const attributions = await brain.memoryAttribution({ readScope: "shared" });

    expect(attributions).toHaveLength(1);
    expect(attributions[0]!.key).toBe("structured-memory");
    expect(attributions[0]!.value).toEqual(structuredValue);
  });

  it("uses attribution defaults and pre-filters scoped provenance before enforcing limits", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];

    await brain.memoryAttribution({ readScope: "shared" });
    await brain.memoryAttribution({ readScope: "agent", agentId: "alpha" });

    expect(mockBrain.memoryReview.listProvenance).toHaveBeenNthCalledWith(1, {
      excludeKeyPrefixes: ["__fbeast_agent_memory__/"],
      limit: 50,
    });
    expect(mockBrain.memoryReview.listProvenance).toHaveBeenNthCalledWith(2, {
      visibleKeyPrefixes: ["__fbeast_agent_memory__/alpha/"],
      includeUnprefixedKeys: true,
      unprefixedKeyPrefixExclusions: ["__fbeast_agent_memory__/"],
      limit: 50,
    });
  });

  it("fails closed for unsupported memory review actions at the adapter boundary", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");
    const mockBrain = brainInstances[0];

    await expect(brain.decideMemoryReview({
      id: "memcand_1",
      action: "never-store" as "never_store",
    })).rejects.toThrow("Unsupported memory review action: never-store");

    expect(mockBrain.memoryReview.neverStore).not.toHaveBeenCalled();
  });

  it("rejects unsupported memory type", async () => {
    const brain = createBrainAdapter("/tmp/beast.db");

    await expect(
      brain.store({ key: "k", value: "v", type: "recovery" as string }),
    ).rejects.toThrow(
      "Unsupported memory type: recovery. Supported types: working, episodic",
    );

    await expect(
      brain.query({ query: "any", type: "recovery" as string, limit: 10 }),
    ).rejects.toThrow(
      "Unsupported memory type: recovery. Supported types: working, episodic",
    );
  });
});
