import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  governorCheck: vi.fn(),
  createGovernorAdapter: vi.fn(),
  createObserverAdapter: vi.fn(),
}));

vi.mock('../adapters/governor-adapter.js', () => ({
  createGovernorAdapter: mocks.createGovernorAdapter,
}));

vi.mock('../adapters/observer-adapter.js', () => ({
  createObserverAdapter: mocks.createObserverAdapter,
}));

import { runHook } from './hook.js';

describe('hook active config', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it('threads --config into the governor used by pre-tool hooks', async () => {
    mocks.governorCheck.mockResolvedValue({ decision: 'approved', reason: 'ok' });
    mocks.createGovernorAdapter.mockReturnValue({
      check: mocks.governorCheck,
      budgetStatus: vi.fn(),
    });
    mocks.createObserverAdapter.mockReturnValue({
      log: vi.fn(),
      logCost: vi.fn(),
      trail: vi.fn(),
      verify: vi.fn(),
      cost: vi.fn(),
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runHook([
      '--db', '/tmp/hook-project/.fbeast/beast.db',
      '--config', '/tmp/active-config/config.json',
      'pre-tool', 'mcp__reporting__publish_report',
    ]);

    expect(mocks.createGovernorAdapter).toHaveBeenCalledWith(
      '/tmp/hook-project/.fbeast/beast.db',
      '/tmp/active-config/config.json',
    );
    expect(mocks.governorCheck).toHaveBeenCalledWith(expect.objectContaining({
      action: 'mcp__reporting__publish_report',
    }));
  });
});
