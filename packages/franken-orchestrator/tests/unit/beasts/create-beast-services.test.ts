import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const processExecutorConstructor = vi.hoisted(() => vi.fn());

vi.mock('../../../src/beasts/execution/process-beast-executor.js', () => ({
  ProcessBeastExecutor: class ProcessBeastExecutorMock {
    readonly start = vi.fn();
    readonly stop = vi.fn();
    readonly kill = vi.fn();

    constructor(...args: unknown[]) {
      processExecutorConstructor(...args);
    }
  },
}));

describe('createBeastServices', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    delete process.env.FBEAST_AGENT_CAPACITY_TOTAL;
    delete process.env.FBEAST_AGENT_CAPACITY_RESERVATIONS;
    delete process.env.FBEAST_AGENT_CAPACITY_RELEASED_RESERVATIONS;
    processExecutorConstructor.mockClear();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      tempDir = undefined;
    }
  });

  it('passes a run-config directory under the resolved project .fbeast build path', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-create-beast-services-'));
    const parentCwd = join(tempDir, 'parent-cwd');
    const projectRoot = join(tempDir, 'target-project');
    const originalCwd = process.cwd();
    const { mkdir } = await import('node:fs/promises');
    await mkdir(parentCwd, { recursive: true });
    await mkdir(projectRoot, { recursive: true });

    try {
      process.chdir(parentCwd);
      const { createBeastServices } = await import('../../../src/beasts/create-beast-services.js');
      const services = createBeastServices({
        beastsDb: join(projectRoot, '.fbeast', 'beast.db'),
        beastLogsDir: join(projectRoot, '.fbeast', 'logs'),
        root: projectRoot,
      });

      const expectedRunConfigDir = join(resolve(projectRoot), '.fbeast', '.build', 'run-configs');
      const matchingCall = processExecutorConstructor.mock.calls.find(([, , , options]) => (
        options as { runConfigDir?: string } | undefined
      )?.runConfigDir === expectedRunConfigDir);
      expect(matchingCall).toBeDefined();
      const [, , supervisor, options] = matchingCall!;
      expect(options).toMatchObject({ runConfigDir: expectedRunConfigDir, runConfigRoot: resolve(projectRoot) });
      expect(supervisor).toMatchObject({ options: { projectRoot: resolve(projectRoot) } });

      services.dispose();
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('fails fast when reservation rules are configured without total capacity', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-create-beast-services-'));
    process.env.FBEAST_AGENT_CAPACITY_RESERVATIONS = JSON.stringify([
      { id: 'security-urgent', slots: 1, labels: ['security'] },
    ]);
    const { createBeastServices } = await import('../../../src/beasts/create-beast-services.js');

    expect(() => createBeastServices({
      beastsDb: join(tempDir!, 'beast.db'),
      beastLogsDir: join(tempDir!, 'logs'),
      root: tempDir!,
    })).toThrow(/FBEAST_AGENT_CAPACITY_TOTAL is required/);
  });
});