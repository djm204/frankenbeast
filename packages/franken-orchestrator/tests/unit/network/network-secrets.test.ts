import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';
import {
  redactSensitiveConfig,
  resolveSecretMode,
} from '../../../src/network/network-secrets.js';

describe('network-secrets', () => {
  it('uses the configured secure or insecure mode', () => {
    const secureConfig = defaultConfig();
    const insecureConfig = defaultConfig();
    insecureConfig.network.mode = 'insecure';

    expect(resolveSecretMode(secureConfig)).toBe('secure');
    expect(resolveSecretMode(insecureConfig)).toBe('insecure');
  });

  it('redacts sensitive values in config output', () => {
    const config = defaultConfig();
    config.comms.slack.botTokenRef = 'secret://secure/comms.slack.botTokenRef/abc123';
    config.comms.discord.publicKeyRef = 'public://discord/public-key';

    const redacted = redactSensitiveConfig(config);

    expect(redacted.comms.slack.botTokenRef).toBe('[redacted]');
    expect(redacted.comms.discord.publicKeyRef).toBe('public://discord/public-key');
  });
});
