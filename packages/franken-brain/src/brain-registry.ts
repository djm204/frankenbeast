import { Buffer } from 'node:buffer';

import type { IBrain } from '@franken/types';

import { SqliteBrain } from './sqlite-brain.js';

const MAX_AGENT_TYPE_ID_BYTES = 255;
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
 * Process-local owner of one brain instance per agent type.
 *
 * Persistence-path selection deliberately remains outside this foundation. Until
 * that follow-up is wired, each newly registered brain keeps SqliteBrain's
 * existing in-memory default.
 */
export class BrainRegistry {
  private readonly brains = new Map<string, SqliteBrain>();

  forAgentType(agentTypeId: string): IBrain {
    assertSafeAgentTypeId(agentTypeId);

    const existing = this.brains.get(agentTypeId);
    if (existing) return existing;

    const brain = new SqliteBrain();
    this.brains.set(agentTypeId, brain);
    return brain;
  }

  /** Close every brain owned by this registry and release its process-local keys. */
  close(): void {
    for (const brain of this.brains.values()) brain.close();
    this.brains.clear();
  }
}