import { describe, it, expect } from 'vitest';
import {
  parseMemoryEntry,
  parseMemoryStatus,
  type WorkingTurn,
  type EpisodicTrace,
  type SemanticChunk,
  type MemoryEntry,
} from '../../../src/types/memory.js';

// ---------------------------------------------------------------------------
// MemoryStatus Zod validation
// ---------------------------------------------------------------------------

describe('parseMemoryStatus', () => {
  it('accepts valid statuses', () => {
    expect(parseMemoryStatus('success')).toBe('success');
    expect(parseMemoryStatus('failure')).toBe('failure');
    expect(parseMemoryStatus('pending')).toBe('pending');
    expect(parseMemoryStatus('compressed')).toBe('compressed');
  });

  it('throws on unknown status string', () => {
    expect(() => parseMemoryStatus('unknown')).toThrow();
    expect(() => parseMemoryStatus('')).toThrow();
    expect(() => parseMemoryStatus(42)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// MemoryEntry discriminated union — type narrowing
// ---------------------------------------------------------------------------

describe('MemoryEntry discriminated union', () => {
  it('WorkingTurn has required fields: role, content, tokenCount', () => {
    const turn: WorkingTurn = {
      id: '01J0000000000000000000000A',
      type: 'working',
      projectId: 'test-project',
      status: 'pending',
      createdAt: Date.now(),
      role: 'user',
      content: 'hello',
      tokenCount: 5,
    };
    expect(turn.role).toBe('user');
    expect(turn.tokenCount).toBe(5);
  });

  it('EpisodicTrace has required fields: taskId, input, output', () => {
    const trace: EpisodicTrace = {
      id: '01J0000000000000000000000B',
      type: 'episodic',
      projectId: 'test-project',
      status: 'success',
      createdAt: Date.now(),
      taskId: 'task-123',
      input: { tool: 'bash', cmd: 'ls' },
      output: { exitCode: 0 },
    };
    expect(trace.taskId).toBe('task-123');
  });

  it('SemanticChunk has required fields: source, content', () => {
    const chunk: SemanticChunk = {
      id: '01J0000000000000000000000C',
      type: 'semantic',
      projectId: 'test-project',
      status: 'success',
      createdAt: Date.now(),
      source: 'adr/ADR-001',
      content: 'Use TypeScript strict mode.',
    };
    expect(chunk.source).toBe('adr/ADR-001');
    expect(chunk.embedding).toBeUndefined();
  });

  it('discriminated union narrows correctly in a switch', () => {
    const entry: MemoryEntry = {
      id: '01J0000000000000000000000A',
      type: 'working',
      projectId: 'p',
      status: 'pending',
      createdAt: 0,
      role: 'assistant',
      content: 'hi',
      tokenCount: 2,
    };

    let seen = '';
    switch (entry.type) {
      case 'working':
        seen = entry.role; // TS knows this is WorkingTurn here
        break;
      case 'episodic':
        seen = entry.taskId;
        break;
      case 'semantic':
        seen = entry.source;
        break;
    }
    expect(seen).toBe('assistant');
  });
});

// ---------------------------------------------------------------------------
// parseMemoryEntry — Zod runtime validation
// ---------------------------------------------------------------------------

describe('parseMemoryEntry', () => {
  it('parses a valid WorkingTurn', () => {
    const raw = {
      id: '01J0000000000000000000000A',
      type: 'working',
      projectId: 'proj',
      status: 'pending',
      createdAt: 1000,
      role: 'user',
      content: 'hello',
      tokenCount: 3,
    };
    const result = parseMemoryEntry(raw);
    expect(result.type).toBe('working');
  });

  it('throws when type is missing', () => {
    expect(() => parseMemoryEntry({ id: 'x', projectId: 'y' })).toThrow();
  });

});
