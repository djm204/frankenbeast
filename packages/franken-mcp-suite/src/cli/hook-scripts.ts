/**
 * Generates client-specific hook shell scripts that bridge each client's
 * hook protocol to fbeast-hook's pre-tool/post-tool interface.
 */

import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

export interface HookScriptPaths {
  preTool: string;
  postTool: string;
}

/**
 * Writes hook scripts for the given client into a client-owned hooks directory.
 * Returns the paths to the generated scripts.
 */
export function writeHookScripts(root: string, client: 'claude' | 'gemini' | 'codex'): HookScriptPaths {
  const hooksDir = client === 'codex'
    ? join(root, '.codex', 'hooks')
    : join(root, '.fbeast', 'hooks');
  mkdirSync(hooksDir, { recursive: true });

  const dbPath = join(root, '.fbeast', 'beast.db');

  if (client === 'gemini') {
    return writeGeminiScripts(hooksDir, dbPath);
  }
  if (client === 'claude') {
    return writeClaudeScripts(hooksDir, dbPath);
  }
  return writeCodexScripts(hooksDir, dbPath);
}

// ─── Gemini ──────────────────────────────────────────────────────────────────
// BeforeTool: stdin JSON { tool_name, tool_input, ... }
// Deny:       stdout JSON { decision: "deny", reason: "..." }, exit 2
// AfterTool:  stdin JSON { tool_name, tool_response, ... }

function writeGeminiScripts(hooksDir: string, dbPath: string): HookScriptPaths {
  const preTool = join(hooksDir, 'gemini-before-tool.sh');
  const postTool = join(hooksDir, 'gemini-after-tool.sh');

  writeFileSync(preTool, `#!/usr/bin/env bash
# fbeast BeforeTool hook for Gemini CLI
# Reads tool call JSON from stdin, runs governor check, denies if blocked.
set -euo pipefail

if [ "\${FRANKENBEAST_SPAWNED:-}" = "1" ] || [ "\${FBEAST_DISABLE_HOOKS:-}" = "1" ]; then
  exit 0
fi

DB_PATH=${JSON.stringify(dbPath)}
HOOK_TIMEOUT_SECONDS="\${FBEAST_HOOK_TIMEOUT_SECONDS:-2}"

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | node --input-type=commonjs -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(String(d.tool_name??""))' 2>/dev/null || echo "")
# Extract only policy-relevant COMMAND text as governor context. It is passed to
# fbeast-hook via the FBEAST_TOOL_CONTEXT env var (never argv), so it cannot be
# parsed as a CLI flag. It is not truncated; an over-limit command fails the exec
# and is therefore denied (fail-closed) rather than silently dropping a dangerous
# suffix. Command-token arrays (args/argv) are flattened to a whitespace-joined
# string so patterns like 'rm -rf' still match. Path and file-content fields are
# excluded to avoid false positives and persisting secrets. apply_patch patch
# bodies (carried in tool_input.command) are also excluded for the same reason.
TOOL_CONTEXT=$(printf '%s' "$INPUT" | node --input-type=commonjs -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));const ti=d.tool_input??{};const tn=d.tool_name??"";const ks=["command","cmd","commands","args","argv","script"];let body="";if(typeof ti==="string"){body=ti;}else if(ti&&typeof ti==="object"&&!Array.isArray(ti)){body=ks.filter(k=>k in ti).map(k=>{const v=ti[k];return Array.isArray(v)?v.map(function(e){return typeof e==="string"?e:JSON.stringify(e);}).join(" "):typeof v==="string"?v:JSON.stringify(v);}).join(" ");}process.stdout.write(tn==="apply_patch"?"":body)' 2>/dev/null || echo "")

# Fail closed: a missing/unparseable tool name means we cannot govern the call.
if [ -z "$TOOL_NAME" ]; then
  printf '{"decision":"deny","reason":%s}\\n' '"fbeast governor: missing tool name (fail closed)"' >&1
  exit 2
fi

set +e
if command -v timeout >/dev/null 2>&1; then
  RESULT=$(FBEAST_TOOL_CONTEXT="$TOOL_CONTEXT" timeout "$HOOK_TIMEOUT_SECONDS" fbeast-hook pre-tool --db "$DB_PATH" -- "$TOOL_NAME" 2>&1)
  STATUS=$?
else
  RESULT=$(FBEAST_TOOL_CONTEXT="$TOOL_CONTEXT" fbeast-hook pre-tool --db "$DB_PATH" -- "$TOOL_NAME" 2>&1)
  STATUS=$?
fi
set -e

# Fail closed: any non-zero status denies the call. This includes governor
# denial, timeout (124), timeout-internal failure (125/126), kill (137), and
# missing binary (127). Fail-open is never the default for the enforcement path.
if [ "$STATUS" -ne 0 ]; then
  SAFE_RESULT=$(printf '%s' "$RESULT" | node --input-type=commonjs -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync(0,"utf8")))' 2>/dev/null || echo '"blocked by fbeast governor"')
  printf '{"decision":"deny","reason":%s}\\n' "$SAFE_RESULT" >&1
  exit 2
fi

exit 0
`);

  writeFileSync(postTool, `#!/usr/bin/env bash
# fbeast AfterTool hook for Gemini CLI
# Reads tool result JSON from stdin, records observer event.
set -euo pipefail

if [ "\${FRANKENBEAST_SPAWNED:-}" = "1" ] || [ "\${FBEAST_DISABLE_HOOKS:-}" = "1" ]; then
  exit 0
fi

DB_PATH=${JSON.stringify(dbPath)}
HOOK_TIMEOUT_SECONDS="\${FBEAST_HOOK_TIMEOUT_SECONDS:-2}"

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | node --input-type=commonjs -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(String(d.tool_name??""))' 2>/dev/null || echo "")
TOOL_RESPONSE=$(printf '%s' "$INPUT" | node --input-type=commonjs -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(JSON.stringify(d.tool_response??{}))' 2>/dev/null || echo "{}")

if command -v timeout >/dev/null 2>&1; then
  timeout "$HOOK_TIMEOUT_SECONDS" fbeast-hook post-tool --db "$DB_PATH" "$TOOL_NAME" "$TOOL_RESPONSE" >/dev/null 2>&1 || true
else
  fbeast-hook post-tool --db "$DB_PATH" "$TOOL_NAME" "$TOOL_RESPONSE" >/dev/null 2>&1 || true
fi
exit 0
`);

  chmodSync(preTool, 0o755);
  chmodSync(postTool, 0o755);
  return { preTool, postTool };
}

// ─── Claude Code ─────────────────────────────────────────────────────────────
// PreToolUse:  stdin JSON { tool_name, tool_input, session_id, ... }
// Deny:        reason written to stderr, exit 2 (Claude Code shows stderr to user)
// PostToolUse: stdin JSON { tool_name, tool_response, ... }

function writeClaudeScripts(hooksDir: string, dbPath: string): HookScriptPaths {
  const preTool = join(hooksDir, 'fbeast-claude-pre-tool.sh');
  const postTool = join(hooksDir, 'fbeast-claude-post-tool.sh');

  writeFileSync(preTool, `#!/usr/bin/env bash
# fbeast PreToolUse hook for Claude Code
# Reads tool call JSON from stdin, runs governor check, denies if blocked.
set -euo pipefail

if [ "\${FRANKENBEAST_SPAWNED:-}" = "1" ] || [ "\${FBEAST_DISABLE_HOOKS:-}" = "1" ]; then
  exit 0
fi

DB_PATH=${JSON.stringify(dbPath)}
HOOK_TIMEOUT_SECONDS="\${FBEAST_HOOK_TIMEOUT_SECONDS:-2}"

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | node --input-type=commonjs -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(String(d.tool_name??""))' 2>/dev/null || echo "")
# Extract only policy-relevant COMMAND text as governor context. It is passed to
# fbeast-hook via the FBEAST_TOOL_CONTEXT env var (never argv), so it cannot be
# parsed as a CLI flag. It is not truncated; an over-limit command fails the exec
# and is therefore denied (fail-closed) rather than silently dropping a dangerous
# suffix. Command-token arrays (args/argv) are flattened to a whitespace-joined
# string so patterns like 'rm -rf' still match. Path and file-content fields are
# excluded to avoid false positives and persisting secrets. apply_patch patch
# bodies (carried in tool_input.command) are also excluded for the same reason.
TOOL_CONTEXT=$(printf '%s' "$INPUT" | node --input-type=commonjs -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));const ti=d.tool_input??{};const tn=d.tool_name??"";const ks=["command","cmd","commands","args","argv","script"];let body="";if(typeof ti==="string"){body=ti;}else if(ti&&typeof ti==="object"&&!Array.isArray(ti)){body=ks.filter(k=>k in ti).map(k=>{const v=ti[k];return Array.isArray(v)?v.map(function(e){return typeof e==="string"?e:JSON.stringify(e);}).join(" "):typeof v==="string"?v:JSON.stringify(v);}).join(" ");}process.stdout.write(tn==="apply_patch"?"":body)' 2>/dev/null || echo "")

# Fail closed: a missing/unparseable tool name means we cannot govern the call.
if [ -z "$TOOL_NAME" ]; then
  printf 'fbeast governor blocked: %s\n' "missing tool name (fail closed)" >&2
  exit 2
fi

set +e
if command -v timeout >/dev/null 2>&1; then
  RESULT=$(FBEAST_TOOL_CONTEXT="$TOOL_CONTEXT" timeout "$HOOK_TIMEOUT_SECONDS" fbeast-hook pre-tool --db "$DB_PATH" -- "$TOOL_NAME" 2>&1)
  STATUS=$?
else
  RESULT=$(FBEAST_TOOL_CONTEXT="$TOOL_CONTEXT" fbeast-hook pre-tool --db "$DB_PATH" -- "$TOOL_NAME" 2>&1)
  STATUS=$?
fi
set -e

# Fail closed: any non-zero status denies the call. This includes governor
# denial, timeout (124), timeout-internal failure (125/126), kill (137), and
# missing binary (127). Fail-open is never the default for the enforcement path.
if [ "$STATUS" -ne 0 ]; then
  printf 'fbeast governor blocked: %s\n' "$RESULT" >&2
  exit 2
fi

exit 0
`);

  writeFileSync(postTool, `#!/usr/bin/env bash
# fbeast PostToolUse hook for Claude Code
# Reads tool result JSON from stdin, records observer event.
set -euo pipefail

if [ "\${FRANKENBEAST_SPAWNED:-}" = "1" ] || [ "\${FBEAST_DISABLE_HOOKS:-}" = "1" ]; then
  exit 0
fi

DB_PATH=${JSON.stringify(dbPath)}
HOOK_TIMEOUT_SECONDS="\${FBEAST_HOOK_TIMEOUT_SECONDS:-2}"

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | node --input-type=commonjs -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(String(d.tool_name??""))' 2>/dev/null || echo "")
TOOL_RESPONSE=$(printf '%s' "$INPUT" | node --input-type=commonjs -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(JSON.stringify(d.tool_response??{}))' 2>/dev/null || echo "{}")

if command -v timeout >/dev/null 2>&1; then
  timeout "$HOOK_TIMEOUT_SECONDS" fbeast-hook post-tool --db "$DB_PATH" "$TOOL_NAME" "$TOOL_RESPONSE" >/dev/null 2>&1 || true
else
  fbeast-hook post-tool --db "$DB_PATH" "$TOOL_NAME" "$TOOL_RESPONSE" >/dev/null 2>&1 || true
fi
exit 0
`);

  chmodSync(preTool, 0o755);
  chmodSync(postTool, 0o755);
  return { preTool, postTool };
}

// ─── Codex ───────────────────────────────────────────────────────────────────
// PreToolUse:  stdin JSON { tool_name, tool_input, session_id, ... }
// Deny:        stdout JSON { hookSpecificOutput: { permissionDecision: "deny", ... } }, exit 2
// PostToolUse: stdin JSON { tool_name, tool_response, ... }

function writeCodexScripts(hooksDir: string, dbPath: string): HookScriptPaths {
  const preTool = join(hooksDir, 'fbeast-codex-pre-tool.sh');
  const postTool = join(hooksDir, 'fbeast-codex-post-tool.sh');

  writeFileSync(preTool, `#!/usr/bin/env bash
# fbeast PreToolUse hook for Codex CLI
# Reads tool call JSON from stdin, runs governor check, denies if blocked.
set -euo pipefail

if [ "\${FRANKENBEAST_SPAWNED:-}" = "1" ] || [ "\${FBEAST_DISABLE_HOOKS:-}" = "1" ]; then
  exit 0
fi

DB_PATH=${JSON.stringify(dbPath)}
HOOK_TIMEOUT_SECONDS="\${FBEAST_HOOK_TIMEOUT_SECONDS:-2}"

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | node --input-type=commonjs -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(String(d.tool_name??""))' 2>/dev/null || echo "")
# Extract only policy-relevant COMMAND text as governor context. It is passed to
# fbeast-hook via the FBEAST_TOOL_CONTEXT env var (never argv), so it cannot be
# parsed as a CLI flag. It is not truncated; an over-limit command fails the exec
# and is therefore denied (fail-closed) rather than silently dropping a dangerous
# suffix. Command-token arrays (args/argv) are flattened to a whitespace-joined
# string so patterns like 'rm -rf' still match. Path and file-content fields are
# excluded to avoid false positives and persisting secrets. apply_patch patch
# bodies (carried in tool_input.command) are also excluded for the same reason.
TOOL_CONTEXT=$(printf '%s' "$INPUT" | node --input-type=commonjs -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));const ti=d.tool_input??{};const tn=d.tool_name??"";const ks=["command","cmd","commands","args","argv","script"];let body="";if(typeof ti==="string"){body=ti;}else if(ti&&typeof ti==="object"&&!Array.isArray(ti)){body=ks.filter(k=>k in ti).map(k=>{const v=ti[k];return Array.isArray(v)?v.map(function(e){return typeof e==="string"?e:JSON.stringify(e);}).join(" "):typeof v==="string"?v:JSON.stringify(v);}).join(" ");}process.stdout.write(tn==="apply_patch"?"":body)' 2>/dev/null || echo "")

# Fail closed: a missing/unparseable tool name means we cannot govern the call.
if [ -z "$TOOL_NAME" ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":%s}}\\n' '"fbeast governor: missing tool name (fail closed)"' >&1
  exit 2
fi

set +e
if command -v timeout >/dev/null 2>&1; then
  RESULT=$(FBEAST_TOOL_CONTEXT="$TOOL_CONTEXT" timeout "$HOOK_TIMEOUT_SECONDS" fbeast-hook pre-tool --db "$DB_PATH" -- "$TOOL_NAME" 2>&1)
  STATUS=$?
else
  RESULT=$(FBEAST_TOOL_CONTEXT="$TOOL_CONTEXT" fbeast-hook pre-tool --db "$DB_PATH" -- "$TOOL_NAME" 2>&1)
  STATUS=$?
fi
set -e

# Fail closed: any non-zero status denies the call. This includes governor
# denial, timeout (124), timeout-internal failure (125/126), kill (137), and
# missing binary (127). Fail-open is never the default for the enforcement path.
if [ "$STATUS" -ne 0 ]; then
  SAFE_REASON=$(printf '%s' "$RESULT" | node --input-type=commonjs -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync(0,"utf8")))' 2>/dev/null || echo '"blocked by fbeast governor"')
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":%s}}\\n' "$SAFE_REASON" >&1
  exit 2
fi

exit 0
`);

  writeFileSync(postTool, `#!/usr/bin/env bash
# fbeast PostToolUse hook for Codex CLI
# Reads tool result JSON from stdin, records observer event.
set -euo pipefail

if [ "\${FRANKENBEAST_SPAWNED:-}" = "1" ] || [ "\${FBEAST_DISABLE_HOOKS:-}" = "1" ]; then
  exit 0
fi

DB_PATH=${JSON.stringify(dbPath)}
HOOK_TIMEOUT_SECONDS="\${FBEAST_HOOK_TIMEOUT_SECONDS:-2}"

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | node --input-type=commonjs -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(String(d.tool_name??""))' 2>/dev/null || echo "")
TOOL_RESPONSE=$(printf '%s' "$INPUT" | node --input-type=commonjs -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(JSON.stringify(d.tool_response??{}))' 2>/dev/null || echo "{}")

if command -v timeout >/dev/null 2>&1; then
  timeout "$HOOK_TIMEOUT_SECONDS" fbeast-hook post-tool --db "$DB_PATH" "$TOOL_NAME" "$TOOL_RESPONSE" >/dev/null 2>&1 || true
else
  fbeast-hook post-tool --db "$DB_PATH" "$TOOL_NAME" "$TOOL_RESPONSE" >/dev/null 2>&1 || true
fi
exit 0
`);

  chmodSync(preTool, 0o755);
  chmodSync(postTool, 0o755);
  return { preTool, postTool };
}
