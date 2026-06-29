import { beforeEach, describe, it, expect, vi } from 'vitest';
import { handleBeastCommand } from '../../../src/cli/beast-cli.js';
import type { CliArgs } from '../../../src/cli/args.js';
import type { ProjectPaths } from '../../../src/cli/project-root.js';

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

vi.mock('../../../src/cli/beast-control-client.js', () => ({
  createBeastControlClient: () => ({}),
}));

function makeDeps(overrides: Partial<Parameters<typeof handleBeastCommand>[0]> = {}) {
  return {
    args: { subcommand: 'beasts' as const, beastAction: undefined, networkDetached: false, baseDir: '/tmp', budget: 10, provider: 'claude', noPr: false, verbose: false, reset: false, resume: false, cleanup: false, help: false, initVerify: false, initRepair: false, initNonInteractive: false } as CliArgs,
    io: { ask: vi.fn(), confirm: vi.fn(), choose: vi.fn(), print: vi.fn() } as any,
    paths: { root: '/tmp', fbeast: '/tmp/.fbeast' } as unknown as ProjectPaths,
    print: vi.fn(),
    control: {
      listRuns: vi.fn(),
      getRun: vi.fn(),
      readLogs: vi.fn(),
      stopRun: vi.fn(),
      restartRun: vi.fn(),
      resumeAgent: vi.fn().mockResolvedValue({ id: 'run-42' }),
      deleteAgent: vi.fn().mockResolvedValue({ id: 'agent-1' }),
      createRun: vi.fn(),
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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
});

describe('handleBeastCommand() resume', () => {
  it('calls control.resumeAgent with agent id, prints result, and disposes services', async () => {
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'resume', beastTarget: 'agent-1' } as CliArgs,
    });

    await handleBeastCommand(deps);

    expect(deps.control.resumeAgent).toHaveBeenCalledWith('agent-1', expect.any(String));
    expect(deps.print).toHaveBeenCalledWith('Resumed run-42');
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

  it('throws if no beastTarget provided and still disposes services', async () => {
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'delete' } as CliArgs,
    });

    await expect(handleBeastCommand(deps)).rejects.toThrow('beasts delete requires an agent id');
    expect(mockServices.dispose).toHaveBeenCalledTimes(1);
  });
});
