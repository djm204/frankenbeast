import { describe, expect, it } from 'vitest';
import {
  applyNetworkConfigSets,
  getNetworkConfigValue,
  isSensitiveConfigPath,
  parseConfigAssignment,
  setNetworkConfigValue,
} from '../../../src/network/network-config-paths.js';
import { defaultConfig, OrchestratorConfigSchema } from '../../../src/config/orchestrator-config.js';

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

  it('configures and validates the outbound comms timeout', () => {
    const next = setNetworkConfigValue(defaultConfig(), 'comms.outboundTimeoutMs', '25000');

    expect(next.comms.outboundTimeoutMs).toBe(25_000);
    expect(() => OrchestratorConfigSchema.parse(
      setNetworkConfigValue(next, 'comms.outboundTimeoutMs', '0'),
    )).toThrow();
    expect(() => OrchestratorConfigSchema.parse(
      setNetworkConfigValue(next, 'comms.outboundTimeoutMs', '250.5'),
    )).toThrow();
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

    const provider = setNetworkConfigValue(
      defaultConfig(),
      'network.egressPolicy.lanes.provider.allowedDomains',
      '["10.0.0.5"]',
    );
    expect(provider.network.egressPolicy.lanes?.provider?.allowedDomains).toEqual(['10.0.0.5']);
  });

  it('applies multiple --set assignments', () => {
    const next = applyNetworkConfigSets(defaultConfig(), [
      'chat.model=gpt-5',
      'comms.slack.enabled=true',
    ]);

    expect(next.chat.model).toBe('gpt-5');
    expect(next.comms.slack.enabled).toBe(true);
  });

  it('unsets an explicit chat model when assigned an empty or whitespace-only value', () => {
    const configured = applyNetworkConfigSets(defaultConfig(), ['chat.model=claude-sonnet-4-6']);

    for (const assignment of ['chat.model=', 'chat.model=   ']) {
      const next = applyNetworkConfigSets(configured, [assignment]);
      expect(next.chat.model).toBeUndefined();
      expect(Object.hasOwn(next.chat, 'model')).toBe(false);
    }
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
