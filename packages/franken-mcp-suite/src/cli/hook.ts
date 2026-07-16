#!/usr/bin/env node
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createGovernorAdapter, type GovernorAdapter } from '../adapters/governor-adapter.js';
import { createObserverAdapter, type ObserverAdapter } from '../adapters/observer-adapter.js';

/** Env var carrying the governor context (policy-relevant command text). */
export const TOOL_CONTEXT_ENV = 'FBEAST_TOOL_CONTEXT';

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

export function defaultHookDeps(dbPath?: string): HookDeps {
  const resolved = dbPath ?? join(process.cwd(), '.fbeast', 'beast.db');

  return {
    governor: createGovernorAdapter(resolved),
    observer: createObserverAdapter(resolved),
    sessionId: () =>
      process.env['FBEAST_SESSION_ID']
      ?? process.env['CLAUDE_SESSION_ID']
      ?? randomUUID(),
    readContext: () => process.env[TOOL_CONTEXT_ENV] ?? '',
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
    .replace(/(\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key)\b\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, '$1[REDACTED]')
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

const MEMORY_REVIEW_RESULT_TOOLS = new Set([
  'fbeast_memory_review_propose',
  'fbeast_memory_review_list',
  'fbeast_memory_review_decide',
  'fbeast_memory_source_attribution',
  // Proxy mode reports the wrapper tool name to post-tool hooks and streams only
  // the tool response, so the resolved target tool is unavailable here. Redact
  // proxy response payloads rather than risking persistence of memory-review
  // candidate values returned via execute_tool.
  'execute_tool',
]);

function unqualifyMcpToolName(toolName: string): string {
  const marker = '__';
  const index = toolName.lastIndexOf(marker);
  return index >= 0 ? toolName.slice(index + marker.length) : toolName;
}

function redactPostToolPayload(toolName: string, payload: string): string {
  if (!MEMORY_REVIEW_RESULT_TOOLS.has(unqualifyMcpToolName(toolName))) return payload;
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
    } else if (arg === '--stdin-payload') {
      streamPostToolPayload = true;
    } else {
      positionals.push(arg);
    }
  }

  const resolvedDeps = deps ?? defaultHookDeps(dbPath);
  const [phase, toolName = '', payload = ''] = positionals;

  if (phase === 'pre-tool') {
    // The governor context (command text) arrives via the FBEAST_TOOL_CONTEXT
    // env var, never argv, so it cannot be consumed as a flag. It is not
    // truncated; an over-limit command fails the exec and is denied (fail-closed).
    // Fall back to the positional payload for direct/legacy callers
    // (`fbeast-hook pre-tool <tool> <payload>`) so they keep governance coverage
    // when the env var is unset.
    // Redact inline credentials before the governor sees/logs the context.
    const context = redactSecrets(resolvedDeps.readContext() || payload);
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
    await resolvedDeps.observer.log({
      event: 'tool_call',
      metadata: JSON.stringify({ toolName, payload: redactPostToolPayload(toolName, rawPostPayload), phase }),
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
