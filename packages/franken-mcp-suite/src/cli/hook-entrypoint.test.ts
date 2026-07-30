import { afterEach, describe, expect, it, vi } from 'vitest';

const originalArgv = [...process.argv];

describe('fbeast-hook entrypoint', () => {
  afterEach(() => {
    process.argv = [...originalArgv];
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('does not print rejected hook error payloads', async () => {
    const secret = ['entrypoint', 'secret', 'value'].join('-');
    const rejectedPayload = {
      message: 'hook dependency failed',
      details: { token: secret },
    };

    vi.doMock('../shared/is-main.js', () => ({ isMain: () => true }));
    vi.doMock('../adapters/governor-adapter.js', () => ({
      createGovernorAdapter: () => ({
        check: vi.fn().mockRejectedValue(rejectedPayload),
      }),
    }));
    vi.doMock('../adapters/observer-adapter.js', () => ({
      createObserverAdapter: () => ({ log: vi.fn() }),
    }));

    process.argv = ['node', 'fbeast-hook', 'pre-tool', 'test-tool'];
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    await import('./hook.js');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));

    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain('fbeast-hook failed');
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain('hook dependency failed');
  });

  it('does not print raw Error objects/stacks, and redacts credential-shaped error messages', async () => {
    const secret = ['entrypoint', 'thrown', 'secret'].join('-');
    const thrown = new Error(`connection refused: token=${secret}`);

    vi.doMock('../shared/is-main.js', () => ({ isMain: () => true }));
    vi.doMock('../adapters/governor-adapter.js', () => ({
      createGovernorAdapter: () => ({
        check: vi.fn().mockRejectedValue(thrown),
      }),
    }));
    vi.doMock('../adapters/observer-adapter.js', () => ({
      createObserverAdapter: () => ({ log: vi.fn() }),
    }));

    process.argv = ['node', 'fbeast-hook', 'pre-tool', 'test-tool'];
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    await import('./hook.js');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));

    const logged = JSON.stringify(error.mock.calls);
    // The raw secret must never appear...
    expect(logged).not.toContain(secret);
    // ...nor the raw stack trace (which would include this file's path)...
    expect(logged).not.toContain(thrown.stack ?? 'never-matches-placeholder');
    // ...but a redacted, still-useful summary of a genuine Error's message
    // should be surfaced for debuggability.
    expect(logged).toContain('fbeast-hook failed');
    expect(logged).toContain('connection refused');
    expect(logged).toContain('[REDACTED]');
  });
});
