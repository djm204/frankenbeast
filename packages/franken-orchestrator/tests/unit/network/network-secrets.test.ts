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
    config.comms.telegram.botTokenRef = 'secret://secure/comms.telegram.botTokenRef/abc123';
    config.comms.whatsapp.accessTokenRef = 'secret://secure/comms.whatsapp.accessTokenRef/abc123';
    config.comms.whatsapp.phoneNumberIdRef = 'public-phone-number-id';
    config.comms.whatsapp.appSecretRef = 'secret://secure/comms.whatsapp.appSecretRef/abc123';
    config.comms.whatsapp.verifyTokenRef = 'secret://secure/comms.whatsapp.verifyTokenRef/abc123';
    config.comms.discord.publicKeyRef = 'public://discord/public-key';

    const redacted = redactSensitiveConfig(config);

    expect(redacted.comms.slack.botTokenRef).toBe('[redacted]');
    expect(redacted.comms.telegram.botTokenRef).toBe('[redacted]');
    expect(redacted.comms.whatsapp.accessTokenRef).toBe('[redacted]');
    expect(redacted.comms.whatsapp.phoneNumberIdRef).toBe('public-phone-number-id');
    expect(redacted.comms.whatsapp.appSecretRef).toBe('[redacted]');
    expect(redacted.comms.whatsapp.verifyTokenRef).toBe('[redacted]');
    expect(redacted.comms.discord.publicKeyRef).toBe('public://discord/public-key');
  });
});
