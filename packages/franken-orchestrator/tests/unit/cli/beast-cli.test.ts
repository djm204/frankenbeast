import { beforeEach, describe, it, expect, vi } from 'vitest';
import { handleBeastCommand } from '../../../src/cli/beast-cli.js';
import type { CliArgs } from '../../../src/cli/args.js';
import type { ProjectPaths } from '../../../src/cli/project-root.js';
import { spawnSync } from 'node:child_process';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0, stderr: '' })),
}));

const mockServices = vi.hoisted(() => ({
  catalog: {
    listDefinitions: vi.fn(),
    getDefinition: vi.fn(),
  },
  dispatch: {
    createRun: vi.fn(),
  },
  runs: {
    listRuns: vi.fn(),
    getRun: vi.fn(),
    listAttempts: vi.fn(),
    readLogs: vi.fn(),
    stop: vi.fn(),
    kill: vi.fn(),
    restart: vi.fn(),
  },
  dispose: vi.fn(),
}));

vi.mock('../../../src/beasts/create-beast-services.js', () => ({
  createBeastServices: () => mockServices,
}));

const mockControlClient = vi.hoisted(() => ({
  createBeastControlClient: vi.fn(() => ({
    getAgentRunId: vi.fn().mockReturnValue('run-42'),
    deleteAgent: vi.fn().mockResolvedValue({ id: 'agent-1' }),
    dispose: vi.fn(),
    resumeAgent: vi.fn().mockResolvedValue({ id: 'run-42', status: 'failed' }),
  })),
}));

vi.mock('../../../src/cli/beast-control-client.js', () => ({
  createBeastControlClient: mockControlClient.createBeastControlClient,
}));

function makeDeps(overrides: Partial<Parameters<typeof handleBeastCommand>[0]> = {}): Parameters<typeof handleBeastCommand>[0] {
  return {
    args: { subcommand: 'beasts' as const, beastAction: undefined, networkDetached: false, baseDir: '/tmp', budget: 10, provider: 'claude', noPr: false, verbose: false, reset: false, resume: false, cleanup: false, help: false, initVerify: false, initRepair: false, initNonInteractive: false } as CliArgs,
    io: { ask: vi.fn(), confirm: vi.fn(), choose: vi.fn(), print: vi.fn() } as any,
    paths: { root: '/tmp', fbeast: '/tmp/.fbeast' } as unknown as ProjectPaths,
    print: vi.fn(),
    control: {
      listRuns: vi.fn(),
      getRun: vi.fn(),
      getAgentRunId: vi.fn().mockReturnValue('run-42'),
      readLogs: vi.fn(),
      stopRun: vi.fn(),
      restartRun: vi.fn(),
      resumeAgent: vi.fn().mockResolvedValue({ id: 'run-42', status: 'running', currentAttemptId: 'attempt-42' }),
      deleteAgent: vi.fn().mockResolvedValue({ id: 'agent-1' }),
      createRun: vi.fn(),
      dispose: vi.fn(),
    },
    ...overrides,
  };
}

const baselineSigintListeners = process.listeners('SIGINT');
const baselineSigtermListeners = process.listeners('SIGTERM');
const baselineSighupListeners = process.listeners('SIGHUP');

beforeEach(() => {
  for (const listener of process.listeners('SIGINT')) {
    if (!baselineSigintListeners.includes(listener)) process.off('SIGINT', listener as NodeJS.SignalsListener);
  }
  for (const listener of process.listeners('SIGTERM')) {
    if (!baselineSigtermListeners.includes(listener)) process.off('SIGTERM', listener as NodeJS.SignalsListener);
  }
  for (const listener of process.listeners('SIGHUP')) {
    if (!baselineSighupListeners.includes(listener)) process.off('SIGHUP', listener as NodeJS.SignalsListener);
  }
  vi.clearAllMocks();
  vi.mocked(spawnSync).mockReturnValue({ status: 0, stderr: '' } as any);
});

describe('handleBeastCommand() catalog', () => {
  it('prints fixed Beast definitions and disposes services so the CLI can exit', async () => {
    mockServices.catalog.listDefinitions.mockReturnValue([
      { id: 'design-interview', description: 'Design interview' },
      { id: 'chunk-plan', description: 'Chunk plan' },
    ]);
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'catalog' } as CliArgs,
    });

    await handleBeastCommand(deps);

    expect(deps.print).toHaveBeenCalledWith('design-interview: Design interview\nchunk-plan: Chunk plan');
    expect(mockServices.dispose).toHaveBeenCalledTimes(1);
  });

  it('removes the SIGHUP cleanup handler after short-lived commands finish', async () => {
    mockServices.catalog.listDefinitions.mockReturnValue([]);
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'catalog' } as CliArgs,
    });

    await handleBeastCommand(deps);

    expect(process.listeners('SIGHUP')).toEqual(baselineSighupListeners);
  });
});

describe('handleBeastCommand() spawn', () => {
  it('leaves services alive after starting an in-process executor', async () => {
    mockServices.catalog.getDefinition.mockReturnValue({
      id: 'design-interview',
      description: 'Design interview',
      interviewPrompts: [],
      configSchema: { parse: vi.fn(() => ({})) },
    });
    mockServices.dispatch.createRun.mockResolvedValue({
      id: 'run-1',
      definitionId: 'design-interview',
      status: 'running',
      currentAttemptId: 'attempt-1',
    });
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'spawn', beastTarget: 'design-interview' } as CliArgs,
    });

    await handleBeastCommand(deps);

    expect(mockServices.dispatch.createRun).toHaveBeenCalledWith(expect.objectContaining({
      definitionId: 'design-interview',
      executionMode: 'process',
      startNow: true,
    }));
    expect(deps.print).toHaveBeenCalledWith('Spawned design-interview as run-1');
    expect(mockServices.dispose).not.toHaveBeenCalled();
  });

  it('passes --mode container through to dispatch after validating Docker', async () => {
    mockServices.catalog.getDefinition.mockReturnValue({
      id: 'design-interview',
      description: 'Design interview',
      interviewPrompts: [],
      configSchema: { parse: vi.fn(() => ({})) },
    });
    mockServices.dispatch.createRun.mockResolvedValue({
      id: 'run-1',
      definitionId: 'design-interview',
      status: 'running',
      currentAttemptId: 'attempt-1',
    });
    const deps = makeDeps({
      args: {
        subcommand: 'beasts',
        beastAction: 'spawn',
        beastTarget: 'design-interview',
        beastExecutionMode: 'container',
      } as CliArgs,
    });

    await handleBeastCommand(deps);

    expect(spawnSync).toHaveBeenCalledWith('docker', ['version', '--format', '{{.Server.Version}}'], expect.any(Object));
    expect(mockServices.dispatch.createRun).toHaveBeenCalledWith(expect.objectContaining({
      definitionId: 'design-interview',
      executionMode: 'container',
      startNow: true,
    }));
  });

  it('fails container mode with a clean actionable error when Docker is unavailable', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stderr: 'Cannot connect to the Docker daemon' } as any);
    mockServices.catalog.getDefinition.mockReturnValue({
      id: 'design-interview',
      description: 'Design interview',
      interviewPrompts: [],
      configSchema: { parse: vi.fn(() => ({})) },
    });
    const deps = makeDeps({
      args: {
        subcommand: 'beasts',
        beastAction: 'spawn',
        beastTarget: 'design-interview',
        beastExecutionMode: 'container',
      } as CliArgs,
    });

    await expect(handleBeastCommand(deps)).rejects.toThrow('Container Beast execution requires a working Docker runtime');
    expect(mockServices.dispatch.createRun).not.toHaveBeenCalled();
  });

  it('disposes services if spawn fails before a run is started', async () => {
    mockServices.catalog.getDefinition.mockReturnValue(undefined);
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'spawn', beastTarget: 'missing' } as CliArgs,
    });

    await expect(handleBeastCommand(deps)).rejects.toThrow('Unknown Beast definition: missing');
    expect(mockServices.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes services if spawn returns a failed run after executor start fails', async () => {
    mockServices.catalog.getDefinition.mockReturnValue({
      id: 'design-interview',
      description: 'Design interview',
      interviewPrompts: [],
      configSchema: { parse: vi.fn(() => ({})) },
    });
    mockServices.dispatch.createRun.mockResolvedValue({
      id: 'run-1',
      definitionId: 'design-interview',
      status: 'failed',
      currentAttemptId: undefined,
    });
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'spawn', beastTarget: 'design-interview' } as CliArgs,
    });

    await handleBeastCommand(deps);

    expect(deps.print).toHaveBeenCalledWith('Spawned design-interview as run-1');
    expect(mockServices.dispose).toHaveBeenCalledTimes(1);
  });

  it('forwards SIGINT to a live direct spawn run before disposing services', async () => {
    mockServices.catalog.getDefinition.mockReturnValue({
      id: 'design-interview',
      description: 'Design interview',
      interviewPrompts: [],
      configSchema: { parse: vi.fn(() => ({})) },
    });
    mockServices.dispatch.createRun.mockResolvedValue({
      id: 'run-1',
      definitionId: 'design-interview',
      status: 'running',
      currentAttemptId: 'attempt-1',
    });
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'spawn', beastTarget: 'design-interview' } as CliArgs,
    });

    try {
      await handleBeastCommand(deps);
      process.emit('SIGINT');
      await vi.waitFor(() => {
        expect(mockServices.runs.kill).toHaveBeenCalledWith('run-1', expect.any(String));
        expect(mockServices.dispose).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledWith(130);
      });
    } finally {
      exit.mockRestore();
    }
  });

  it('tracks a run created before start finishes so SIGINT can clean up pending spawns', async () => {
    mockServices.catalog.getDefinition.mockReturnValue({
      id: 'design-interview',
      description: 'Design interview',
      interviewPrompts: [],
      configSchema: { parse: vi.fn(() => ({})) },
    });
    let resolveCreateRun: ((run: unknown) => void) | undefined;
    mockServices.dispatch.createRun.mockImplementation(async (request: { onRunCreated?: (run: { id: string }) => void }) => {
      request.onRunCreated?.({ id: 'run-1' });
      return await new Promise((resolve) => {
        resolveCreateRun = resolve;
      });
    });
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'spawn', beastTarget: 'design-interview' } as CliArgs,
    });

    try {
      const command = handleBeastCommand(deps);
      await vi.waitFor(() => expect(mockServices.dispatch.createRun).toHaveBeenCalled());
      process.emit('SIGINT');
      await vi.waitFor(() => {
        expect(mockServices.runs.kill).toHaveBeenCalledWith('run-1', expect.any(String));
        expect(mockServices.dispose).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledWith(130);
      });
      resolveCreateRun?.({ id: 'run-1', definitionId: 'design-interview', status: 'stopped', currentAttemptId: undefined });
      await command;
    } finally {
      exit.mockRestore();
    }
  });

  it('forwards SIGHUP to a live direct spawn run before exiting with hangup status', async () => {
    mockServices.catalog.getDefinition.mockReturnValue({
      id: 'design-interview',
      description: 'Design interview',
      interviewPrompts: [],
      configSchema: { parse: vi.fn(() => ({})) },
    });
    mockServices.dispatch.createRun.mockResolvedValue({
      id: 'run-1',
      definitionId: 'design-interview',
      status: 'running',
      currentAttemptId: 'attempt-1',
    });
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'spawn', beastTarget: 'design-interview' } as CliArgs,
    });

    try {
      await handleBeastCommand(deps);
      process.emit('SIGHUP');
      await vi.waitFor(() => {
        expect(mockServices.runs.kill).toHaveBeenCalledWith('run-1', expect.any(String));
        expect(mockServices.dispose).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledWith(129);
      });
    } finally {
      exit.mockRestore();
    }
  });

  it('tracks the restart target before restart finishes so SIGINT can stop the old run', async () => {
    let resolveRestart: ((run: unknown) => void) | undefined;
    mockServices.runs.restart.mockImplementation(async () => await new Promise((resolve) => {
      resolveRestart = resolve;
    }));
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'restart', beastTarget: 'run-1' } as CliArgs,
    });

    try {
      const command = handleBeastCommand(deps);
      await vi.waitFor(() => expect(mockServices.runs.restart).toHaveBeenCalledWith('run-1', expect.any(String)));
      process.emit('SIGINT');
      await vi.waitFor(() => {
        expect(mockServices.runs.kill).toHaveBeenCalledWith('run-1', expect.any(String));
        expect(mockServices.dispose).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledWith(130);
      });
      resolveRestart?.({ id: 'run-1', status: 'stopped' });
      await command;
    } finally {
      exit.mockRestore();
    }
  });

  it('does not rewrite terminal run state when a signal arrives after completion', async () => {
    mockServices.catalog.getDefinition.mockReturnValue({
      id: 'design-interview',
      description: 'Design interview',
      interviewPrompts: [],
      configSchema: { parse: vi.fn(() => ({})) },
    });
    mockServices.dispatch.createRun.mockResolvedValue({
      id: 'run-1',
      definitionId: 'design-interview',
      status: 'running',
      currentAttemptId: 'attempt-1',
    });
    mockServices.runs.getRun.mockReturnValue({ id: 'run-1', status: 'completed' });
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'spawn', beastTarget: 'design-interview' } as CliArgs,
    });

    try {
      await handleBeastCommand(deps);
      process.emit('SIGINT');
      await vi.waitFor(() => {
        expect(mockServices.runs.kill).not.toHaveBeenCalled();
        expect(mockServices.dispose).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledWith(130);
      });
    } finally {
      exit.mockRestore();
    }
  });
});

describe('handleBeastCommand() status and logs', () => {
  it('throws for an unknown status run id instead of printing undefined', async () => {
    mockServices.runs.getRun.mockReturnValue(undefined);
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'status', beastTarget: 'missing-run' } as CliArgs,
    });

    await expect(handleBeastCommand(deps)).rejects.toThrow('Unknown Beast run: missing-run');
    expect(deps.print).not.toHaveBeenCalled();
    expect(mockServices.runs.listAttempts).not.toHaveBeenCalled();
    expect(mockServices.dispose).toHaveBeenCalledTimes(1);
  });

  it('renders current attempt container metadata in status output', async () => {
    mockServices.runs.getRun.mockReturnValue({
      id: 'run-1',
      definitionId: 'design-interview',
      executionMode: 'container',
      status: 'running',
      currentAttemptId: 'attempt-1',
    });
    mockServices.runs.listAttempts.mockReturnValue([
      {
        id: 'attempt-1',
        runId: 'run-1',
        attemptNumber: 1,
        status: 'running',
        executorMetadata: { containerId: 'abc123', image: 'fbeast/sandbox:latest' },
      },
    ]);
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'status', beastTarget: 'run-1', beastExecutionMode: 'container' } as CliArgs,
    });

    await handleBeastCommand(deps);

    const payload = JSON.parse(vi.mocked(deps.print).mock.calls[0]?.[0] as string);
    expect(payload.container).toEqual({ containerId: 'abc123', image: 'fbeast/sandbox:latest' });
    expect(payload.currentAttempt.executorMetadata.containerId).toBe('abc123');
  });

  it('prefixes container logs with container metadata when available', async () => {
    mockServices.runs.getRun.mockReturnValue({
      id: 'run-1',
      definitionId: 'design-interview',
      executionMode: 'container',
      status: 'running',
      currentAttemptId: 'attempt-1',
    });
    mockServices.runs.listAttempts.mockReturnValue([
      {
        id: 'attempt-1',
        runId: 'run-1',
        attemptNumber: 1,
        status: 'running',
        executorMetadata: { containerId: 'abc123', image: 'fbeast/sandbox:latest' },
      },
    ]);
    mockServices.runs.readLogs.mockResolvedValue(['line one']);
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'logs', beastTarget: 'run-1', beastExecutionMode: 'container' } as CliArgs,
    });

    await handleBeastCommand(deps);

    expect(deps.print).toHaveBeenCalledWith(expect.stringContaining('"containerId":"abc123"'));
    expect(deps.print).toHaveBeenCalledWith(expect.stringContaining('line one'));
  });
});

describe('handleBeastCommand() restart', () => {
  it('leaves services alive after restarting an in-process executor', async () => {
    mockServices.runs.restart.mockResolvedValue({ id: 'run-1', status: 'running', currentAttemptId: 'attempt-1' });
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'restart', beastTarget: 'run-1' } as CliArgs,
    });

    await handleBeastCommand(deps);

    expect(mockServices.runs.restart).toHaveBeenCalledWith('run-1', expect.any(String));
    expect(deps.print).toHaveBeenCalledWith('Restarted run-1');
    expect(mockServices.dispose).not.toHaveBeenCalled();
  });

  it('disposes services if restart fails before a run is started', async () => {
    mockServices.runs.restart.mockRejectedValue(new Error('missing run'));
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'restart', beastTarget: 'missing' } as CliArgs,
    });

    await expect(handleBeastCommand(deps)).rejects.toThrow('missing run');
    expect(mockServices.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('handleBeastCommand() resume', () => {
  it('calls control.resumeAgent with agent id, prints result, and leaves services alive for a live run', async () => {
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'resume', beastTarget: 'agent-1' } as CliArgs,
    });

    await handleBeastCommand(deps);

    expect(deps.control.resumeAgent).toHaveBeenCalledWith('agent-1', expect.any(String));
    expect(deps.print).toHaveBeenCalledWith('Resumed run-42');
    expect(mockServices.dispose).not.toHaveBeenCalled();
  });

  it('tracks the linked run before resume finishes so SIGINT can clean it up', async () => {
    let resolveResume: ((run: unknown) => void) | undefined;
    const control = makeDeps().control;
    control.getAgentRunId = vi.fn().mockReturnValue('run-42');
    control.resumeAgent = vi.fn(async () => await new Promise((resolve) => {
      resolveResume = resolve;
    }));
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'resume', beastTarget: 'agent-1' } as CliArgs,
      control,
    });

    try {
      const command = handleBeastCommand(deps);
      await vi.waitFor(() => expect(control.resumeAgent).toHaveBeenCalledWith('agent-1', expect.any(String)));
      process.emit('SIGINT');
      await vi.waitFor(() => {
        expect(mockServices.runs.kill).toHaveBeenCalledWith('run-42', expect.any(String));
        expect(mockServices.dispose).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledWith(130);
      });
      resolveResume?.({ id: 'run-42', status: 'stopped', currentAttemptId: undefined });
      await command;
    } finally {
      exit.mockRestore();
    }
  });

  it('disposes services if resume returns a non-live run', async () => {
    const control = makeDeps().control;
    control.resumeAgent = vi.fn().mockResolvedValue({ id: 'run-42', status: 'failed' });
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'resume', beastTarget: 'agent-1' } as CliArgs,
      control,
    });

    await handleBeastCommand(deps);

    expect(deps.print).toHaveBeenCalledWith('Resumed run-42');
    expect(mockServices.dispose).toHaveBeenCalledTimes(1);
  });

  it('reuses the command service bundle when creating the default control client', async () => {
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'resume', beastTarget: 'agent-1' } as CliArgs,
      control: undefined,
    });

    await handleBeastCommand(deps);

    expect(mockControlClient.createBeastControlClient).toHaveBeenCalledWith(deps.paths, mockServices);
    expect(mockServices.dispose).toHaveBeenCalledTimes(1);
  });

  it('throws if no beastTarget provided and still disposes services', async () => {
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'resume' } as CliArgs,
    });

    await expect(handleBeastCommand(deps)).rejects.toThrow('beasts resume requires an agent id');
    expect(mockServices.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('handleBeastCommand() delete', () => {
  it('calls control.deleteAgent with agent id, prints result, and disposes services', async () => {
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'delete', beastTarget: 'agent-1' } as CliArgs,
    });

    await handleBeastCommand(deps);

    expect(deps.control.deleteAgent).toHaveBeenCalledWith('agent-1');
    expect(deps.print).toHaveBeenCalledWith('Deleted agent-1');
    expect(mockServices.dispose).toHaveBeenCalledTimes(1);
  });

  it('reuses the command service bundle when creating the default control client', async () => {
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'delete', beastTarget: 'agent-1' } as CliArgs,
      control: undefined,
    });

    await handleBeastCommand(deps);

    expect(mockControlClient.createBeastControlClient).toHaveBeenCalledWith(deps.paths, mockServices);
    expect(mockServices.dispose).toHaveBeenCalledTimes(1);
  });

  it('throws if no beastTarget provided and still disposes services', async () => {
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'delete' } as CliArgs,
    });

    await expect(handleBeastCommand(deps)).rejects.toThrow('beasts delete requires an agent id');
    expect(mockServices.dispose).toHaveBeenCalledTimes(1);
  });
});
