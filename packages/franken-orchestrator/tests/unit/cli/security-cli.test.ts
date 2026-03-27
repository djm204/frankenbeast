import { describe, it, expect, vi } from 'vitest';
import { handleSecurityCommand } from '../../../src/cli/security-cli.js';

describe('handleSecurityCommand()', () => {
  it('shows status for current profile', async () => {
    const print = vi.fn();

    await handleSecurityCommand({ action: 'status', currentProfile: 'strict', print });

    expect(print).toHaveBeenCalledWith('Security Profile: strict');
    expect(print).toHaveBeenCalledWith(expect.stringContaining('Injection Detection'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('PII Masking'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('Output Validation'));
  });

  it('defaults to standard profile when none provided', async () => {
    const print = vi.fn();

    await handleSecurityCommand({ action: 'status', print });

    expect(print).toHaveBeenCalledWith('Security Profile: standard');
  });

  it('shows on/off status for strict profile', async () => {
    const print = vi.fn();

    await handleSecurityCommand({ action: 'status', currentProfile: 'strict', print });

    expect(print).toHaveBeenCalledWith('  Injection Detection: on');
    expect(print).toHaveBeenCalledWith('  PII Masking: on');
    expect(print).toHaveBeenCalledWith('  Output Validation: on');
  });

  it('shows on/off status for permissive profile', async () => {
    const print = vi.fn();

    await handleSecurityCommand({ action: 'status', currentProfile: 'permissive', print });

    expect(print).toHaveBeenCalledWith('  Injection Detection: off');
    expect(print).toHaveBeenCalledWith('  PII Masking: off');
    expect(print).toHaveBeenCalledWith('  Output Validation: on');
  });

  it('sets a valid profile', async () => {
    const print = vi.fn();

    await handleSecurityCommand({ action: 'set', target: 'strict', print });

    expect(print).toHaveBeenCalledWith(
      expect.stringContaining("set to 'strict'"),
    );
  });

  it('throws on invalid profile name', async () => {
    const print = vi.fn();

    await expect(
      handleSecurityCommand({ action: 'set', target: 'invalid', print }),
    ).rejects.toThrow(/Invalid security profile 'invalid'/);
  });

  it('throws when set has no target', async () => {
    const print = vi.fn();

    await expect(
      handleSecurityCommand({ action: 'set', print }),
    ).rejects.toThrow(/Usage.*security set/);
  });

  it('throws on undefined action', async () => {
    const print = vi.fn();

    await expect(
      handleSecurityCommand({ action: undefined, print }),
    ).rejects.toThrow(/Usage.*security/);
  });
});
