import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
    expect(print).toHaveBeenCalledWith('  Webhook Signature Policy: required');
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

  it('persists the selected security profile', async () => {
    const print = vi.fn();
    const dir = await mkdtemp(join(tmpdir(), 'security-cli-'));
    const configPath = join(dir, '.fbeast', 'config.json');

    await handleSecurityCommand({ action: 'set', target: 'permissive', configPath, print });

    await expect(readFile(configPath, 'utf-8')).resolves.toContain('"profile": "permissive"');
    expect(print).toHaveBeenCalledWith(`Security profile set to 'permissive' in ${configPath}.`);
  });

  it('rejects strict profile without configured allowedDomains', async () => {
    const print = vi.fn();
    const dir = await mkdtemp(join(tmpdir(), 'security-cli-'));
    const configPath = join(dir, '.fbeast', 'config.json');

    await expect(
      handleSecurityCommand({ action: 'set', target: 'strict', configPath, print }),
    ).rejects.toThrow(/requires allowedDomains/);
  });

  it('persists strict profile when allowedDomains are already configured', async () => {
    const print = vi.fn();
    const dir = await mkdtemp(join(tmpdir(), 'security-cli-'));
    const configPath = join(dir, 'config.json');
    await writeFile(configPath, JSON.stringify({
      security: { allowedDomains: ['example.com'] },
    }), 'utf-8');

    await handleSecurityCommand({ action: 'set', target: 'strict', configPath, print });

    const config = JSON.parse(await readFile(configPath, 'utf-8')) as {
      security?: { profile?: string; allowedDomains?: string[] };
    };
    expect(config.security).toEqual({
      allowedDomains: ['example.com'],
      profile: 'strict',
    });
  });

  it('shows status with security overrides from config', async () => {
    const print = vi.fn();

    await handleSecurityCommand({
      action: 'status',
      currentSecurity: { profile: 'permissive', piiMasking: true, webhookSignaturePolicy: 'local-dev-unsigned' },
      print,
    });

    expect(print).toHaveBeenCalledWith('Security Profile: permissive');
    expect(print).toHaveBeenCalledWith('  Injection Detection: off');
    expect(print).toHaveBeenCalledWith('  PII Masking: on');
    expect(print).toHaveBeenCalledWith('  Output Validation: on');
    expect(print).toHaveBeenCalledWith('  Webhook Signature Policy: local-dev-unsigned');
  });

  it('preserves existing config and security settings when setting profile', async () => {
    const print = vi.fn();
    const dir = await mkdtemp(join(tmpdir(), 'security-cli-'));
    const configPath = join(dir, 'config.json');
    await writeFile(configPath, JSON.stringify({
      maxDurationMs: 120_000,
      security: { piiMasking: false, outputValidation: true },
    }), 'utf-8');

    await handleSecurityCommand({ action: 'set', target: 'permissive', configPath, print });

    const config = JSON.parse(await readFile(configPath, 'utf-8')) as {
      maxDurationMs?: number;
      security?: { profile?: string; piiMasking?: boolean; outputValidation?: boolean };
    };
    expect(config.maxDurationMs).toBe(120_000);
    expect(config.security).toEqual({
      piiMasking: false,
      outputValidation: true,
      profile: 'permissive',
    });
  });

  it('requires a config path for set', async () => {
    const print = vi.fn();

    await expect(
      handleSecurityCommand({ action: 'set', target: 'strict', print }),
    ).rejects.toThrow(/missing config path/);
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
