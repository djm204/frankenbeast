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

describe('ProcessSupervisor', () => {
  let supervisor: ProcessSupervisor;

  beforeEach(() => {
    supervisor = new ProcessSupervisor();
  });

  afterEach(async () => {
    // Clean up any remaining processes
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

    it('captures stdout lines via onStdout callback', async () => {
      const callbacks = makeCallbacks();
      const spec = makeSpec({
        command: 'node',
        args: ['-e', 'console.log("line1"); console.log("line2");'],
      });

      await supervisor.spawn(spec, callbacks);

      await vi.waitFor(() => {
        expect(callbacks.onExit).toHaveBeenCalled();
      }, { timeout: 5000 });

      expect(callbacks.onStdout).toHaveBeenCalledWith('line1');
      expect(callbacks.onStdout).toHaveBeenCalledWith('line2');
    });

    it('captures stderr lines via onStderr callback', async () => {
      const callbacks = makeCallbacks();
      const spec = makeSpec({
        command: 'node',
        args: ['-e', 'console.error("err1"); console.error("err2");'],
      });

      await supervisor.spawn(spec, callbacks);

      await vi.waitFor(() => {
        expect(callbacks.onExit).toHaveBeenCalled();
      }, { timeout: 5000 });

      expect(callbacks.onStderr).toHaveBeenCalledWith('err1');
      expect(callbacks.onStderr).toHaveBeenCalledWith('err2');
    });

    it('strips CLAUDE env vars from spawned process environment', async () => {
      // Set some CLAUDE* env vars temporarily
      const originalEnv = { ...process.env };
      process.env['CLAUDE_CODE_ENTRYPOINT'] = 'test-value';
      process.env['CLAUDE_SESSION'] = 'test-session';

      try {
        const callbacks = makeCallbacks();
        const spec = makeSpec({
          command: 'node',
          args: ['-e', `
            const claudeVars = Object.keys(process.env).filter(k => k.startsWith('CLAUDE'));
            console.log(JSON.stringify(claudeVars));
          `],
        });

        await supervisor.spawn(spec, callbacks);

        await vi.waitFor(() => {
          expect(callbacks.onExit).toHaveBeenCalled();
        }, { timeout: 5000 });

        const stdoutCalls = (callbacks.onStdout as ReturnType<typeof vi.fn>).mock.calls;
        const output = stdoutCalls.map(c => c[0]).join('');
        const claudeVars = JSON.parse(output);
        expect(claudeVars).toEqual([]);
      } finally {
        // Restore env
        delete process.env['CLAUDE_CODE_ENTRYPOINT'];
        delete process.env['CLAUDE_SESSION'];
        Object.assign(process.env, originalEnv);
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

  describe('spawn without callbacks (backward compatibility)', () => {
    it('returns a handle with pid when no callbacks provided', async () => {
      const spec = makeSpec({ command: 'echo', args: ['hello'] });

      const handle = await supervisor.spawn(spec);

      expect(handle.pid).toBeGreaterThan(0);
    });
  });
});
