import { describe, expect, it, vi } from 'vitest';
import { resolveServiceHealth } from '../../../src/network/network-health.js';
import type { ManagedNetworkServiceState } from '../../../src/network/network-state-store.js';

function service(overrides: Partial<ManagedNetworkServiceState>): ManagedNetworkServiceState {
  return {
    id: 'chat-server',
    pid: 123,
    dependsOn: [],
    startedAt: '2026-03-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('resolveServiceHealth', () => {
  it('probes an in-process service healthUrl instead of only its host service', async () => {
    const chatServer = service({
      id: 'chat-server',
      healthUrl: 'http://127.0.0.1:3737/health',
    });
    const commsGateway = service({
      id: 'comms-gateway',
      inProcess: true,
      hostServiceId: 'chat-server',
      healthUrl: 'http://127.0.0.1:3737/comms/health',
      channels: { slack: true, discord: false },
    });
    const healthcheck = vi.fn(async (candidate: ManagedNetworkServiceState) => candidate.id === 'comms-gateway');

    await expect(resolveServiceHealth(commsGateway, healthcheck, [chatServer, commsGateway])).resolves.toEqual({
      id: 'comms-gateway',
      status: 'running',
      inProcess: true,
      hostServiceId: 'chat-server',
      channels: { slack: true, discord: false },
    });
    expect(healthcheck).toHaveBeenCalledWith(commsGateway);
    expect(healthcheck).not.toHaveBeenCalledWith(chatServer);
  });

  it('falls back to host service health for legacy in-process state without a healthUrl', async () => {
    const chatServer = service({ id: 'chat-server' });
    const legacyCommsGateway = service({
      id: 'comms-gateway',
      inProcess: true,
      hostServiceId: 'chat-server',
    });
    const healthcheck = vi.fn(async (candidate: ManagedNetworkServiceState) => candidate.id === 'chat-server');

    await expect(resolveServiceHealth(legacyCommsGateway, healthcheck, [chatServer, legacyCommsGateway])).resolves.toEqual({
      id: 'comms-gateway',
      status: 'running',
      inProcess: true,
      hostServiceId: 'chat-server',
    });
    expect(healthcheck).toHaveBeenCalledWith(chatServer);
  });
});
