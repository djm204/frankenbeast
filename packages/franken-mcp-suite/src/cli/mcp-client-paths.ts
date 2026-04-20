import { join } from 'node:path';

/** MCP-compatible AI assistant clients fbeast knows how to configure. */
export type McpClient = 'claude' | 'gemini';

const CLIENT_DIR: Record<McpClient, string> = {
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
 * Returns the config directory for the given client.
 * Prefers a project-level dir if it exists, falls back to the home-level dir.
 */
export function resolveClientConfigDir(input: ResolveClientConfigDirInput): string {
  const dirName = CLIENT_DIR[input.client];
  const projectDir = join(input.cwd, dirName);
  if (input.exists(projectDir)) {
    return projectDir;
  }
  return join(input.homeDir, dirName);
}

/**
 * Detects which MCP client is present, checking project-level dirs first,
 * then home-level dirs. Returns 'claude' as the default if nothing is found.
 */
export function detectMcpClient(input: {
  cwd: string;
  homeDir: string;
  exists: (path: string) => boolean;
}): McpClient {
  const clients: McpClient[] = ['claude', 'gemini'];

  for (const client of clients) {
    if (input.exists(join(input.cwd, CLIENT_DIR[client]))) {
      return client;
    }
  }
  for (const client of clients) {
    if (input.exists(join(input.homeDir, CLIENT_DIR[client]))) {
      return client;
    }
  }
  return 'claude';
}
