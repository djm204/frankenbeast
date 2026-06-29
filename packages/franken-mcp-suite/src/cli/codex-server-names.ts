import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FbeastServer } from '../shared/config.js';

const CODEX_NAME_HASH_LENGTH = 12;
const CODEX_PROJECT_ID_FILE = join('.fbeast', 'codex-project-id');

/**
 * Codex MCP server names are global, so fbeast registrations must be scoped to
 * the project root they serve. Keep the human-readable server prefix while
 * suffixing a stable root hash to avoid cross-repository collisions.
 */
export function codexProjectId(root: string): string {
  const persisted = readPersistedCodexProjectId(root);
  if (persisted) return persisted;

  return codexProjectIdForPath(root);
}

export function ensureCodexProjectId(root: string): string {
  const existing = readPersistedCodexProjectId(root);
  if (existing) return existing;

  const projectId = codexProjectIdForPath(root);
  const fbeastDir = join(root, '.fbeast');
  mkdirSync(fbeastDir, { recursive: true });
  writeFileSync(join(root, CODEX_PROJECT_ID_FILE), `${projectId}\n`);
  return projectId;
}

export function codexProjectIds(root: string): string[] {
  const ids = new Set<string>();
  const persisted = readPersistedCodexProjectId(root);
  if (persisted) ids.add(persisted);
  ids.add(codexProjectIdForPath(root));
  return [...ids];
}

function codexProjectIdForPath(root: string): string {
  return createHash('sha256')
    .update(resolve(root))
    .digest('hex')
    .slice(0, CODEX_NAME_HASH_LENGTH);
}

function readPersistedCodexProjectId(root: string): string | null {
  const path = join(root, CODEX_PROJECT_ID_FILE);
  if (!existsSync(path)) return null;

  try {
    const value = readFileSync(path, 'utf-8').trim();
    return /^[0-9a-f]{12}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

function codexServerNameForProjectId(projectId: string, server: FbeastServer | 'proxy'): string {
  return `fbeast-${server}-${projectId}`;
}

export function codexServerName(root: string, server: FbeastServer | 'proxy'): string {
  return codexServerNameForProjectId(codexProjectId(root), server);
}

export function codexServerNames(root: string, servers: readonly FbeastServer[], mode: 'standard' | 'proxy'): string[] {
  if (mode === 'proxy') {
    return [codexServerName(root, 'proxy')];
  }

  return servers.map((server) => codexServerName(root, server));
}

export function codexServerNamesForProjectIds(
  projectIds: readonly string[],
  servers: readonly FbeastServer[],
  mode: 'standard' | 'proxy',
): string[] {
  const serverList: Array<FbeastServer | 'proxy'> = mode === 'proxy' ? ['proxy'] : [...servers];
  return projectIds.flatMap((projectId) => serverList.map((server) => codexServerNameForProjectId(projectId, server)));
}
