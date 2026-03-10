import { defaultNetworkConfig } from '../network/network-config.js';
import type { KnownCommsTransportId, SupportedCommsTransportId } from './init-types.js';

export interface CommsTransportDefinition<T extends KnownCommsTransportId = KnownCommsTransportId> {
  id: T;
  label: string;
  description: string;
}

const KNOWN_TRANSPORTS: readonly CommsTransportDefinition[] = [
  {
    id: 'slack',
    label: 'Slack',
    description: 'Slack Events API and interactivity via the managed comms gateway.',
  },
  {
    id: 'discord',
    label: 'Discord',
    description: 'Discord interactions via the managed comms gateway.',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    description: 'Known future transport; not yet wired through orchestrator runtime.',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    description: 'Known future transport; not yet wired through orchestrator runtime.',
  },
];

function runtimeSupportedTransportIds(): Set<SupportedCommsTransportId> {
  const comms = defaultNetworkConfig().comms as Record<string, unknown>;
  const reserved = new Set(['enabled', 'host', 'port', 'orchestratorWsUrl', 'orchestratorTokenRef']);
  const supported = Object.keys(comms)
    .filter((key) => !reserved.has(key))
    .filter((key): key is SupportedCommsTransportId => key === 'slack' || key === 'discord');
  return new Set(supported);
}

export function listKnownCommsTransports(): readonly CommsTransportDefinition[] {
  return KNOWN_TRANSPORTS;
}

export function listSupportedCommsTransports(): readonly CommsTransportDefinition<SupportedCommsTransportId>[] {
  const supportedIds = runtimeSupportedTransportIds();
  return KNOWN_TRANSPORTS.filter(
    (transport): transport is CommsTransportDefinition<SupportedCommsTransportId> => supportedIds.has(transport.id as SupportedCommsTransportId),
  );
}
