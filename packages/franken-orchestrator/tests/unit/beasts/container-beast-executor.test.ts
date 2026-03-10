import { describe, expect, it } from 'vitest';
import { ContainerBeastExecutor } from '../../../src/beasts/execution/container-beast-executor.js';
import { martinLoopDefinition } from '../../../src/beasts/definitions/martin-loop-definition.js';

describe('ContainerBeastExecutor', () => {
  it('throws a typed not-implemented error for v1', async () => {
    const executor = new ContainerBeastExecutor();

    await expect(executor.start({
      id: 'run-1',
      definitionId: 'martin-loop',
      definitionVersion: 1,
      status: 'queued',
      executionMode: 'container',
      configSnapshot: {
        provider: 'claude',
        objective: 'Future container execution',
      },
      dispatchedBy: 'api',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-10T00:00:00.000Z',
      attemptCount: 0,
    }, martinLoopDefinition)).rejects.toThrow(/not implemented/i);
  });
});
