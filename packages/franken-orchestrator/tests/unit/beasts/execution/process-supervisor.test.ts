import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProcessSupervisor } from '../../../../src/beasts/execution/process-supervisor.js';
import type { ProcessCallbacks } from '../../../../src/beasts/execution/process-supervisor.js';
import type { BeastProcessSpec } from '../../../../src/beasts/types.js';

function makeSpec(overrides: Partial<BeastProcessSpec> = {}): BeastProcessSpec {
  return {
    command: 'echo',
    args: ['hello'],
    cwd: undefined,
    env: undefined,
    ...overrides,
  };
}

function makeCallbacks(overrides: Partial<ProcessCallbacks> = {}): ProcessCallbacks {
  return {
    onStdout: vi.fn(),
    onStderr: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
}

function isProcessGone(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      return true;
    }
    throw error;
  }
}

async function killIfRunning(pid: number): Promise<void> {
  if (pid <= 0 || isProcessGone(pid)) {
    return;
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      throw error;
    }
  }
}

describe('ProcessSupervisor', () => {
  let supervisor: ProcessSupervisor;
  let workDir: string | undefined;

  beforeEach(() => {
    supervisor = new ProcessSupervisor();
  });

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
      workDir = undefined;
    }
  });

  describe('spawn with callbacks', () => {
    it('calls onExit callback when spawned process exits', async () => {
      const callbacks = makeCallbacks();
      const spec = makeSpec({ command: 'echo', args: ['hello'] });

      const handle = await supervisor.spawn(spec, callbacks);

      expect(handle.pid).toBeGreaterThan(0);

      // Wait for exit callback
      await vi.waitFor(() => {
        expect(callbacks.onExit).toHaveBeenCalledWith(0, null);
      }, { timeout: 5000 });
    });

    it('calls onExit with non-zero code for failing process', async () => {
      const callbacks = makeCallbacks();
      const spec = makeSpec({ command: 'node', args: ['-e', 'process.exit(42)'] });

      await supervisor.spawn(spec, callbacks);

      await vi.waitFor(() => {
        expect(callbacks.onExit).toHaveBeenCalledWith(42, null);
      }, { timeout: 5000 });
    });

    it('handles child process error events for missing commands without crashing', async () => {
      const callbacks = makeCallbacks();
      const spec = makeSpec({ command: '/definitely/not-a-real-command-franken-698', args: [] });

      await expect(supervisor.spawn(spec, callbacks)).rejects.toMatchObject({ code: 'ENOENT' });

      await vi.waitFor(() => {
        expect(callbacks.onStderr).toHaveBeenCalledWith(expect.stringContaining('Process spawn failed'));
      }, { timeout: 5000 });
    });

    it('cleans up resources after runtime child process errors', async () => {
      const callbacks = makeCallbacks();
      const handlers: Record<string, (...args: unknown[]) => void> = {};

      const fakeStdout = new EventEmitter() as EventEmitter & {
        setEncoding: (encoding: BufferEncoding) => void;
        destroy: () => void;
      };
      fakeStdout.setEncoding = vi.fn();
      fakeStdout.destroy = vi.fn();

      const fakeStderr = new EventEmitter() as EventEmitter & {
        setEncoding: (encoding: BufferEncoding) => void;
        destroy: () => void;
      };
      fakeStderr.setEncoding = vi.fn();
      fakeStderr.destroy = vi.fn();

      const fakeChild: {
        pid: number;
        stdout: unknown;
        stderr: unknown;
        kill: ReturnType<typeof vi.fn>;
        on: ReturnType<typeof vi.fn>;
        once: ReturnType<typeof vi.fn>;
        removeListener: ReturnType<typeof vi.fn>;
      } = {
        pid: 41234,
        stdout: fakeStdout,
        stderr: fakeStderr,
        kill: vi.fn(),
        on: vi.fn((event, listener) => {
          handlers[event] = listener;
          return fakeChild as any;
        }),
        once: vi.fn((event, listener) => {
          handlers[event] = listener;
          return fakeChild as any;
        }),
        removeListener: vi.fn((event, listener) => {
          if (handlers[event] === listener) {
            delete handlers[event];
          }
          return fakeChild as any;
        }),
      };

      supervisor = new ProcessSupervisor({
        spawn: vi.fn(() => fakeChild as never),
      });

      const spawnPromise = supervisor.spawn(makeSpec(), callbacks);
      handlers.error?.(new Error('runtime pipe break'));

      await vi.waitFor(() => {
        expect(callbacks.onExit).toHaveBeenCalledWith(1, null);
      }, { timeout: 1000 });

      expect(callbacks.onStderr).toHaveBeenCalledWith(expect.stringContaining('Process spawn failed for echo: runtime pipe break'));
      expect(fakeChild.kill).toHaveBeenCalledWith('SIGTERM');
      expect(fakeChild.removeListener).toHaveBeenCalledWith('exit', expect.any(Function));
      expect(fakeChild.removeListener).toHaveBeenCalledWith('close', expect.any(Function));

      // Ensure runtime error does not double-fire onExit if process events are later emitted
      handlers.exit?.(1, null);
      expect(callbacks.onExit).toHaveBeenCalledTimes(1);

      await spawnPromise;
    });

    it('captures stdout lines via onStdout callback', async () => {
      const callbacks = makeCallbacks();
      const spec = makeSpec({
        command: '/bin/sh',
        args: ['-c', 'printf "line1\\nline2\\n"'],
      });

      await supervisor.spawn(spec, callbacks);

      await vi.waitFor(() => {
        expect(callbacks.onExit).toHaveBeenCalled();
      }, { timeout: 5000 });

      expect(callbacks.onStdout).toHaveBeenCalledWith('line1');
      expect(callbacks.onStdout).toHaveBeenCalledWith('line2');
    });

    it('streams carriage-return terminated stdout updates separately', async () => {
      const callbacks = makeCallbacks();
      const spec = makeSpec({
        command: '/bin/sh',
        args: ['-c', 'printf "step1\\rstep2\\rdone\\n"'],
      });

      await supervisor.spawn(spec, callbacks);

      await vi.waitFor(() => {
        expect(callbacks.onExit).toHaveBeenCalled();
      }, { timeout: 5000 });

      expect(callbacks.onStdout).toHaveBeenCalledWith('step1');
      expect(callbacks.onStdout).toHaveBeenCalledWith('step2');
      expect(callbacks.onStdout).toHaveBeenCalledWith('done');
    });

    it('flushes CR-only stdout progress before the next chunk arrives', async () => {
      const callbacks = makeCallbacks();
      const spec = makeSpec({
        command: process.execPath,
        args: ['-e', "process.stdout.write('step1\\r'); setTimeout(() => process.exit(0), 1000);"],
      });

      await supervisor.spawn(spec, callbacks);

      await vi.waitFor(() => {
        expect(callbacks.onStdout).toHaveBeenCalledWith('step1');
      }, { timeout: 500 });
      expect(callbacks.onExit).not.toHaveBeenCalled();

      await vi.waitFor(() => {
        expect(callbacks.onExit).toHaveBeenCalledWith(0, null);
      }, { timeout: 5000 });
    });

    it('does not emit blank lines for CRLF split across stdout chunks', async () => {
      const callbacks = makeCallbacks();
      const spec = makeSpec({
        command: process.execPath,
        args: [
          '-e',
          "process.stdout.write('one\\r'); setImmediate(() => process.stdout.write('\\ntwo\\r\\n'));",
        ],
      });

      await supervisor.spawn(spec, callbacks);

      await vi.waitFor(() => {
        expect(callbacks.onExit).toHaveBeenCalled();
      }, { timeout: 5000 });

      expect(callbacks.onStdout).toHaveBeenCalledTimes(2);
      expect(callbacks.onStdout).toHaveBeenNthCalledWith(1, 'one');
      expect(callbacks.onStdout).toHaveBeenNthCalledWith(2, 'two');
    });

    it('captures stderr lines via onStderr callback', async () => {
      const callbacks = makeCallbacks();
      const spec = makeSpec({
        command: '/bin/sh',
        args: ['-c', 'printf "err1\\nerr2\\n" 1>&2'],
      });

      await supervisor.spawn(spec, callbacks);

      await vi.waitFor(() => {
        expect(callbacks.onExit).toHaveBeenCalled();
      }, { timeout: 5000 });

      expect(callbacks.onStderr).toHaveBeenCalledWith('err1');
      expect(callbacks.onStderr).toHaveBeenCalledWith('err2');
    });

    it('delivers all stderr lines before onExit for an immediate failing process', async () => {
      const observed: string[] = [];
      const callbacks = makeCallbacks({
        onStderr: vi.fn((line: string) => {
          observed.push(`stderr:${line}`);
        }),
        onExit: vi.fn((code: number | null, signal: string | null) => {
          observed.push(`exit:${code}:${signal}`);
        }),
      });
      const spec = makeSpec({
        command: '/bin/sh',
        args: ['-c', 'printf "boom\\nstack trace here\\n" 1>&2; exit 1'],
      });

      await supervisor.spawn(spec, callbacks);

      await vi.waitFor(() => {
        expect(callbacks.onExit).toHaveBeenCalledWith(1, null);
      }, { timeout: 5000 });

      expect(observed).toEqual([
        'stderr:boom',
        'stderr:stack trace here',
        'exit:1:null',
      ]);
    });

    it('fires onExit promptly when a grandchild keeps inherited stdio open', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-supervisor-grandchild-'));
      const pidFile = join(workDir, 'grandchild.pid');
      const callbacks = makeCallbacks();
      const spec = makeSpec({
        command: process.execPath,
        args: [
          '-e',
          `const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
  detached: true,
  stdio: 'inherit',
});
process.stdout.write('final partial stdout');
require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
child.unref();`,
        ],
      });

      try {
        await supervisor.spawn(spec, callbacks);

        await vi.waitFor(() => {
          expect(callbacks.onExit).toHaveBeenCalledWith(0, null);
        }, { timeout: 500 });
        expect(callbacks.onStdout).toHaveBeenCalledWith('final partial stdout');
      } finally {
        const grandchildPid = Number(await readFile(pidFile, 'utf8').catch(() => '0'));
        if (grandchildPid > 0) {
          try {
            process.kill(grandchildPid, 'SIGKILL');
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
              throw error;
            }
          }
        }
      }
    });

    it('sweeps background descendants in the supervised process group after parent exit', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-supervisor-orphan-sweep-'));
      const pidFile = join(workDir, 'background.pid');
      const callbacks = makeCallbacks();
      const spec = makeSpec({
        command: process.execPath,
        args: [
          '-e',
          `const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
  stdio: 'ignore',
});
child.unref();
require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
process.stdout.write('parent done\\n');`,
        ],
      });

      let backgroundPid = 0;
      try {
        await supervisor.spawn(spec, callbacks);

        await vi.waitFor(() => {
          expect(callbacks.onExit).toHaveBeenCalledWith(0, null);
        }, { timeout: 5000 });

        backgroundPid = Number(await readFile(pidFile, 'utf8'));
        expect(backgroundPid).toBeGreaterThan(0);
        await vi.waitFor(() => {
          expect(isProcessGone(backgroundPid)).toBe(true);
        }, { timeout: 5000 });
      } finally {
        await killIfRunning(backgroundPid);
      }
    });

    it('reports unsupported platforms without attempting process-group cleanup', () => {
      const killProcess = vi.fn();
      const windowsSupervisor = new ProcessSupervisor({
        orphanSweeper: {
          platform: 'win32',
          killProcess,
        },
      });

      expect(windowsSupervisor.sweepOrphanProcessGroup(12345)).toEqual({
        pid: 12345,
        signal: 'SIGTERM',
        swept: false,
        skippedReason: 'unsupported_platform',
      });
      expect(killProcess).not.toHaveBeenCalled();
    });

    it('strips CLAUDE env vars from spawned process environment', async () => {
      // Set some CLAUDE* env vars temporarily
      const originalEnv = { ...process.env };
      process.env['CLAUDE_CODE_ENTRYPOINT'] = 'test-value';
      process.env['CLAUDE_SESSION'] = 'test-session';

      try {
        const callbacks = makeCallbacks();
        const spec = makeSpec({
          command: '/bin/sh',
          args: ['-c', 'env | grep "^CLAUDE" || true'],
        });

        await supervisor.spawn(spec, callbacks);

        await vi.waitFor(() => {
          expect(callbacks.onExit).toHaveBeenCalled();
        }, { timeout: 5000 });

        const stdoutCalls = (callbacks.onStdout as ReturnType<typeof vi.fn>).mock.calls;
        const output = stdoutCalls.map(c => c[0]).join('');
        expect(output).toBe('');
      } finally {
        // Restore env
        delete process.env['CLAUDE_CODE_ENTRYPOINT'];
        delete process.env['CLAUDE_SESSION'];
        Object.assign(process.env, originalEnv);
      }
    });

    it('does not inherit arbitrary host env into the child process', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-supervisor-env-'));
      const originalEnv = { ...process.env };
      process.env.GITHUB_TOKEN = 'ghp_should_not_leak';
      process.env.SECRET_X = 'nope';
      process.env.PATH = originalEnv.PATH ?? '';
      const callbacks = makeCallbacks();
      const envLines: string[] = [];
      callbacks.onStdout = vi.fn((line: string) => envLines.push(line));

      try {
        await new ProcessSupervisor({ projectRoot: workDir }).spawn({
          command: process.execPath,
          args: ['-e', 'process.stdout.write(JSON.stringify(process.env) + "\\n")'],
          cwd: workDir,
          env: { FRANKENBEAST_RUN_CONFIG: '/x' },
        }, callbacks);

        await vi.waitFor(() => {
          expect(callbacks.onExit).toHaveBeenCalledWith(0, null);
        }, { timeout: 5000 });

        const seen = JSON.parse(envLines.join('')) as Record<string, string>;
        expect(seen.GITHUB_TOKEN).toBeUndefined();
        expect(seen.SECRET_X).toBeUndefined();
        expect(seen.FRANKENBEAST_RUN_CONFIG).toBe('/x');
        expect(seen.PATH).toBeTruthy();
      } finally {
        process.env = originalEnv;
      }
    });

    it('rejects a cwd outside the configured project root', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-supervisor-cwd-'));
      const outside = await mkdtemp(join(tmpdir(), 'franken-supervisor-outside-'));
      try {
        await expect(new ProcessSupervisor({ projectRoot: workDir }).spawn(
          { command: process.execPath, args: ['-e', 'process.exit(0)'], cwd: outside },
          makeCallbacks(),
        )).rejects.toThrow(/cwd.*outside.*root/i);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });

    it('rejects a cwd symlink that resolves outside the configured project root', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'franken-supervisor-cwd-'));
      const outside = await mkdtemp(join(tmpdir(), 'franken-supervisor-outside-'));
      const symlinked = join(workDir, 'linked-outside');
      try {
        await symlink(outside, symlinked, 'dir');
        await expect(new ProcessSupervisor({ projectRoot: workDir }).spawn(
          { command: process.execPath, args: ['-e', 'process.exit(0)'], cwd: symlinked },
          makeCallbacks(),
        )).rejects.toThrow(/cwd.*outside.*root/i);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });
  });

  describe('stop via internal registry', () => {
    it('stops a running process using internal ChildProcess handle', async () => {
      const callbacks = makeCallbacks();
      const spec = makeSpec({
        command: 'node',
        args: ['-e', 'setTimeout(() => {}, 60000)'],
      });

      const handle = await supervisor.spawn(spec, callbacks);

      await supervisor.stop(handle.pid);

      await vi.waitFor(() => {
        expect(callbacks.onExit).toHaveBeenCalled();
      }, { timeout: 5000 });

      const [code, signal] = (callbacks.onExit as ReturnType<typeof vi.fn>).mock.calls[0];
      // SIGTERM results in null code and 'SIGTERM' signal
      expect(code).toBeNull();
      expect(signal).toBe('SIGTERM');
    });

    it('stop is a no-op for pid <= 0', async () => {
      // Should not throw
      await expect(supervisor.stop(0)).resolves.toBeUndefined();
      await expect(supervisor.stop(-1)).resolves.toBeUndefined();
    });

    it('stop ignores already-exited processes gracefully', async () => {
      const callbacks = makeCallbacks();
      const spec = makeSpec({ command: 'echo', args: ['done'] });

      const handle = await supervisor.spawn(spec, callbacks);

      await vi.waitFor(() => {
        expect(callbacks.onExit).toHaveBeenCalled();
      }, { timeout: 5000 });

      // Process already exited, stop should not throw
      await expect(supervisor.stop(handle.pid)).resolves.toBeUndefined();
    });
  });

  describe('kill via internal registry', () => {
    it('kills a running process using internal ChildProcess handle', async () => {
      const callbacks = makeCallbacks();
      const spec = makeSpec({
        command: 'node',
        args: ['-e', 'setTimeout(() => {}, 60000)'],
      });

      const handle = await supervisor.spawn(spec, callbacks);

      await supervisor.kill(handle.pid);

      await vi.waitFor(() => {
        expect(callbacks.onExit).toHaveBeenCalled();
      }, { timeout: 5000 });

      const [code, signal] = (callbacks.onExit as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(code).toBeNull();
      expect(signal).toBe('SIGKILL');
    });

    it('kill is a no-op for pid <= 0', async () => {
      await expect(supervisor.kill(0)).resolves.toBeUndefined();
      await expect(supervisor.kill(-1)).resolves.toBeUndefined();
    });

    it('kill ignores already-exited processes gracefully', async () => {
      const callbacks = makeCallbacks();
      const spec = makeSpec({ command: 'echo', args: ['done'] });

      const handle = await supervisor.spawn(spec, callbacks);

      await vi.waitFor(() => {
        expect(callbacks.onExit).toHaveBeenCalled();
      }, { timeout: 5000 });

      await expect(supervisor.kill(handle.pid)).resolves.toBeUndefined();
    });
  });

});
