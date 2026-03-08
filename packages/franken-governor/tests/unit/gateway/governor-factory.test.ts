import { describe, it, expect, vi } from 'vitest';
import { createGovernor } from '../../../src/gateway/governor-factory.js';
import type { ReadlineAdapter } from '../../../src/channels/cli-channel.js';

function makeFakeReadline(): ReadlineAdapter {
  return { question: vi.fn().mockResolvedValue('a') };
}

function makeFakeMemoryPort() {
  return { recordDecision: vi.fn().mockResolvedValue(undefined) };
}

describe('createGovernor', () => {
  it('returns a GovernorCritiqueAdapter', () => {
    const governor = createGovernor({
      readline: makeFakeReadline(),
      memoryPort: makeFakeMemoryPort(),
    });

    expect(governor).toBeDefined();
    expect(typeof governor.verifyRationale).toBe('function');
  });

  it('uses CLI channel by default', () => {
    const governor = createGovernor({
      readline: makeFakeReadline(),
      memoryPort: makeFakeMemoryPort(),
    });

    expect(governor).toBeDefined();
  });
});
