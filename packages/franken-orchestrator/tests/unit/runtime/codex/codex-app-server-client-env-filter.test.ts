import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));
import { spawn } from 'node:child_process';
import { createCodexAppServerRequest } from '../../../../src/runtime/codex/codex-app-server-client.js';
import {
  RUN_CONFIG_INTEGRITY_ENV,
  RUN_CONFIG_INTEGRITY_SECRET_ENV,
  RUN_CONFIG_INTEGRITY_BYPASS_ENV,
} from '../../../../src/cli/run-config-integrity.js';

function mockChildProcess(): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  Object.defineProperty(proc, 'stdin', { value: new PassThrough() });
  Object.defineProperty(proc, 'stdout', { value: new PassThrough() });
  Object.defineProperty(proc, 'stderr', { value: new PassThrough() });
  Object.defineProperty(proc, 'pid', { value: 4242 });
  Object.defineProperty(proc, 'exitCode', { value: null, writable: true });
  Object.defineProperty(proc, 'kill', { value: vi.fn(() => true) });
  Object.defineProperty(proc, 'unref', { value: vi.fn() });
  return proc;
}

describe('createCodexAppServerRequest env filtering', () => {
  beforeEach(() => {
    (spawn as ReturnType<typeof vi.fn>).mockClear();
  });

  it('does not forward secret-shaped ambient env vars to the spawned codex app-server, but preserves OPENAI_API_KEY when no explicit env override is given', () => {
    process.env['SOME_UNRELATED_API_KEY'] = 'unrelated-secret';
    process.env['OPENAI_API_KEY'] = 'openai-secret';

    try {
      const proc = mockChildProcess();
      (spawn as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      const request = createCodexAppServerRequest({});
      // Fire and forget: we only need to inspect the synchronous spawn() call
      // made by ensureServer(); the request itself will time out in the
      // background since the mock child never responds.
      request('someMethod', {}, { timeoutMs: 10 }).catch(() => undefined);

      expect(spawn).toHaveBeenCalledTimes(1);
      const spawnEnv = (spawn as ReturnType<typeof vi.fn>).mock.calls[0][2].env as Record<string, string>;
      expect(spawnEnv['SOME_UNRELATED_API_KEY']).toBeUndefined();
      expect(spawnEnv['OPENAI_API_KEY']).toBe('openai-secret');
    } finally {
      delete process.env['SOME_UNRELATED_API_KEY'];
      delete process.env['OPENAI_API_KEY'];
    }
  });

  it('strips runtime config integrity state from the default (non-override) spawned env, matching every other provider spawn path', () => {
    process.env[RUN_CONFIG_INTEGRITY_ENV] = '/tmp/run-config.integrity';
    process.env[RUN_CONFIG_INTEGRITY_SECRET_ENV] = 'signing-key';
    process.env[RUN_CONFIG_INTEGRITY_BYPASS_ENV] = '1';

    try {
      const proc = mockChildProcess();
      (spawn as ReturnType<typeof vi.fn>).mockReturnValue(proc);

      const request = createCodexAppServerRequest({});
      request('someMethod', {}, { timeoutMs: 10 }).catch(() => undefined);

      const spawnEnv = (spawn as ReturnType<typeof vi.fn>).mock.calls[0][2].env as Record<string, string>;
      expect(spawnEnv[RUN_CONFIG_INTEGRITY_ENV]).toBeUndefined();
      expect(spawnEnv[RUN_CONFIG_INTEGRITY_SECRET_ENV]).toBeUndefined();
      expect(spawnEnv[RUN_CONFIG_INTEGRITY_BYPASS_ENV]).toBeUndefined();
    } finally {
      delete process.env[RUN_CONFIG_INTEGRITY_ENV];
      delete process.env[RUN_CONFIG_INTEGRITY_SECRET_ENV];
      delete process.env[RUN_CONFIG_INTEGRITY_BYPASS_ENV];
    }
  });

  it('uses the caller-supplied env override as-is when one is explicitly provided', () => {
    const proc = mockChildProcess();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue(proc);

    const explicitEnv = { PATH: '/custom/bin', CUSTOM_TEST_VAR: 'value' };
    const request = createCodexAppServerRequest({ env: explicitEnv });
    request('someMethod', {}, { timeoutMs: 10 }).catch(() => undefined);

    const spawnEnv = (spawn as ReturnType<typeof vi.fn>).mock.calls[0][2].env;
    expect(spawnEnv).toBe(explicitEnv);
  });
});
