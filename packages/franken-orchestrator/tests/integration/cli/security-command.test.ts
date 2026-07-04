import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import { handleSecurityCommand } from '../../../src/cli/security-cli.js';

describe('security CLI integration', () => {
  it('renders the live security profile status and persists profile changes without mocks', async () => {
    const printed: string[] = [];
    const print = (message: string) => printed.push(message);
    const dir = await mkdtemp(join(tmpdir(), 'security-command-'));
    const configPath = join(dir, '.fbeast', 'config.json');

    await handleSecurityCommand({
      action: 'status',
      currentSecurity: { profile: 'permissive', piiMasking: true },
      print,
    });
    await handleSecurityCommand({ action: 'set', target: 'permissive', configPath, print });

    expect(printed).toContain('Security Profile: permissive');
    expect(printed).toContain('  Injection Detection: off');
    expect(printed).toContain('  PII Masking: on');
    expect(printed).toContain('  Output Validation: on');
    expect(printed.at(-1)).toBe(`Security profile set to 'permissive' in ${configPath}.`);
    await expect(readFile(configPath, 'utf-8')).resolves.toContain('"profile": "permissive"');
  });
});
