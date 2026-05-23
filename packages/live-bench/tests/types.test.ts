import { describe, expect, it } from 'vitest';
import type { BenchmarkTask } from '../src/types.js';

describe('live-bench types', () => {
  it('represents a core artifact-critical task', () => {
    const task: BenchmarkTask = {
      taskId: 'write-readme',
      tier: 'core',
      taskClass: 'artifact-critical',
      projectFixture: 'tiny-node',
      prompt: 'Create README.md with project summary.',
      expectedArtifacts: ['README.md'],
      requiredChecks: [{ type: 'file-exists', path: 'README.md' }],
      timeoutMs: 120_000,
      allowedNondeterminism: [],
      baselineSupported: true,
    };

    expect(task.taskId).toBe('write-readme');
  });
});
