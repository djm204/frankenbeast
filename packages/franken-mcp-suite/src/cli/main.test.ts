import { afterEach, describe, expect, it, vi } from 'vitest';

const originalArgv = process.argv;

describe('fbeast main CLI', () => {
  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock('./uninstall.js');
  });

  it('passes explicit uninstall client into uninstall execution', async () => {
    const runUninstall = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./uninstall.js', () => ({ runUninstall }));

    process.argv = ['node', 'fbeast', 'uninstall', '--client=codex'];

    await import('./main.js');

    expect(runUninstall).toHaveBeenCalledWith(expect.objectContaining({ client: 'codex' }));
  });
});
