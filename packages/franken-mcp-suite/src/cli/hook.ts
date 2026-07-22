#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createGovernorAdapter, type GovernorAdapter } from '../adapters/governor-adapter.js';
import { createObserverAdapter, type ObserverAdapter } from '../adapters/observer-adapter.js';

/** Env var carrying the governor context (policy-relevant command text). */
export const TOOL_CONTEXT_ENV = 'FBEAST_TOOL_CONTEXT';
export const TOOL_CONTEXT_FILE_ENV = 'FBEAST_TOOL_CONTEXT_FILE';
const CENTRAL_GOVERNANCE_SOURCE_KEY = '__fbeastGovernanceSource';
export const HOOK_GOVERNANCE_SOURCE_KEY = '__fbeastHookSource';
export const HOOK_GOVERNANCE_SOURCE = 'fbeast-hook';

export interface HookDeps {
  governor: GovernorAdapter;
  observer: ObserverAdapter;
  sessionId(): string;
  /**
   * Reads the governor context (policy-relevant command text). Untrusted payload
   * text is transported out-of-band from argv (via the FBEAST_TOOL_CONTEXT env
   * var) so it can never be parsed as a CLI flag. Reading from the environment
   * rather than stdin is also non-blocking.
   */
  readContext(): string;
  /**
   * Reads a streamed post-tool payload. Generated client hook scripts use stdin
   * for tool responses so large outputs never become argv/env exec payloads.
   */
  readPostToolPayload?(): Promise<string>;
}

export function defaultHookDeps(dbPath?: string, configPath?: string): HookDeps {
  const resolved = dbPath ?? join(process.cwd(), '.fbeast', 'beast.db');

  return {
    governor: createGovernorAdapter(resolved, configPath),
    observer: createObserverAdapter(resolved),
    sessionId: () =>
      process.env['FBEAST_SESSION_ID']
      ?? process.env['CLAUDE_SESSION_ID']
      ?? randomUUID(),
    readContext: () => {
      const contextFile = process.env[TOOL_CONTEXT_FILE_ENV];
      if (contextFile) {
        try {
          return readFileSync(contextFile, 'utf8');
        } catch {
          return '';
        }
      }
      return process.env[TOOL_CONTEXT_ENV] ?? '';
    },
  };
}

/**
 * Redact common inline credentials from the governor context before it is
 * checked (and persisted to `governor_log.context`). The governor only pattern-
 * matches destructive *verbs*, so stripping secret values never weakens
 * detection, but it keeps bearer tokens / passwords / API keys out of the audit
 * log. This is a proportionate, best-effort scrub — exhaustive secret detection
 * is intentionally out of scope.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/(authorization\s*:\s*(?:bearer|basic)\s+)\S+/gi, '$1[REDACTED]')
    .replace(/(\bbearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED]')
    .replace(/(\b(?:(?:[a-z0-9]+[_-])+(?:password|passwd|pwd|secret|token|key)|(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key))\b\s*[=:]\s*)("(?:\\.|[^"\\$`]|\$(?!\())*"|'[^']*'|(?:\\.|[^\s\\;&|<>()$`]|\$(?!\())+)/gi, '$1[REDACTED]')
    .replace(/(--(?:password|passwd|pwd|secret|token|api-?key|access-?key)\s+)("[^"]*"|'[^']*'|\S+)/gi, '$1[REDACTED]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@]+(@)/gi, '$1[REDACTED]$2');
}

async function readStdinPayload(): Promise<string> {
  if (process.stdin.isTTY) {
    return '';
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const MEMORY_RESULT_PAYLOAD_REDACTION_TOOLS = new Set([
  'fbeast_memory_store',
  'fbeast_memory_export',
  'fbeast_memory_access_audit_report',
  'fbeast_memory_retention_report',
  'fbeast_memory_review_propose',
  'fbeast_memory_review_list',
  'fbeast_memory_review_decide',
  'fbeast_memory_source_attribution',
  // Proxy mode reports the wrapper tool name to post-tool hooks and streams only
  // the tool response, so the resolved target tool is unavailable here. Redact
  // proxy response payloads rather than risking persistence of exported memory
  // or memory-review candidate values returned via execute_tool.
  'execute_tool',
]);

const MEMORY_RESULT_IMPLICIT_SUCCESS_TOOLS = new Set([
  'fbeast_memory_store',
  'fbeast_memory_query',
  'fbeast_memory_frontload',
  'fbeast_memory_export',
  'fbeast_memory_access_audit_report',
  'fbeast_memory_forget',
  'fbeast_memory_right_to_forget',
  'fbeast_memory_source_attribution',
  'fbeast_memory_review_propose',
  'fbeast_memory_retention_report',
  'fbeast_memory_review_list',
  'fbeast_memory_review_decide',
  'fbeast_memory_review_conflicts',
]);

const MEMORY_AUDIT_ARG_TOOLS = new Set([
  'fbeast_memory_store',
  'fbeast_memory_query',
  'fbeast_memory_frontload',
  'fbeast_memory_export',
  'fbeast_memory_access_audit_report',
  'fbeast_memory_right_to_forget',
  'fbeast_memory_forget',
  'fbeast_memory_source_attribution',
  'fbeast_memory_retention_report',
  'fbeast_memory_review_propose',
  'fbeast_memory_review_list',
  'fbeast_memory_review_decide',
  'fbeast_memory_review_conflicts',
]);

function unqualifyMcpToolName(toolName: string): string {
  const marker = '__';
  const index = toolName.lastIndexOf(marker);
  return index >= 0 ? toolName.slice(index + marker.length) : toolName;
}

function markHookGovernanceContext(context: string): string {
  try {
    const parsed = JSON.parse(context) as unknown;
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const sanitized = { ...(parsed as Record<string, unknown>) };
      delete sanitized[CENTRAL_GOVERNANCE_SOURCE_KEY];
      delete sanitized[HOOK_GOVERNANCE_SOURCE_KEY];
      return JSON.stringify({
        ...sanitized,
        [HOOK_GOVERNANCE_SOURCE_KEY]: HOOK_GOVERNANCE_SOURCE,
      });
    }
  } catch {
    // Non-JSON legacy hook contexts are still governed as raw command text so
    // policy regexes see executable whitespace such as tabs and newlines.
  }
  return context;
}

function parseJsonRecord(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function hookArgsFromContext(context: string, toolName: string): Record<string, unknown> | undefined {
  const parsed = parseJsonRecord(redactSecrets(context));
  if (!parsed) return undefined;
  const toolInput = parsed['tool_input'];
  if (toolInput !== null && typeof toolInput === 'object' && !Array.isArray(toolInput)) {
    const input = toolInput as Record<string, unknown>;
    const nestedTool = typeof input['tool'] === 'string' ? input['tool'] : toolName;
    const args = input['args'];
    const sanitized = args !== null && typeof args === 'object' && !Array.isArray(args)
      ? sanitizeHookAuditArgs(nestedTool, args as Record<string, unknown>)
      : sanitizeHookAuditArgs(nestedTool, input);
    if (!sanitized) return undefined;
    return unqualifyMcpToolName(toolName) === 'execute_tool'
      ? { tool: nestedTool, args: sanitized }
      : sanitized;
  }
  const args = parsed['args'];
  return args !== null && typeof args === 'object' && !Array.isArray(args)
    ? sanitizeHookAuditArgs(toolName, args as Record<string, unknown>)
    : sanitizeHookAuditArgs(toolName, parsed);
}

function sanitizeHookAuditArgs(toolName: string | undefined, args: Record<string, unknown>): Record<string, unknown> | undefined {
  const normalized = unqualifyMcpToolName(toolName ?? '');
  const mayBeMemory = normalized.startsWith('fbeast_memory_') || MEMORY_AUDIT_ARG_TOOLS.has(normalized) || 'agentId' in args || 'profile' in args || 'readScope' in args || 'type' in args;
  if (!mayBeMemory) return undefined;
  const safe: Record<string, unknown> = {};
  for (const key of ['agentId', 'profile', 'repo', 'type', 'operation', 'decision', 'readScope', 'limit', 'dryRun', 'redaction', 'activeProfile', 'crossProfile', 'action', 'resolution']) {
    if (Object.prototype.hasOwnProperty.call(args, key)) safe[key] = args[key];
  }
  for (const key of ['key', 'query', 'category', 'sourceScope', 'memoryKey']) {
    if (Object.prototype.hasOwnProperty.call(args, key)) safe[key] = '[memory-selector-redacted]';
  }
  return safe;
}

const HOOK_AUDIT_DECISIONS = new Set(['approved', 'denied', 'review_recommended', 'unknown_tool', 'validation_error', 'protected_mode', 'error']);

function effectiveHookAuditTool(toolName: string, hookArgs: Record<string, unknown> | undefined): string {
  const nestedTool = hookArgs && typeof hookArgs['tool'] === 'string' ? hookArgs['tool'] : undefined;
  return nestedTool ?? toolName;
}

function hookAuditOutcomeFromPayload(toolName: string, payload: string): { ok?: boolean; decision?: string } {
  const normalizedToolName = unqualifyMcpToolName(toolName);
  const parsed = parseJsonRecord(payload);
  if (!parsed) {
    return MEMORY_RESULT_IMPLICIT_SUCCESS_TOOLS.has(normalizedToolName) ? { ok: true } : {};
  }
  if (typeof parsed['ok'] === 'boolean') return { ok: parsed['ok'] };
  if (typeof parsed['isError'] === 'boolean') return { ok: !parsed['isError'] };
  if (typeof parsed['decision'] === 'string' && parsed['decision'].trim().length > 0) {
    const decision = parsed['decision'].trim();
    return { decision: HOOK_AUDIT_DECISIONS.has(decision) ? decision : 'unknown' };
  }
  if (MEMORY_RESULT_IMPLICIT_SUCCESS_TOOLS.has(normalizedToolName)) {
    return { ok: true };
  }
  return {};
}

function redactPostToolPayload(toolName: string, payload: string): string {
  if (!MEMORY_RESULT_PAYLOAD_REDACTION_TOOLS.has(unqualifyMcpToolName(toolName))) return payload;
  return '[memory-review-result-redacted]';
}

export async function runHook(
  argv: string[] = process.argv.slice(2),
  deps?: HookDeps,
): Promise<void> {
  // Extract --db flag before parsing positional args. A bare `--` terminates
  // option parsing so any following token (e.g. an untrusted tool name) is never
  // interpreted as a flag.
  let dbPath: string | undefined;
  let configPath: string | undefined;
  let streamPostToolPayload = false;
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg === '--db' && i + 1 < argv.length) {
      dbPath = argv[++i];
    } else if (arg.startsWith('--db=')) {
      dbPath = arg.slice(5);
    } else if (arg === '--config' && i + 1 < argv.length) {
      configPath = argv[++i];
    } else if (arg.startsWith('--config=')) {
      configPath = arg.slice('--config='.length);
    } else if (arg === '--stdin-payload') {
      streamPostToolPayload = true;
    } else {
      positionals.push(arg);
    }
  }

  const resolvedDeps = deps ?? defaultHookDeps(dbPath, configPath);
  const [phase, toolName = '', payload = ''] = positionals;

  if (phase === 'pre-tool') {
    // The governor context (command text) arrives via the FBEAST_TOOL_CONTEXT
    // env var, never argv, so it cannot be consumed as a flag. It is not
    // truncated; an over-limit command fails the exec and is denied (fail-closed).
    // Fall back to the positional payload for direct/legacy callers
    // (`fbeast-hook pre-tool <tool> <payload>`) so they keep governance coverage
    // when the env var is unset.
    // Redact inline credentials before the governor sees/logs the context.
    const context = markHookGovernanceContext(redactSecrets(resolvedDeps.readContext() || payload));
    const decision = await resolvedDeps.governor.check({ action: toolName, context });
    if (decision.decision !== 'approved') {
      process.stderr.write(`${decision.reason}\n`);
      process.exitCode = 1;
      return;
    }

    process.stdout.write(JSON.stringify({ allowed: true, decision: decision.decision }) + '\n');
    return;
  }

  if (phase === 'post-tool') {
    // Generated hook scripts pass --stdin-payload and stream large tool responses
    // on stdin instead of argv, avoiding ARG_MAX/E2BIG audit bypasses. Keep stdin
    // opt-in so direct/legacy callers that omit payload keep empty-payload behavior.
    const streamedPayload = payload === '' && streamPostToolPayload
      ? await (resolvedDeps.readPostToolPayload?.() ?? readStdinPayload())
      : '';
    const rawPostPayload = payload || streamedPayload;
    const hookArgs = hookArgsFromContext(resolvedDeps.readContext(), toolName);
    const auditToolName = effectiveHookAuditTool(toolName, hookArgs);
    const outcome = hookAuditOutcomeFromPayload(auditToolName, rawPostPayload);
    await resolvedDeps.observer.log({
      event: 'tool_call',
      metadata: JSON.stringify({
        __fbeastAuditTrailSource: HOOK_GOVERNANCE_SOURCE,
        [HOOK_GOVERNANCE_SOURCE_KEY]: HOOK_GOVERNANCE_SOURCE,
        toolName,
        ...(hookArgs ? { args: hookArgs } : {}),
        ...outcome,
        payload: redactPostToolPayload(toolName, rawPostPayload),
        phase,
      }),
      sessionId: resolvedDeps.sessionId(),
    });
    process.stdout.write(JSON.stringify({ logged: true }) + '\n');
    return;
  }

  if (phase !== 'pre-tool' && phase !== 'post-tool') {
    throw new Error('Usage: fbeast-hook <pre-tool|post-tool> ...');
  }
}

const isMain = (await import('../shared/is-main.js')).isMain(import.meta.url);
if (isMain) {
  runHook().catch((error) => {
    console.error('fbeast-hook failed:', error);
    process.exit(1);
  });
}
