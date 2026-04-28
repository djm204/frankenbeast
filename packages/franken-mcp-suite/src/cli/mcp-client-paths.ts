import { join } from 'node:path';

/** MCP-compatible AI assistant clients fbeast knows how to configure. */
export type McpClient = 'claude' | 'gemini' | 'codex';

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
 * Prefers a project-level dir if it exists, falls back to home-level.
 * Not applicable for codex — use the codex CLI instead.
 */
export function resolveClientConfigDir(input: ResolveClientConfigDirInput): string {
  const dirName = JSON_CLIENT_DIR[input.client];
  if (!dirName) {
    // codex doesn't have a writable config dir — return home/.codex for reference only
    return join(input.homeDir, '.codex');
  }
  const projectDir = join(input.cwd, dirName);
  if (input.exists(projectDir)) {
    return projectDir;
  }
  return join(input.homeDir, dirName);
}

/**
 * Returns true for clients configured via settings.json (claude, gemini).
 * Codex is configured via the `codex mcp` CLI commands.
 */
export function isJsonClient(client: McpClient): client is 'claude' | 'gemini' {
  return client === 'claude' || client === 'gemini';
}

/**
 * Detects which MCP client is present. Checks project-level dirs for
 * claude/gemini first, then home-level. Falls back to codex if the
 * codex binary is reachable, otherwise defaults to 'claude'.
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
