import { describe, it, expect, vi } from 'vitest';
import { handleSkillCommand } from '../../../src/cli/skill-cli.js';

function createMockSkillManager(overrides: Record<string, unknown> = {}) {
  return {
    listInstalled: vi.fn().mockReturnValue([]),
    getEnabledSkills: vi.fn().mockReturnValue([]),
    installCustom: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    readMcpConfig: vi.fn().mockReturnValue(null),
    readContext: vi.fn().mockReturnValue(null),
    readTools: vi.fn().mockReturnValue([]),
    ...overrides,
  } as never;
}

describe('handleSkillCommand()', () => {
  it('lists installed skills with enabled status', async () => {
    const print = vi.fn();
    const skillManager = createMockSkillManager({
      listInstalled: vi.fn().mockReturnValue([
        { name: 'alpha', description: 'Alpha skill' },
        { name: 'beta', description: 'Beta skill' },
      ]),
      getEnabledSkills: vi.fn().mockReturnValue(['alpha']),
    });

    await handleSkillCommand({ skillManager, action: 'list', print });

    expect(print).toHaveBeenCalledTimes(2);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('[on]'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('alpha'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('[off]'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('beta'));
  });

  it('prints message when no skills installed', async () => {
    const print = vi.fn();
    const skillManager = createMockSkillManager();

    await handleSkillCommand({ skillManager, action: 'list', print });

    expect(print).toHaveBeenCalledWith('No skills installed.');
  });

  it('adds a skill by name', async () => {
    const print = vi.fn();
    const installCustom = vi.fn().mockResolvedValue(undefined);
    const skillManager = createMockSkillManager({ installCustom });

    await handleSkillCommand({ skillManager, action: 'add', target: 'my-skill', print });

    expect(installCustom).toHaveBeenCalledWith('my-skill', { command: 'my-skill', args: [] });
    expect(print).toHaveBeenCalledWith("Installed skill 'my-skill'");
  });

  it('throws when add has no target', async () => {
    const print = vi.fn();
    const skillManager = createMockSkillManager();

    await expect(
      handleSkillCommand({ skillManager, action: 'add', print }),
    ).rejects.toThrow('skill add requires a name');
  });

  it('removes a skill by name', async () => {
    const print = vi.fn();
    const remove = vi.fn();
    const skillManager = createMockSkillManager({ remove });

    await handleSkillCommand({ skillManager, action: 'remove', target: 'old-skill', print });

    expect(remove).toHaveBeenCalledWith('old-skill');
    expect(print).toHaveBeenCalledWith("Removed skill 'old-skill'");
  });

  it('throws when remove has no target', async () => {
    const print = vi.fn();
    const skillManager = createMockSkillManager();

    await expect(
      handleSkillCommand({ skillManager, action: 'remove', print }),
    ).rejects.toThrow('skill remove requires a name');
  });

  it('enables a skill by name', async () => {
    const print = vi.fn();
    const enable = vi.fn();
    const skillManager = createMockSkillManager({ enable });

    await handleSkillCommand({ skillManager, action: 'enable', target: 'my-skill', print });

    expect(enable).toHaveBeenCalledWith('my-skill');
    expect(print).toHaveBeenCalledWith("Enabled skill 'my-skill'");
  });

  it('throws when enable has no target', async () => {
    const print = vi.fn();
    const skillManager = createMockSkillManager();

    await expect(
      handleSkillCommand({ skillManager, action: 'enable', print }),
    ).rejects.toThrow('skill enable requires a name');
  });

  it('disables a skill by name', async () => {
    const print = vi.fn();
    const disable = vi.fn();
    const skillManager = createMockSkillManager({ disable });

    await handleSkillCommand({ skillManager, action: 'disable', target: 'my-skill', print });

    expect(disable).toHaveBeenCalledWith('my-skill');
    expect(print).toHaveBeenCalledWith("Disabled skill 'my-skill'");
  });

  it('throws when disable has no target', async () => {
    const print = vi.fn();
    const skillManager = createMockSkillManager();

    await expect(
      handleSkillCommand({ skillManager, action: 'disable', print }),
    ).rejects.toThrow('skill disable requires a name');
  });

  it('shows skill info as JSON', async () => {
    const print = vi.fn();
    const mcpConfig = { mcpServers: { 'my-skill': { command: 'my-skill', args: [] } } };
    const skillManager = createMockSkillManager({
      readMcpConfig: vi.fn().mockReturnValue(mcpConfig),
      readContext: vi.fn().mockReturnValue('Some context'),
      readTools: vi.fn().mockReturnValue([{ name: 'tool1' }]),
    });

    await handleSkillCommand({ skillManager, action: 'info', target: 'my-skill', print });

    expect(print).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(print.mock.calls[0][0]);
    expect(parsed.name).toBe('my-skill');
    expect(parsed.mcpConfig).toEqual(mcpConfig);
    expect(parsed.context).toBe('Some context');
    expect(parsed.tools).toEqual([{ name: 'tool1' }]);
  });

  it('shows skill info with null context as undefined', async () => {
    const print = vi.fn();
    const skillManager = createMockSkillManager({
      readMcpConfig: vi.fn().mockReturnValue(null),
      readContext: vi.fn().mockReturnValue(null),
      readTools: vi.fn().mockReturnValue([]),
    });

    await handleSkillCommand({ skillManager, action: 'info', target: 'my-skill', print });

    const parsed = JSON.parse(print.mock.calls[0][0]);
    expect(parsed.context).toBeUndefined();
  });

  it('throws when info has no target', async () => {
    const print = vi.fn();
    const skillManager = createMockSkillManager();

    await expect(
      handleSkillCommand({ skillManager, action: 'info', print }),
    ).rejects.toThrow('skill info requires a name');
  });

  it('throws on undefined action', async () => {
    const print = vi.fn();
    const skillManager = createMockSkillManager();

    await expect(
      handleSkillCommand({ skillManager, action: undefined, print }),
    ).rejects.toThrow(/Usage.*skill/);
  });
});
