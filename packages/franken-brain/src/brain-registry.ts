import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { SqliteBrain } from './sqlite-brain.js';

const MAX_AGENT_TYPE_ID_BYTES = 255;
const MAX_DEFAULT_BRAIN_FILENAME_AGENT_TYPE_ID_BYTES = 244;
const UNSAFE_AGENT_TYPE_ID_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f\u007f]/u;
const WINDOWS_RESERVED_AGENT_TYPE_ID =
  /^(?:con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])(?:\.|$)/iu;

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

/**
 * Process-local owner of one durable brain instance per agent type.
 *
 * By default, each safe agent-type identifier maps to
 * `.fbeast/brains/<agentTypeId>.db`. Callers may pass an explicit database path,
 * including `:memory:`, when they intentionally need different persistence.
 */
export class BrainRegistry {
  private readonly brains = new Map<string, SqliteBrain>();

  constructor(private readonly brainsDir = join('.fbeast', 'brains')) {}

  forAgentType(agentTypeId: string, dbPath?: string): SqliteBrain {
    assertSafeAgentTypeId(agentTypeId);

    const existing = this.brains.get(agentTypeId);
    if (existing) return existing;

    if (
      dbPath === undefined
      && Buffer.byteLength(agentTypeId, 'utf8') > MAX_DEFAULT_BRAIN_FILENAME_AGENT_TYPE_ID_BYTES
    ) {
      throw new RangeError(
        `agentTypeId must be at most ${MAX_DEFAULT_BRAIN_FILENAME_AGENT_TYPE_ID_BYTES} UTF-8 bytes when deriving the default .db filename`,
      );
    }

    const resolvedDbPath = dbPath ?? join(this.brainsDir, `${agentTypeId}.db`);
    if (dbPath === undefined) {
      mkdirSync(this.brainsDir, { recursive: true });
    }
    const brain = new SqliteBrain(resolvedDbPath);
    this.brains.set(agentTypeId, brain);
    return brain;
  }

  /** Return an existing default agent brain without creating an unknown database. */
  getAgentType(agentTypeId: string): SqliteBrain | undefined {
    assertSafeAgentTypeId(agentTypeId);

    const existing = this.brains.get(agentTypeId);
    if (existing) return existing;

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
    for (const brain of this.brains.values()) brain.close();
    this.brains.clear();
  }
}