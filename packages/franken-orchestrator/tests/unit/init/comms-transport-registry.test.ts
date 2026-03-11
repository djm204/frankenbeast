import { describe, expect, it } from 'vitest';
import { listKnownCommsTransports, listSupportedCommsTransports } from '../../../src/init/comms-transport-registry.js';

describe('comms transport registry', () => {
  it('returns only runtime-supported transports', () => {
    expect(listSupportedCommsTransports().map((transport) => transport.id)).toEqual(['slack', 'discord']);
  });

  it('keeps known future transports without surfacing them as supported', () => {
    expect(listKnownCommsTransports().map((transport) => transport.id)).toEqual([
      'slack',
      'discord',
      'telegram',
      'whatsapp',
    ]);
  });
});
