import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { FbeastServer } from '../shared/config.js';

const CODEX_NAME_HASH_LENGTH = 12;

/**
 * Codex MCP server names are global, so fbeast registrations must be scoped to
 * the project root they serve. Keep the human-readable server prefix while
 * suffixing a stable root hash to avoid cross-repository collisions.
 */
export function codexProjectId(root: string): string {
  return createHash('sha256')
    .update(resolve(root))
    .digest('hex')
    .slice(0, CODEX_NAME_HASH_LENGTH);
}

export function codexServerName(root: string, server: FbeastServer | 'proxy'): string {
  return `fbeast-${server}-${codexProjectId(root)}`;
}

export function codexServerNames(root: string, servers: readonly FbeastServer[], mode: 'standard' | 'proxy'): string[] {
  if (mode === 'proxy') {
    return [codexServerName(root, 'proxy')];
  }

  return servers.map((server) => codexServerName(root, server));
}
