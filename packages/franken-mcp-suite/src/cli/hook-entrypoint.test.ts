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

  it('fully suppresses an Error message containing a credential shape redactSecrets does not recognize', async () => {
    // An AWS presigned-URL signature has no named key (e.g. "token", "secret",
    // "password") that redactSecrets' pattern list would catch, so it would
    // previously pass through unredacted. The entrypoint must refuse to log
    // any part of a message it cannot confirm is safe, rather than printing
    // a partially-redacted guess.
    const signature = 'deadbeef1234567890abcdef1234567890abcdef';
    const thrown = new Error(
      `presigned URL request failed: https://bucket.s3.amazonaws.com/key?X-Amz-Signature=${signature}&X-Amz-Expires=3600`,
    );

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
    expect(logged).not.toContain(signature);
    expect(logged).not.toContain('X-Amz-Signature');
    expect(logged).not.toContain('presigned URL request failed');
    expect(logged).toBe(JSON.stringify([['fbeast-hook failed']]));
  });

  it('still surfaces plain, non-credential-shaped Error messages for debuggability', async () => {
    const thrown = new Error("ENOENT: no such file or directory, open '/home/user/.fbeast/beast.db'");

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
    expect(logged).toContain('ENOENT');
    expect(logged).toContain('beast.db');
  });
});
