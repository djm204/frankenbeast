import { describe, it, expect, vi } from 'vitest';
import { handleBeastCommand } from '../../../src/cli/beast-cli.js';
import type { CliArgs } from '../../../src/cli/args.js';
import type { ProjectPaths } from '../../../src/cli/project-root.js';

vi.mock('../../../src/beasts/create-beast-services.js', () => ({
  createBeastServices: () => ({}),
}));

vi.mock('../../../src/cli/beast-control-client.js', () => ({
  createBeastControlClient: () => ({}),
}));

function makeDeps(overrides: Partial<Parameters<typeof handleBeastCommand>[0]> = {}) {
  return {
    args: { subcommand: 'beasts' as const, beastAction: undefined, networkDetached: false, baseDir: '/tmp', budget: 10, provider: 'claude', noPr: false, verbose: false, reset: false, resume: false, cleanup: false, help: false, initVerify: false, initRepair: false, initNonInteractive: false } as CliArgs,
    io: { ask: vi.fn(), confirm: vi.fn(), choose: vi.fn(), print: vi.fn() } as any,
    paths: { root: '/tmp', fbeast: '/tmp/.fbeast' } as ProjectPaths,
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

describe('handleBeastCommand() resume', () => {
  it('calls control.resumeAgent with agent id and prints result', async () => {
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'resume', beastTarget: 'agent-1' } as CliArgs,
    });

    await handleBeastCommand(deps);

    expect(deps.control.resumeAgent).toHaveBeenCalledWith('agent-1', expect.any(String));
    expect(deps.print).toHaveBeenCalledWith('Resumed run-42');
  });

  it('throws if no beastTarget provided', async () => {
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'resume' } as CliArgs,
    });

    await expect(handleBeastCommand(deps)).rejects.toThrow('beasts resume requires an agent id');
  });
});

describe('handleBeastCommand() delete', () => {
  it('calls control.deleteAgent with agent id and prints result', async () => {
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'delete', beastTarget: 'agent-1' } as CliArgs,
    });

    await handleBeastCommand(deps);

    expect(deps.control.deleteAgent).toHaveBeenCalledWith('agent-1');
    expect(deps.print).toHaveBeenCalledWith('Deleted agent-1');
  });

  it('throws if no beastTarget provided', async () => {
    const deps = makeDeps({
      args: { subcommand: 'beasts', beastAction: 'delete' } as CliArgs,
    });

    await expect(handleBeastCommand(deps)).rejects.toThrow('beasts delete requires an agent id');
  });
});
