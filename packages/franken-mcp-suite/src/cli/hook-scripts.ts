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
export function writeHookScripts(root: string, client: 'gemini' | 'codex'): HookScriptPaths {
  const hooksDir = client === 'codex'
    ? join(root, '.codex', 'hooks')
    : join(root, '.fbeast', 'hooks');
  mkdirSync(hooksDir, { recursive: true });

  const dbPath = join(root, '.fbeast', 'beast.db');

  if (client === 'gemini') {
    return writeGeminiScripts(hooksDir, dbPath);
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

DB_PATH=${JSON.stringify(dbPath)}

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null || echo "")

if [ -z "$TOOL_NAME" ]; then
  exit 0
fi

if ! RESULT=$(fbeast-hook pre-tool --db "$DB_PATH" "$TOOL_NAME" 2>&1); then
  SAFE_RESULT=$(printf '%s' "$RESULT" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo '"blocked by fbeast governor"')
  printf '{"decision":"deny","reason":%s}\\n' "$SAFE_RESULT" >&1
  exit 2
fi

exit 0
`);

  writeFileSync(postTool, `#!/usr/bin/env bash
# fbeast AfterTool hook for Gemini CLI
# Reads tool result JSON from stdin, records observer event.
set -euo pipefail

DB_PATH=${JSON.stringify(dbPath)}

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null || echo "")
TOOL_RESPONSE=$(printf '%s' "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d.get('tool_response',{})))" 2>/dev/null || echo "{}")

fbeast-hook post-tool --db "$DB_PATH" "$TOOL_NAME" "$TOOL_RESPONSE" >/dev/null 2>&1 || true
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

DB_PATH=${JSON.stringify(dbPath)}

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null || echo "")

if [ -z "$TOOL_NAME" ]; then
  exit 0
fi

if ! RESULT=$(fbeast-hook pre-tool --db "$DB_PATH" "$TOOL_NAME" 2>&1); then
  SAFE_REASON=$(printf '%s' "$RESULT" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo '"blocked by fbeast governor"')
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":%s}}\\n' "$SAFE_REASON" >&1
  exit 2
fi

exit 0
`);

  writeFileSync(postTool, `#!/usr/bin/env bash
# fbeast PostToolUse hook for Codex CLI
# Reads tool result JSON from stdin, records observer event.
set -euo pipefail

DB_PATH=${JSON.stringify(dbPath)}

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null || echo "")
TOOL_RESPONSE=$(printf '%s' "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d.get('tool_response',{})))" 2>/dev/null || echo "{}")

fbeast-hook post-tool --db "$DB_PATH" "$TOOL_NAME" "$TOOL_RESPONSE" >/dev/null 2>&1 || true
exit 0
`);

  chmodSync(preTool, 0o755);
  chmodSync(postTool, 0o755);
  return { preTool, postTool };
}
