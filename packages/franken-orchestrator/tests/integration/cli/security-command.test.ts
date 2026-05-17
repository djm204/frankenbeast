import { describe, it, expect } from 'vitest';
import { handleSecurityCommand } from '../../../src/cli/security-cli.js';

describe('security CLI integration', () => {
  it('renders the live security profile status and configuration instructions without mocks', async () => {
    const printed: string[] = [];
    const print = (message: string) => printed.push(message);

    await handleSecurityCommand({ action: 'status', currentProfile: 'strict', print });
    await handleSecurityCommand({ action: 'set', target: 'permissive', print });

    expect(printed).toContain('Security Profile: strict');
    expect(printed).toContain('  Injection Detection: on');
    expect(printed).toContain('  PII Masking: on');
    expect(printed).toContain('  Output Validation: on');
    expect(printed.at(-1)).toContain('"security.profile": "permissive"');
  });
});
