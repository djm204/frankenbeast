import { join } from 'node:path';

/** MCP-compatible AI assistant clients fbeast knows how to configure. */
export type McpClient = 'claude' | 'gemini' | 'codex';

const MCP_CLIENTS = ['claude', 'gemini', 'codex'] as const;

/** Clients that use a settings.json file in a config dir. */
const JSON_CLIENT_DIR: Partial<Record<McpClient, string>> = {
  claude: '.claude',
  gemini: '.gemini',
};

export interface ResolveClientConfigDirInput {
  client: McpClient;
  cwd: string;
  homeDir: string;
  exists: (path: string) => boolean;
}

/**
 * Returns the config directory for file-based clients (claude, gemini).
 * Always returns the project-level dir for JSON clients so `fbeast init` writes
 * project-scoped MCP registrations instead of mutating user-global
 * settings.json files with fbeast server entries. Detection may still use
 * home-level config dirs to infer the requested client, but registration is
 * intentionally rooted in the current project.
 * Not applicable for codex — use the codex CLI instead.
 */
export function resolveClientConfigDir(input: ResolveClientConfigDirInput): string {
  const dirName = JSON_CLIENT_DIR[input.client];
  if (!dirName) {
    // codex doesn't have a writable config dir — return home/.codex for reference only
    return join(input.homeDir, '.codex');
  }
  return join(input.cwd, dirName);
}

/**
 * Returns true for clients configured via settings.json (claude, gemini).
 * Codex is configured via the `codex mcp` CLI commands.
 */
export function isJsonClient(client: McpClient): client is 'claude' | 'gemini' {
  return client === 'claude' || client === 'gemini';
}

export function parseMcpClient(value: string | undefined): McpClient | undefined {
  if (value === undefined) return undefined;
  if ((MCP_CLIENTS as readonly string[]).includes(value)) return value as McpClient;
  throw new Error(`Invalid --client value "${value}". Expected claude, gemini, or codex.`);
}

/**
 * Detects which MCP client is present. Checks project-level JSON-client dirs
 * first, then Claude's project-level .mcp.json, then project-level Codex,
 * then home-level fallbacks.
 */
export function detectMcpClient(input: {
  cwd: string;
  homeDir: string;
  exists: (path: string) => boolean;
  which?: (bin: string) => string | undefined;
}): McpClient {
  // Project-level dir wins
  for (const [client, dir] of Object.entries(JSON_CLIENT_DIR) as [McpClient, string][]) {
    if (input.exists(join(input.cwd, dir))) return client;
  }
  if (input.exists(join(input.cwd, '.mcp.json'))) return 'claude';
  if (input.exists(join(input.cwd, '.codex'))) return 'codex';

  // Home-level dir next
  for (const [client, dir] of Object.entries(JSON_CLIENT_DIR) as [McpClient, string][]) {
    if (input.exists(join(input.homeDir, dir))) return client;
  }
  // If only codex is present
  if (input.exists(join(input.homeDir, '.codex')) || input.which?.('codex')) {
    return 'codex';
  }
  return 'claude';
}
