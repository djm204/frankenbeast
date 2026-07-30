import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createCodexAppServerRequestMock } = vi.hoisted(() => ({
  createCodexAppServerRequestMock: vi.fn(() => vi.fn()),
}));

vi.mock('../../../src/runtime/codex/codex-app-server-client.js', () => ({
  createCodexAppServerRequest: createCodexAppServerRequestMock,
}));

import { createDefaultRuntimeAdapterRegistry } from '../../../src/runtime/runtime-defaults.js';

describe('createDefaultRuntimeAdapterRegistry env filtering', () => {
  beforeEach(() => {
    createCodexAppServerRequestMock.mockClear();
  });

  it('filters secret-shaped ambient env vars out of the process.env merged with a caller-supplied override', () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      SOME_UNRELATED_API_KEY: 'unrelated-secret',
      OPENAI_API_KEY: 'openai-secret',
    };

    try {
      createDefaultRuntimeAdapterRegistry({ env: { PATH: '/custom/bin' } });

      expect(createCodexAppServerRequestMock).toHaveBeenCalledTimes(1);
      const passedEnv = createCodexAppServerRequestMock.mock.calls[0]![0].env as Record<string, string>;
      expect(passedEnv['SOME_UNRELATED_API_KEY']).toBeUndefined();
      expect(passedEnv['OPENAI_API_KEY']).toBe('openai-secret');
      expect(passedEnv['PATH']).toBe('/custom/bin');
    } finally {
      process.env = originalEnv;
    }
  });

  it('passes env: undefined through untouched when no override is supplied (codex-app-server-client applies its own default filtering)', () => {
    createDefaultRuntimeAdapterRegistry({});

    expect(createCodexAppServerRequestMock).toHaveBeenCalledTimes(1);
    expect(createCodexAppServerRequestMock.mock.calls[0]![0].env).toBeUndefined();
  });

  it('uses options.codex.env as-is when explicitly provided, bypassing the merge entirely', () => {
    const explicitEnv = { PATH: '/explicit/bin' };
    createDefaultRuntimeAdapterRegistry({ codex: { env: explicitEnv } });

    expect(createCodexAppServerRequestMock.mock.calls[0]![0].env).toBe(explicitEnv);
  });
});
