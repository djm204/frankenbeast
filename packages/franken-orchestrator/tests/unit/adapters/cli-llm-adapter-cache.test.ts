import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { CliLlmAdapter } from '../../../src/adapters/cli-llm-adapter.js';
import { ClaudeProvider } from '../../../src/skills/providers/claude-provider.js';
import { CodexProvider } from '../../../src/skills/providers/codex-provider.js';

function createMockSpawn(result: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}): {
  spawnFn: (cmd: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
} {
  const spawnFn = (_cmd: string, _args: readonly string[], _options: SpawnOptions): ChildProcess => {
    const proc = new EventEmitter() as ChildProcess;
    const stdinStream = new PassThrough();
    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();

    Object.defineProperty(proc, 'stdin', { value: stdinStream, writable: false });
    Object.defineProperty(proc, 'stdout', { value: stdoutStream, writable: false });
    Object.defineProperty(proc, 'stderr', { value: stderrStream, writable: false });
    Object.defineProperty(proc, 'pid', { value: 12345, writable: false });
    Object.defineProperty(proc, 'kill', { value: vi.fn(() => true), writable: false });

    setTimeout(() => {
      if (result.stdout) stdoutStream.write(result.stdout);
      stdoutStream.end();
      if (result.stderr) stderrStream.write(result.stderr);
      stderrStream.end();
      proc.emit('close', result.exitCode ?? 0);
    }, 0);

    return proc;
  };

  return { spawnFn };
}

describe('CliLlmAdapter cache session support', () => {
  it('enables sessionContinue from a cache-session hint for providers with native work sessions', () => {
    const adapter = new CliLlmAdapter(new ClaudeProvider(), { workingDir: '/tmp/test' });

    const transformed = adapter.transformRequest({
      id: 'req-native',
      messages: [{ role: 'user', content: 'continue work' }],
      cacheSession: {
        key: 'issue:99',
        persist: true,
      },
    });

    expect(transformed).toMatchObject({
      sessionContinue: true,
      cacheSession: {
        key: 'issue:99',
        persist: true,
      },
    });
  });

  it('does not enable native session continuation for providers without native work session support', () => {
    const adapter = new CliLlmAdapter(new CodexProvider(), { workingDir: '/tmp/test' });

    const transformed = adapter.transformRequest({
      id: 'req-managed',
      messages: [{ role: 'user', content: 'continue work' }],
      cacheSession: {
        key: 'issue:99',
        persist: true,
      },
    });

    expect(transformed).toMatchObject({
      sessionContinue: false,
      cacheSession: {
        key: 'issue:99',
        persist: true,
      },
    });
  });

  it('persists cache session metadata for successful native-capable executions', async () => {
    const { spawnFn } = createMockSpawn({ stdout: 'ok', exitCode: 0 });
    const adapter = new CliLlmAdapter(new ClaudeProvider(), { workingDir: '/tmp/test' }, spawnFn);

    const transformed = adapter.transformRequest({
      id: 'req-native',
      messages: [{ role: 'user', content: 'continue work' }],
      cacheSession: {
        key: 'issue:99',
        persist: true,
      },
    });

    await adapter.execute(transformed);

    expect(adapter.consumeSessionMetadata('req-native')).toMatchObject({
      provider: 'claude',
      sessionKey: 'issue:99',
    });
  });

  it('does not persist cache session metadata when execution fails', async () => {
    const { spawnFn } = createMockSpawn({ stderr: 'boom', exitCode: 1 });
    const adapter = new CliLlmAdapter(new ClaudeProvider(), { workingDir: '/tmp/test' }, spawnFn);

    const transformed = adapter.transformRequest({
      id: 'req-fail',
      messages: [{ role: 'user', content: 'continue work' }],
      cacheSession: {
        key: 'issue:99',
        persist: true,
      },
    });

    await expect(adapter.execute(transformed)).rejects.toThrow();
    expect(adapter.consumeSessionMetadata('req-fail')).toBeUndefined();
  });
});
