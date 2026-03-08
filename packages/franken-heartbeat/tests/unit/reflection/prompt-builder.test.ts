import { describe, it, expect } from 'vitest';
import { buildReflectionPrompt } from '../../../src/reflection/prompt-builder.js';
import type { EpisodicTrace, MemoryEntry } from '../../../src/modules/memory.js';
import type { Trace } from '../../../src/modules/observability.js';

describe('buildReflectionPrompt', () => {
  const traces: Trace[] = [
    { id: 't1', spanCount: 3, status: 'ok', durationMs: 100, timestamp: '2026-02-19T01:00:00Z' },
    { id: 't2', spanCount: 5, status: 'error', durationMs: 500, timestamp: '2026-02-19T01:30:00Z' },
  ];

  const failures: MemoryEntry[] = [
    { id: 'f1', content: 'Failed to refactor Multi-Currency UI: missing mock', source: 'episodic', timestamp: '2026-02-18T10:00:00Z' },
  ];

  const successes: MemoryEntry[] = [
    { id: 's1', content: 'Successfully deployed auth module', source: 'episodic', timestamp: '2026-02-18T12:00:00Z' },
  ];

  it('includes pattern analysis section in prompt', () => {
    const prompt = buildReflectionPrompt({ traces, failures, successes });
    expect(prompt).toContain('patterns');
  });

  it('includes improvement suggestion section in prompt', () => {
    const prompt = buildReflectionPrompt({ traces, failures, successes });
    expect(prompt).toContain('improvements');
  });

  it('includes tech debt scan section in prompt', () => {
    const prompt = buildReflectionPrompt({ traces, failures, successes });
    expect(prompt).toContain('tech debt');
  });

  it('includes failure context in prompt', () => {
    const prompt = buildReflectionPrompt({ traces, failures, successes });
    expect(prompt).toContain('missing mock');
  });

  it('includes trace summary in prompt', () => {
    const prompt = buildReflectionPrompt({ traces, failures, successes });
    expect(prompt).toContain('2 trace(s)');
  });

  it('requests JSON response format', () => {
    const prompt = buildReflectionPrompt({ traces, failures, successes });
    expect(prompt).toContain('JSON');
  });
});
