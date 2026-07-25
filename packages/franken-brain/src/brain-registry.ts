import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import Database from 'better-sqlite3';

import { HiveMindStore, hiveMindAgentTypeNamespace, type HiveMindNamespace } from './hive-mind-store.js';
import { SqliteBrain } from './sqlite-brain.js';

const MAX_AGENT_TYPE_ID_BYTES = 255;
const MAX_DEFAULT_BRAIN_FILENAME_AGENT_TYPE_ID_BYTES = 244;
const UNSAFE_AGENT_TYPE_ID_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f\u007f]/u;
const WINDOWS_RESERVED_AGENT_TYPE_ID =
  /^(?:con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const HIVE_PUBLISHER_ID_METADATA_KEY = 'hive-publisher-id';

function durablePublisherId(
  dbPath: string,
  hiveDbPath: string,
  namespace: HiveMindNamespace,
): string {
  const db = new Database(dbPath);
  try {
    db.pragma('busy_timeout = 5000');
    db.exec(`
      CREATE TABLE IF NOT EXISTS brain_registry_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    const selectPublisherId = db.prepare(`
      SELECT value FROM brain_registry_metadata WHERE key = ?
    `);
    const existing = selectPublisherId.get(HIVE_PUBLISHER_ID_METADATA_KEY) as
      { value: string } | undefined;
    if (existing) return existing.value;

    const initializePublisherId = db.transaction(() => {
      const concurrent = selectPublisherId.get(HIVE_PUBLISHER_ID_METADATA_KEY) as
        { value: string } | undefined;
      if (concurrent) return concurrent.value;

      const hiveStore = new HiveMindStore(hiveDbPath);
      try {
        // Previous releases used process-random publisher IDs, so ownership cannot
        // be reconstructed safely. Purge only this agent-type namespace before
        // adopting a durable identity; otherwise right-to-forget cannot reach it.
        hiveStore.deleteNamespace(namespace);
      } finally {
        hiveStore.close();
      }

      const publisherId = randomUUID();
      db.prepare(`
        INSERT INTO brain_registry_metadata (key, value) VALUES (?, ?)
      `).run(HIVE_PUBLISHER_ID_METADATA_KEY, publisherId);
      return publisherId;
    });
    return initializePublisherId.immediate();
  } finally {
    db.close();
  }
}

function assertSafeAgentTypeId(agentTypeId: string): void {
  if (
    typeof agentTypeId !== 'string' ||
    agentTypeId.length === 0 ||
    agentTypeId !== agentTypeId.trim() ||
    agentTypeId === '.' ||
    agentTypeId === '..' ||
    agentTypeId.endsWith('.') ||
    UNSAFE_AGENT_TYPE_ID_CHARACTERS.test(agentTypeId) ||
    WINDOWS_RESERVED_AGENT_TYPE_ID.test(agentTypeId) ||
    Buffer.byteLength(agentTypeId, 'utf8') > MAX_AGENT_TYPE_ID_BYTES
  ) {
    throw new RangeError(
      'agentTypeId must be a non-empty, portable path-component identifier of at most 255 UTF-8 bytes',
    );
  }
}

function assertWorkspaceId(workspaceId: string): void {
  if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
    throw new RangeError('workspaceId must be a non-empty identifier');
  }
}

function agentTypeKey(agentTypeId: string): string {
  return `agent-type:${agentTypeId}`;
}

function workspaceHiveKey(workspaceId: string): string {
  return `workspace-hive:${workspaceId}`;
}

function workspaceHiveFilename(workspaceId: string): string {
  const filenameHash = createHash('sha256').update(workspaceId).digest('hex');
  return `${filenameHash}.db`;
}

/**
 * Process-local owner of one durable brain instance per agent type.
 *
 * By default, each safe agent-type identifier maps to
 * `.fbeast/brains/<agentTypeId>.db`. Callers may pass an explicit database path,
 * including `:memory:`, when they intentionally need different persistence.
 */
export class BrainRegistry {
  private readonly brains = new Map<string, Map<string, SqliteBrain>>();
  private readonly preferredDbPaths = new Map<string, string>();

  constructor(
    private readonly brainsDir = join('.fbeast', 'brains'),
    private readonly hiveDbPath = join(dirname(brainsDir), 'hive', 'hive.db'),
    private readonly publisherId?: string,
  ) {}

  forAgentType(agentTypeId: string, dbPath?: string): SqliteBrain {
    assertSafeAgentTypeId(agentTypeId);
    const registryKey = agentTypeKey(agentTypeId);

    const agentBrains = this.brains.get(registryKey);
    const preferredDbPath = this.preferredDbPaths.get(registryKey);
    if (dbPath === undefined && preferredDbPath) {
      const preferred = agentBrains?.get(preferredDbPath);
      if (preferred) return preferred;
    }

    if (
      dbPath === undefined
      && Buffer.byteLength(agentTypeId, 'utf8') > MAX_DEFAULT_BRAIN_FILENAME_AGENT_TYPE_ID_BYTES
    ) {
      throw new RangeError(
        `agentTypeId must be at most ${MAX_DEFAULT_BRAIN_FILENAME_AGENT_TYPE_ID_BYTES} UTF-8 bytes when deriving the default .db filename`,
      );
    }

    const requestedDbPath = dbPath ?? join(this.brainsDir, `${agentTypeId}.db`);
    const resolvedDbPath = requestedDbPath === ':memory:' ? requestedDbPath : resolve(requestedDbPath);
    const existing = agentBrains?.get(resolvedDbPath);
    if (existing) {
      if (dbPath !== undefined) this.preferredDbPaths.set(registryKey, resolvedDbPath);
      return existing;
    }
    if (resolvedDbPath !== ':memory:') {
      mkdirSync(dirname(resolvedDbPath), { recursive: true });
    }
    const namespace = hiveMindAgentTypeNamespace(agentTypeId);
    const publisherId = this.publisherId
      ?? (resolvedDbPath === ':memory:'
        ? randomUUID()
        : durablePublisherId(resolvedDbPath, this.hiveDbPath, namespace));
    const brain = new SqliteBrain(resolvedDbPath, undefined, {
      conversationWorkspaceId: null,
      hiveMind: {
        dbPath: resolvedDbPath === ':memory:' ? ':memory:' : this.hiveDbPath,
        namespace,
        publisherId,
      },
    });
    const paths = agentBrains ?? new Map<string, SqliteBrain>();
    paths.set(resolvedDbPath, brain);
    this.brains.set(registryKey, paths);
    this.preferredDbPaths.set(registryKey, resolvedDbPath);
    return brain;
  }

  /** Return one stable workspace-scoped Hive brain in a namespace disjoint from agent types. */
  forWorkspaceHive(workspaceId: string, dbPath?: string): SqliteBrain {
    assertWorkspaceId(workspaceId);
    const registryKey = workspaceHiveKey(workspaceId);
    const workspaceBrains = this.brains.get(registryKey);
    const preferredDbPath = this.preferredDbPaths.get(registryKey);
    if (dbPath === undefined && preferredDbPath) {
      const preferred = workspaceBrains?.get(preferredDbPath);
      if (preferred) return preferred;
    }

    const workspaceBrainsDir = join(this.brainsDir, 'workspaces');
    const requestedDbPath = dbPath ?? join(workspaceBrainsDir, workspaceHiveFilename(workspaceId));
    const resolvedDbPath = requestedDbPath === ':memory:' ? requestedDbPath : resolve(requestedDbPath);
    const existing = workspaceBrains?.get(resolvedDbPath);
    if (existing) {
      if (dbPath !== undefined) this.preferredDbPaths.set(registryKey, resolvedDbPath);
      return existing;
    }
    if (dbPath === undefined) {
      mkdirSync(workspaceBrainsDir, { recursive: true, mode: 0o700 });
      if (process.platform !== 'win32') chmodSync(workspaceBrainsDir, 0o700);
    }

    const brain = new SqliteBrain(resolvedDbPath, undefined, {
      conversationWorkspaceId: workspaceId,
    });
    const paths = workspaceBrains ?? new Map<string, SqliteBrain>();
    paths.set(resolvedDbPath, brain);
    this.brains.set(registryKey, paths);
    this.preferredDbPaths.set(registryKey, resolvedDbPath);
    return brain;
  }

  /** Return an existing workspace Hive brain without creating an unknown database. */
  getWorkspaceHive(workspaceId: string, dbPath?: string): SqliteBrain | undefined {
    assertWorkspaceId(workspaceId);
    const registryKey = workspaceHiveKey(workspaceId);
    const workspaceBrains = this.brains.get(registryKey);
    const preferredDbPath = this.preferredDbPaths.get(registryKey);
    if (dbPath === undefined && preferredDbPath) {
      const preferred = workspaceBrains?.get(preferredDbPath);
      if (preferred) return preferred;
    }

    if (dbPath !== undefined) {
      const resolvedDbPath = dbPath === ':memory:' ? dbPath : resolve(dbPath);
      const existing = workspaceBrains?.get(resolvedDbPath);
      if (existing) return existing;
      if (dbPath === ':memory:' || !existsSync(resolvedDbPath)) return undefined;
      return this.forWorkspaceHive(workspaceId, resolvedDbPath);
    }

    const defaultPath = join(this.brainsDir, 'workspaces', workspaceHiveFilename(workspaceId));
    if (!existsSync(defaultPath)) return undefined;
    return this.forWorkspaceHive(workspaceId);
  }

  /** Return an existing agent brain without creating an unknown database. */
  getAgentType(agentTypeId: string, dbPath?: string): SqliteBrain | undefined {
    assertSafeAgentTypeId(agentTypeId);
    const registryKey = agentTypeKey(agentTypeId);

    const agentBrains = this.brains.get(registryKey);
    const preferredDbPath = this.preferredDbPaths.get(registryKey);
    if (dbPath === undefined && preferredDbPath) {
      const preferred = agentBrains?.get(preferredDbPath);
      if (preferred) return preferred;
    }

    if (dbPath !== undefined) {
      const resolvedDbPath = dbPath === ':memory:' ? dbPath : resolve(dbPath);
      const existing = agentBrains?.get(resolvedDbPath);
      if (existing) return existing;
      if (dbPath === ':memory:' || !existsSync(resolvedDbPath)) return undefined;
      return this.forAgentType(agentTypeId, resolvedDbPath);
    }

    if (Buffer.byteLength(agentTypeId, 'utf8') > MAX_DEFAULT_BRAIN_FILENAME_AGENT_TYPE_ID_BYTES) {
      throw new RangeError(
        `agentTypeId must be at most ${MAX_DEFAULT_BRAIN_FILENAME_AGENT_TYPE_ID_BYTES} UTF-8 bytes when deriving the default .db filename`,
      );
    }

    if (!existsSync(join(this.brainsDir, `${agentTypeId}.db`))) return undefined;
    return this.forAgentType(agentTypeId);
  }

  /** Close every brain owned by this registry and release its process-local keys. */
  close(): void {
    for (const paths of this.brains.values()) {
      for (const brain of paths.values()) brain.close();
    }
    this.brains.clear();
    this.preferredDbPaths.clear();
  }
}