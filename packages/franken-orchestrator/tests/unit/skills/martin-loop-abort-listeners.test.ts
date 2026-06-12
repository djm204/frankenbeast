import { describe, it, expect } from 'vitest';
import { getEventListeners } from 'node:events';
import { sleepWithAbort, defaultSleep } from '../../../src/skills/martin-loop.js';

const abortListenerCount = (signal: AbortSignal): number =>
  getEventListeners(signal, 'abort').length;

describe('sleepWithAbort listener hygiene (issue #39)', () => {
  it('removes the abort listener after a normal default-sleep completion', async () => {
    const ac = new AbortController();
    await sleepWithAbort(1, defaultSleep, ac.signal);
    expect(abortListenerCount(ac.signal)).toBe(0);
  });

  it('removes the abort listener after a normal custom-sleepFn completion', async () => {
    const ac = new AbortController();
    await sleepWithAbort(1, () => Promise.resolve(), ac.signal);
    expect(abortListenerCount(ac.signal)).toBe(0);
  });

  it('removes the abort listener when the custom sleepFn rejects', async () => {
    const ac = new AbortController();
    await expect(
      sleepWithAbort(1, () => Promise.reject(new Error('sleep broke')), ac.signal),
    ).rejects.toThrow('sleep broke');
    expect(abortListenerCount(ac.signal)).toBe(0);
  });

  it('removes the abort listener when aborted mid-sleep', async () => {
    const ac = new AbortController();
    const never = (): Promise<void> => new Promise(() => undefined);
    const pending = sleepWithAbort(60_000, never, ac.signal);
    ac.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(abortListenerCount(ac.signal)).toBe(0);
  });

  it('does not accumulate listeners across many repeated sleeps on one signal', async () => {
    const ac = new AbortController();
    for (let i = 0; i < 100; i++) {
      await sleepWithAbort(0, defaultSleep, ac.signal);
      await sleepWithAbort(0, () => Promise.resolve(), ac.signal);
    }
    expect(abortListenerCount(ac.signal)).toBe(0);
  });

  it('does not accumulate listeners across repeated aborted sleeps', async () => {
    const ac = new AbortController();
    const never = (): Promise<void> => new Promise(() => undefined);

    const first = sleepWithAbort(60_000, never, ac.signal);
    ac.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });

    // Once aborted, further sleeps must reject immediately without attaching anything.
    for (let i = 0; i < 100; i++) {
      await expect(sleepWithAbort(60_000, never, ac.signal)).rejects.toMatchObject({
        name: 'AbortError',
      });
    }
    expect(abortListenerCount(ac.signal)).toBe(0);
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(sleepWithAbort(1, defaultSleep, ac.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(abortListenerCount(ac.signal)).toBe(0);
  });
});
