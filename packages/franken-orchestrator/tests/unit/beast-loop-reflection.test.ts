import { describe, it, expect, vi } from 'vitest';
import { BeastLoop } from '../../src/beast-loop.js';
import { makeDeps } from '../helpers/stubs.js';

describe('BeastLoop reflection trigger', () => {
  it('does not call heartbeat when enableReflection is false', async () => {
    const deps = makeDeps();
    const loop = new BeastLoop(deps, { enableReflection: false });

    await loop.run({ projectId: 'proj', userInput: 'test' });

    // heartbeat.pulse is called once in closure, but not for reflection
    const pulseCalls = (deps.heartbeat.pulse as ReturnType<typeof vi.fn>).mock.calls.length;
    // With reflection disabled, only closure calls pulse (1 time)
    expect(pulseCalls).toBe(1);
  });

  it('calls heartbeat after planning and execution when enableReflection is true', async () => {
    const deps = makeDeps();
    const loop = new BeastLoop(deps, { enableReflection: true });

    await loop.run({ projectId: 'proj', userInput: 'test' });

    // 2 reflection pulses (after-planning + after-execution) + 1 closure pulse = 3
    const pulseCalls = (deps.heartbeat.pulse as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(pulseCalls).toBe(3);
  });

  it('swallows reflection errors and continues the run', async () => {
    const deps = makeDeps();
    // Make heartbeat.pulse fail on first two calls (reflection) but succeed on third (closure)
    let callCount = 0;
    (deps.heartbeat.pulse as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) throw new Error('LLM unavailable');
      return { improvements: [], techDebt: [], summary: 'ok' };
    });

    const loop = new BeastLoop(deps, { enableReflection: true });
    const result = await loop.run({ projectId: 'proj', userInput: 'test' });

    // Run should complete despite reflection failures
    expect(result.status).toBe('completed');
  });

  it('logs reflection output', async () => {
    const deps = makeDeps();
    const logCalls: Array<{ msg: string; data?: unknown }> = [];
    deps.logger.info = vi.fn((msg: string, data?: unknown) => {
      logCalls.push({ msg, data });
    });

    const loop = new BeastLoop(deps, { enableReflection: true });
    await loop.run({ projectId: 'proj', userInput: 'test' });

    const reflectionLogs = logCalls.filter((l) =>
      l.msg.includes('reflection'),
    );
    expect(reflectionLogs.length).toBeGreaterThanOrEqual(2);
    expect(reflectionLogs.some((l) => l.msg.includes('after-planning'))).toBe(true);
    expect(reflectionLogs.some((l) => l.msg.includes('after-execution'))).toBe(true);
  });
});
