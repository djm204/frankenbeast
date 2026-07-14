import { describe, expect, it } from 'vitest';
import {
  applyNetworkConfigSets,
  getNetworkConfigValue,
  isSensitiveConfigPath,
  parseConfigAssignment,
  setNetworkConfigValue,
} from '../../../src/network/network-config-paths.js';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';

describe('network-config-paths', () => {
  it('parses dotted config assignments', () => {
    expect(parseConfigAssignment('chat.model=claude-sonnet-4-6')).toEqual({
      path: 'chat.model',
      rawValue: 'claude-sonnet-4-6',
    });
  });

  it('coerces booleans through setNetworkConfigValue', () => {
    const next = setNetworkConfigValue(defaultConfig(), 'comms.slack.enabled', 'true');

    expect(next.comms.slack.enabled).toBe(true);
  });

  it('reads values back with getNetworkConfigValue', () => {
    const next = setNetworkConfigValue(defaultConfig(), 'chat.port', '4242');

    expect(getNetworkConfigValue(next, 'chat.port')).toBe(4242);
  });

  it('coerces delivery sensitivity channel opt-ins through setNetworkConfigValue', () => {
    const next = setNetworkConfigValue(defaultConfig(), 'comms.slack.allowSensitiveDelivery', 'true');

    expect(next.comms.slack.allowSensitiveDelivery).toBe(true);
  });

  it('coerces egress policy config updates through setNetworkConfigValue', () => {
    const disabled = setNetworkConfigValue(defaultConfig(), 'network.egressPolicy.enabled', 'false');
    expect(disabled.network.egressPolicy.enabled).toBe(false);

    const next = setNetworkConfigValue(
      defaultConfig(),
      'network.egressPolicy.lanes.docs.allowedDomains',
      '["docs.example.org"]',
    );
    expect(next.network.egressPolicy.lanes?.docs?.allowedDomains).toEqual(['docs.example.org']);
  });

  it('applies multiple --set assignments', () => {
    const next = applyNetworkConfigSets(defaultConfig(), [
      'chat.model=gpt-5',
      'comms.slack.enabled=true',
    ]);

    expect(next.chat.model).toBe('gpt-5');
    expect(next.comms.slack.enabled).toBe(true);
  });

  it('classifies secret-ref paths as sensitive', () => {
    expect(isSensitiveConfigPath('comms.slack.signingSecretRef')).toBe(true);
    expect(isSensitiveConfigPath('comms.discord.botTokenRef')).toBe(true);
    expect(isSensitiveConfigPath('comms.discord.publicKeyRef')).toBe(false);
    expect(isSensitiveConfigPath('comms.telegram.botTokenRef')).toBe(true);
    expect(isSensitiveConfigPath('comms.whatsapp.accessTokenRef')).toBe(true);
    expect(isSensitiveConfigPath('comms.whatsapp.phoneNumberIdRef')).toBe(false);
    expect(isSensitiveConfigPath('comms.whatsapp.appSecretRef')).toBe(true);
    expect(isSensitiveConfigPath('comms.whatsapp.verifyTokenRef')).toBe(true);
    expect(isSensitiveConfigPath('chat.model')).toBe(false);
  });
});
