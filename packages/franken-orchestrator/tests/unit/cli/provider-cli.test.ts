import { describe, it, expect, vi } from 'vitest';
import { handleProviderCommand } from '../../../src/cli/provider-cli.js';

function createMockRegistry(providers: Array<{ name: string; available?: boolean }> = []) {
  return {
    getProviders: vi.fn().mockReturnValue(
      providers.map((p) => ({
        name: p.name,
        isAvailable: vi.fn().mockResolvedValue(p.available ?? true),
      })),
    ),
  } as never;
}

describe('handleProviderCommand()', () => {
  it('lists configured providers', async () => {
    const print = vi.fn();
    const registry = createMockRegistry([
      { name: 'claude' },
      { name: 'openai' },
    ]);

    await handleProviderCommand({ registry, action: 'list', print });

    expect(print).toHaveBeenCalledTimes(2);
    expect(print).toHaveBeenCalledWith('  claude');
    expect(print).toHaveBeenCalledWith('  openai');
  });

  it('prints message when no providers configured', async () => {
    const print = vi.fn();
    const registry = createMockRegistry([]);

    await handleProviderCommand({ registry, action: 'list', print });

    expect(print).toHaveBeenCalledWith('No providers configured.');
  });

  it('tests all providers', async () => {
    const print = vi.fn();
    const registry = createMockRegistry([
      { name: 'claude', available: true },
      { name: 'openai', available: false },
    ]);

    await handleProviderCommand({ registry, action: 'test', print });

    expect(print).toHaveBeenCalledWith('  [ok] claude');
    expect(print).toHaveBeenCalledWith('  [fail] openai');
  });

  it('tests a specific provider by name', async () => {
    const print = vi.fn();
    const registry = createMockRegistry([
      { name: 'claude', available: true },
      { name: 'openai', available: false },
    ]);

    await handleProviderCommand({ registry, action: 'test', target: 'claude', print });

    expect(print).toHaveBeenCalledTimes(1);
    expect(print).toHaveBeenCalledWith('  [ok] claude');
  });

  it('shows config message for add', async () => {
    const print = vi.fn();
    const registry = createMockRegistry();

    await handleProviderCommand({ registry, action: 'add', print });

    expect(print).toHaveBeenCalledWith(
      expect.stringContaining('run-config'),
    );
  });

  it('shows config message for remove', async () => {
    const print = vi.fn();
    const registry = createMockRegistry();

    await handleProviderCommand({ registry, action: 'remove', print });

    expect(print).toHaveBeenCalledWith(
      expect.stringContaining('run-config'),
    );
  });

  it('throws on undefined action', async () => {
    const print = vi.fn();
    const registry = createMockRegistry();

    await expect(
      handleProviderCommand({ registry, action: undefined, print }),
    ).rejects.toThrow(/Usage.*provider/);
  });
});
