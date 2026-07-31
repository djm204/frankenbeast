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
const SENSITIVE_ASSIGNMENT_KEY = /^(?:(?:[a-z0-9]+[_-])+(?:authorization|password|passwd|pwd|secret|token|key|cookie|credentials?|passphrase|access[_-]?key[_-]?id)|(?:authorization|password|passwd|pwd|secret|token|cookie|credentials?|passphrase|api[_-]?key|client[_-]?secret|(?:access|refresh|id)[_-]?token|access[_-]?key(?:[_-]?id)?))$/i;
const RAW_SECRET_HINTS = [
  'authorization',
  'bearer',
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'api_key',
  'api-key',
  'apikey',
  'access_key',
  'access-key',
  'accesskey',
  'cookie',
  'credential',
  'passphrase',
  '_key',
  '-key',
] as const;
const CREDENTIAL_URL_HINT = /\b[a-z][a-z0-9+.-]{0,31}:\/\/[^\s:/@]+:[^\s@/]+@/i;
const CAMEL_CASE_SECRET_KEY_HINT = /[A-Za-z0-9](?:Authorization|Password|Passwd|Pwd|Secret|Token|Key|Cookie|Credentials?|Passphrase)\b/;
const MAX_POST_TOOL_SECRET_SCAN_CHARS = 64 * 1024;

/**
 * Value-shape patterns for common credential formats (GitHub PATs, OpenAI/
 * Anthropic/Stripe-style `sk-`/`pk-`/`rk-` keys, GitLab/Slack tokens, AWS access
 * key IDs, Google API keys). Unlike the redaction rules above, these match on
 * the *value itself* rather than a nearby key label, so they catch secrets
 * embedded under an innocuous key (e.g. `{"result": "ghp_..."}`) or in
 * free-form text with no `token=`/`key:` hint at all. Mirrors the value-shape
 * patterns already used for memory export redaction in `brain-adapter.ts`
 * (`SECRET_EXPORT_VALUES`) so the two redaction paths agree on what counts as
 * a secret-shaped value.
 *
 * A trailing `(?![0-9A-Za-z_-])` guard is used instead of `\b` wherever the
 * value's own charset includes `-`/`_`: `\b` requires a word/non-word
 * transition, so it silently fails to match when a legitimately
 * hyphen/underscore-terminated key (e.g. a Google API key ending in `-`) is
 * itself followed by a non-word character such as `"` or whitespace — both
 * sides are then non-word and no boundary exists, leaving the key unredacted.
 *
 * PEM private-key blocks are handled separately, below, via a linear scan
 * rather than a regex here — see `redactPemPrivateKeyBlocks` /
 * `containsPemPrivateKeyBlock`.
 *
 * The sk-/pk-/rk- pattern requires a 20+ char suffix (real OpenAI/Anthropic/
 * Stripe-style keys are typically 40-100+ chars) rather than the 8-char floor
 * the other patterns use, because "sk-"/"pk-"/"rk-" are common 2-letter
 * prefixes that legitimate short structured identifiers can coincidentally
 * start with (e.g. an `agentId` of "sk-platform"). Those identifiers flow
 * through this same value-shape check via `redactSecrets` on the pre-tool
 * governor context (`hookArgsFromContext`), and audit tooling elsewhere
 * (`brain-adapter.ts`) filters on their *exact* value, so over-redacting one
 * silently breaks that attribution — a higher floor for this specific prefix
 * trades a little recall on unusually short real keys (none of the vendors
 * above issue keys that short) for not corrupting unrelated identifiers.
 */
const KNOWN_SECRET_VALUE_PATTERNS: RegExp[] = [
  /\b(?:sk|pk|rk)-[A-Za-z0-9][A-Za-z0-9_-]{19,}(?![A-Za-z0-9_-])/g,
  /\b(?:sk|gh[opusr])_[A-Za-z0-9_]{8,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{8,}\b/g,
  /\b(?:gho|ghp|glpat|xox[baprs])-[A-Za-z0-9_-]{12,}(?![A-Za-z0-9_-])/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}(?![A-Za-z0-9_-])/g,
];

const PEM_MARKER_WINDOW = /^-----(?:BEGIN|END) [A-Z0-9 ]{0,32}PRIVATE KEY-----/;

/**
 * Finds the end index of a "-----BEGIN|END ...PRIVATE KEY-----" marker
 * starting exactly at `start`, bounded to a short fixed-size lookahead window
 * so matching never scans a span of text proportional to the overall input.
 */
function pemMarkerEnd(text: string, start: number): number {
  const window = text.slice(start, start + 60);
  const match = PEM_MARKER_WINDOW.exec(window);
  return match ? start + match[0].length : -1;
}

/**
 * Linear-time (single forward pass) detection of a PEM private-key block.
 *
 * The straightforward regex for this, `-----BEGIN...[\s\S]*?...END-----`, is
 * quadratic on adversarial input: when a `-----BEGIN ... PRIVATE KEY-----`
 * marker has no matching END anywhere in the text, the lazy `[\s\S]*?` scans
 * all the way to the end of the string before failing, and a global regex
 * then repeats that full scan from every subsequent BEGIN marker. A payload
 * with many BEGIN markers and no END markers turns an O(n) check into O(n²) —
 * a real DoS risk, since this runs on the unbounded oversized-payload fast
 * path before observer logging (`containsOversizedSecretIndicator`).
 *
 * This scans forward with `indexOf` instead: once a header has no footer
 * anywhere after it, `indexOf` has already scanned to the end of the text
 * exactly once, and we stop immediately rather than repeating that scan for
 * every remaining header — bounding total work to O(n).
 *
 * A block can contain an unrelated "-----END X-----" marker before its real
 * footer (e.g. a certificate embedded between a PRIVATE KEY header and
 * footer). `findPemFooter` keeps advancing past each non-matching "-----END "
 * occurrence in an inner loop rather than falling back out to the outer
 * header search — abandoning the header there would orphan it and miss the
 * real footer that follows. The inner loop still only ever moves forward, so
 * this stays O(n) overall: once no valid footer exists anywhere in the rest
 * of the text (for *any* candidate footer position), none of the remaining
 * text can contain one for a later header either, so both callers return/stop
 * immediately instead of continuing to search.
 */
function findPemFooter(text: string, searchFrom: number): number {
  let cursor = searchFrom;
  for (;;) {
    const footerIdx = text.indexOf('-----END ', cursor);
    if (footerIdx === -1) return -1;
    const footerEnd = pemMarkerEnd(text, footerIdx);
    if (footerEnd !== -1) return footerEnd;
    cursor = footerIdx + 9;
  }
}

function containsPemPrivateKeyBlock(text: string): boolean {
  if (!text.includes('PRIVATE KEY-----')) return false;
  let cursor = 0;
  for (;;) {
    const headerIdx = text.indexOf('-----BEGIN ', cursor);
    if (headerIdx === -1) return false;
    const headerEnd = pemMarkerEnd(text, headerIdx);
    if (headerEnd === -1) {
      cursor = headerIdx + 11;
      continue;
    }
    if (findPemFooter(text, headerEnd) === -1) return false;
    return true;
  }
}

/** Redacting counterpart of `containsPemPrivateKeyBlock`; same linear-scan shape. */
function redactPemPrivateKeyBlocks(text: string): string {
  if (!text.includes('PRIVATE KEY-----')) return text;
  let result = '';
  let cursor = 0;
  for (;;) {
    const headerIdx = text.indexOf('-----BEGIN ', cursor);
    if (headerIdx === -1) break;
    const headerEnd = pemMarkerEnd(text, headerIdx);
    if (headerEnd === -1) {
      result += text.slice(cursor, headerIdx + 11);
      cursor = headerIdx + 11;
      continue;
    }
    const footerEnd = findPemFooter(text, headerEnd);
    if (footerEnd === -1) break;
    result += text.slice(cursor, headerIdx) + '[REDACTED]';
    cursor = footerEnd;
  }
  result += text.slice(cursor);
  return result;
}

function containsKnownSecretPattern(text: string): boolean {
  return containsPemPrivateKeyBlock(text)
    || KNOWN_SECRET_VALUE_PATTERNS.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(text);
    });
}

function redactKnownSecretValues(text: string): string {
  let redacted = redactPemPrivateKeyBlocks(text);
  for (const pattern of KNOWN_SECRET_VALUE_PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

function containsRawSecretHint(text: string): boolean {
  const lowerText = text.toLowerCase();
  return RAW_SECRET_HINTS.some((hint) => lowerText.includes(hint))
    || CAMEL_CASE_SECRET_KEY_HINT.test(text)
    || CREDENTIAL_URL_HINT.test(text);
}

// Defensive cap on the number of JSON.parse tree nodes the oversized-payload
// scan below will visit. A legitimate tool payload will not nest this deeply
// or this wide; this exists purely to bound worst-case work (proportional to
// node count, itself bounded by text length) rather than to reject anything
// real.
const MAX_OVERSIZED_JSON_SCAN_NODES = 200_000;

/**
 * Walks a JSON.parse()'d value looking for a secret-shaped string, either as
 * a leaf value or (mirroring the JSON-property-name fix in redactJsonSecrets)
 * as an object key. Iterative (explicit stack) rather than recursive so a
 * maliciously deep payload can't blow the call stack.
 */
function containsSecretInParsedJson(root: unknown): boolean {
  const stack: unknown[] = [root];
  let visited = 0;
  while (stack.length > 0) {
    if (++visited > MAX_OVERSIZED_JSON_SCAN_NODES) return false;
    const value = stack.pop();
    if (typeof value === 'string') {
      if (containsKnownSecretPattern(value)) return true;
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) stack.push(item);
      continue;
    }
    if (value !== null && typeof value === 'object') {
      for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
        if (containsKnownSecretPattern(entryKey)) return true;
        stack.push(entryValue);
      }
    }
  }
  return false;
}

/**
 * For oversized payloads, `containsOversizedSecretIndicator` otherwise only
 * pattern-matches the raw source text. A credential can be written with valid
 * JSON string escapes (e.g. `"ghp_aa..."`), which decode to the
 * secret's real characters but contain no contiguous alphanumeric run in the
 * raw source — so it matches none of `KNOWN_SECRET_VALUE_PATTERNS` and, with
 * no key-label hint either, evades detection entirely and the whole payload
 * is persisted. Attempting `JSON.parse` here and scanning the *decoded*
 * string values closes that gap; parse failures (non-JSON oversized payloads,
 * the majority case — plain tool output) just fall through to the existing
 * raw-text heuristics below, unchanged. `JSON.parse` and the node-count-bounded
 * walk above are both O(n) in the payload size, so this preserves the linear
 * cost this fast path exists to guarantee.
 */
function containsOversizedJsonEscapedSecret(text: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  return containsSecretInParsedJson(parsed);
}

function containsOversizedSecretIndicator(text: string): boolean {
  if (/\bauthorization\b\s*[:=]/i.test(text)
    || /\\*["']authorization\\*["']\s*,/i.test(text)
    || /\bbearer\s+\S+/i.test(text)
    || /--(?:authorization|password|passwd|pwd|secret|token|cookie|credentials|passphrase|api-?key|client-?secret|(?:access|refresh|id)-?token|access-?key)\s+\S+/i.test(text)
    || CREDENTIAL_URL_HINT.test(text)
    || containsKnownSecretPattern(text)
    || containsOversizedJsonEscapedSecret(text)) {
    return true;
  }

  const assignmentPattern = /\\*["']?\b([A-Za-z][A-Za-z0-9_-]{0,127})\b\\*["']?\s*[=:]/g;
  for (const match of text.matchAll(assignmentPattern)) {
    if (isSensitiveAssignmentKey(match[1]!)) return true;
  }
  const tupleKeyPattern = /\\*["']([A-Za-z][A-Za-z0-9_-]{0,127})\\*["']\s*,/g;
  for (const match of text.matchAll(tupleKeyPattern)) {
    if (isSensitiveAssignmentKey(match[1]!)) return true;
  }

  const pairLabelPattern = /\\*["'](?:name|key)\\*["']\s*:\s*\\*["']([A-Za-z][A-Za-z0-9_-]{0,127})\\*["']/gi;
  for (const match of text.matchAll(pairLabelPattern)) {
    if (isSensitiveAssignmentKey(match[1]!)) return true;
  }
  return false;
}

function redactRawSecrets(rawText: string, preserveShellCommands = false): string {
  const text = redactKnownSecretValues(rawText);
  if (!containsRawSecretHint(text)) return text;
  let redacted = text
    .replace(/(authorization\s*:\s*)("(?:\\.|[^"\\$`]|\$(?!\())*"|'(?:\\.|[^'\\$`]|\$(?!\())*')/gi, '$1[REDACTED]')
    .replace(/(\bauthorization\b\s*=\s*)("(?:\\.|[^"\\$`]|\$(?!\())*"|'[^']*')/gi, '$1[REDACTED]');

  redacted = preserveShellCommands
    ? redacted
      .replace(/(authorization\s*:\s*)(?:\$(?!\()|[^$\r\n;&|<>`"'])+/gi, '$1[REDACTED]')
      .replace(/(\bauthorization\b\s*=\s*)[^\s\r\n;&|<>`$"']+/gi, '$1[REDACTED]')
    : redacted
      .replace(/(authorization\s*:\s*)[\s\S]*?(?=(?<!\\)"\s*[,}]|\r?\n|$)/gi, '$1[REDACTED]')
      .replace(/(\bcookie\s*:\s*)[\s\S]*?(?=(?<!\\)"\s*[,}]|\r?\n|$)/gi, '$1[REDACTED]')
      .replace(/(\b[A-Za-z][A-Za-z0-9]{0,127}Authorization\s*=\s*)(?:Basic|Bearer|Token)\s+\S+/gi, '$1[REDACTED]')
      .replace(/(\bauthorization\b\s*=\s*)AWS4-HMAC-SHA256(?:\s+(?:Credential|SignedHeaders|Signature)=[^\s\r\n&|<>`$]+)+/gi, '$1[REDACTED]')
      .replace(/(\bauthorization\b\s*=\s*)(?:[A-Za-z][A-Za-z0-9_-]*(?:\s+(?![A-Za-z][A-Za-z0-9_-]{0,127}\s*=(?!=))[A-Za-z0-9._~+/-]+=*)+|[A-Za-z0-9._~+/-]+=*)/gi, '$1[REDACTED]');

  return redacted
    .replace(/(\bbearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED]')
    .replace(/(\b[A-Za-z][A-Za-z0-9]{0,127}(?:Authorization|Password|Passwd|Pwd|Secret|Token|Key|Cookie|Credentials?|Passphrase)\b["']?\s*[=:]\s*)("(?:\\.|[^"\\$`]|\$(?!\())*"|'[^']*'|(?:\\.|\([^()\s]*\)|[^\s\\;&|<>()$`]|\$(?!\())+)/g, '$1[REDACTED]')
    .replace(/(\b(?:(?:[a-z0-9]+[_-])+(?:password|passwd|pwd|secret|token|key|cookie|credentials?|passphrase|access[_-]?key[_-]?id)|(?:password|passwd|pwd|secret|token|cookie|credentials?|passphrase|api[_-]?key|client[_-]?secret|(?:access|refresh|id)[_-]?token|access[_-]?key(?:[_-]?id)?))\b["']?\s*[=:]\s*)("(?:\\.|[^"\\$`]|\$(?!\())*"|'[^']*'|(?:\\.|\([^()\s]*\)|[^\s\\;&|<>()$`]|\$(?!\())+)/gi, '$1[REDACTED]')
    .replace(
      /(--([A-Za-z][A-Za-z0-9-]{0,127})\s+)("(?:\\.|[^"])*"|'[^']*'|(?:Basic|Bearer|Token)\s+\S+|\S+)/gi,
      (match, prefix: string, flagName: string) => isSensitiveAssignmentKey(flagName)
        ? `${prefix}[REDACTED]`
        : match,
    )
    .replace(/(\b[a-z][a-z0-9+.-]{0,31}:\/\/[^\s:/@]+:)[^\s@/]+(@)/gi, '$1[REDACTED]$2');
}

function isSensitiveAssignmentKey(key: string): boolean {
  const separatorNormalized = key
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  return SENSITIVE_ASSIGNMENT_KEY.test(separatorNormalized);
}

function redactJsonSecrets(value: unknown, state: { changed: boolean }, key?: string, preserveShellCommands = false): unknown {
  if (key && isSensitiveAssignmentKey(key)) {
    if (value !== '[REDACTED]') state.changed = true;
    return '[REDACTED]';
  }
  if (typeof value === 'string') {
    const redacted = redactSecrets(value, preserveShellCommands);
    if (redacted !== value) state.changed = true;
    return redacted;
  }
  if (Array.isArray(value)) {
    if (value.length === 2 && typeof value[0] === 'string' && isSensitiveAssignmentKey(value[0])) {
      return [value[0], redactJsonSecrets(value[1], state, value[0], preserveShellCommands)];
    }
    return value.map((item) => redactJsonSecrets(item, state, undefined, preserveShellCommands));
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const pairName = [record.name, record.key]
      .find((candidate): candidate is string => typeof candidate === 'string' && isSensitiveAssignmentKey(candidate));
    return Object.fromEntries(
      Object.entries(record)
        .map(([entryKey, entryValue]) => {
          // The key label allowlist above (isSensitiveAssignmentKey) only
          // catches secrets carried in a *value* under a recognized key name.
          // A credential can also be used as the property name itself, e.g.
          // `{"ghp_...": "active"}` — that literal key is otherwise never
          // passed through any redaction pass and would survive untouched in
          // the reconstructed object (independent of whatever the value is).
          const redactedKey = containsKnownSecretPattern(entryKey)
            ? redactKnownSecretValues(entryKey)
            : entryKey;
          if (redactedKey !== entryKey) state.changed = true;
          return [
            redactedKey,
            redactJsonSecrets(
              entryValue,
              state,
              entryKey === 'value' && pairName ? pairName : entryKey,
              preserveShellCommands,
            ),
          ];
        }),
    );
  }
  return value;
}

export function redactSecrets(text: string, preserveShellCommands = false): string {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === 'string') {
      const redacted = redactSecrets(parsed, preserveShellCommands);
      if (redacted !== parsed) return JSON.stringify(redacted);
    }
    if (parsed !== null && typeof parsed === 'object') {
      const state = { changed: false };
      const redacted = redactJsonSecrets(parsed, state, undefined, preserveShellCommands);
      if (state.changed) return JSON.stringify(redacted);
      return redactRawSecrets(text, preserveShellCommands);
    }
  } catch {
    // Legacy command contexts are plain text, not JSON.
  }
  return redactRawSecrets(text, preserveShellCommands);
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
  if (MEMORY_RESULT_PAYLOAD_REDACTION_TOOLS.has(unqualifyMcpToolName(toolName))) {
    return '[memory-review-result-redacted]';
  }
  if (payload.length > MAX_POST_TOOL_SECRET_SCAN_CHARS) {
    return containsOversizedSecretIndicator(payload) ? '[post-tool-payload-redacted]' : payload;
  }
  return redactSecrets(payload);
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
    const context = markHookGovernanceContext(redactSecrets(resolvedDeps.readContext() || payload, true));
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

/** Upper bound on how much of a redacted error message is ever logged. */
const MAX_HOOK_FAILURE_SUMMARY_CHARS = 500;

/**
 * Generic net for credential-shaped substrings that the named-pattern
 * redaction in `redactSecrets`/`redactRawSecrets` does not recognize —
 * e.g. presigned-URL query params (`X-Amz-Signature=...`), OAuth
 * `code=...` exchanges, or a bare high-entropy token/JWT with no
 * recognizable key name at all. `redactSecrets` is a best-effort,
 * named-pattern redactor; it can leave an unrecognized credential shape
 * completely untouched. This scan runs on text that has ALREADY been
 * through `redactSecrets`, so a match here means redaction could not
 * confirm the text is safe to log.
 */
const GENERIC_QUERY_CREDENTIAL_PATTERN = /[?&]?[A-Za-z][A-Za-z0-9_.-]*=[A-Za-z0-9%_.~+/-]{12,}/;
const GENERIC_HIGH_ENTROPY_TOKEN_PATTERN = /\b(?:[A-Za-z0-9_-]{24,}|[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{10,})\b/;

function mayContainUnredactedCredential(text: string): boolean {
  return GENERIC_QUERY_CREDENTIAL_PATTERN.test(text) || GENERIC_HIGH_ENTROPY_TOKEN_PATTERN.test(text);
}

/**
 * Summarizes a rejected value for the entrypoint failure log. Hook failures
 * can wrap arbitrary tool/provider payloads, so only a genuine `Error`'s
 * `message` is ever considered — never its `stack`, and never an arbitrary
 * rejected object/value, which could carry raw provider or tool output.
 *
 * The message is run through `redactSecrets` first, but that redaction is
 * necessarily best-effort (named patterns only). Since this is a
 * safety-critical logging path with no way to verify every possible
 * credential shape has been stripped, the default on any residual
 * uncertainty is to suppress the message entirely rather than risk
 * printing a partially-redacted secret ("when in doubt, suppress").
 */
function summarizeHookFailure(error: unknown): string | undefined {
  if (!(error instanceof Error) || typeof error.message !== 'string' || error.message.length === 0) {
    return undefined;
  }
  const redacted = redactSecrets(error.message);
  if (mayContainUnredactedCredential(redacted)) {
    return undefined;
  }
  return redacted.length > MAX_HOOK_FAILURE_SUMMARY_CHARS
    ? `${redacted.slice(0, MAX_HOOK_FAILURE_SUMMARY_CHARS)}…`
    : redacted;
}

const isMain = (await import('../shared/is-main.js')).isMain(import.meta.url);
if (isMain) {
  runHook().catch((error) => {
    const summary = summarizeHookFailure(error);
    console.error(summary ? `fbeast-hook failed: ${summary}` : 'fbeast-hook failed');
    process.exit(1);
  });
}
