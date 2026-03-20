import { describe, it, expect, vi, beforeEach } from 'vitest';
import { discordRouter } from '../../../src/comms/channels/discord/discord-router.js';
import { DiscordInteractionType } from '../../../src/comms/channels/discord/discord-schemas.js';
import { generateKeyPairSync, sign, type KeyPairSyncResult } from 'node:crypto';
import type { ChatGateway } from '../../../src/comms/gateway/chat-gateway.js';
import type { SessionMapper } from '../../../src/comms/core/session-mapper.js';

describe('discordRouter', () => {
  let keys: KeyPairSyncResult<string, string>;
  let rawPublicKey: string;
  const gateway = {
    handleInbound: vi.fn().mockResolvedValue(undefined),
    handleAction: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatGateway;
  const sessionMapper = {
    mapToSessionId: vi.fn().mockReturnValue('session-123'),
  } as unknown as SessionMapper;

  beforeEach(() => {
    keys = generateKeyPairSync('ed25519');
    rawPublicKey = keys.publicKey.export({ type: 'spki', format: 'der' }).slice(-32).toString('hex');
  });

  function getSignature(body: string, timestamp: string) {
    const message = Buffer.from(timestamp + body);
    return sign(null, message, keys.privateKey).toString('hex');
  }

  it('handles PING challenge', async () => {
    const app = discordRouter({
      gateway,
      sessionMapper,
      publicKey: rawPublicKey,
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({
      type: DiscordInteractionType.PING,
      id: '1',
      token: 't',
      application_id: 'a',
    });
    const signature = getSignature(body, timestamp);

    const res = await app.request('/interactions', {
      method: 'POST',
      headers: {
        'X-Signature-Ed25519': signature,
        'X-Signature-Timestamp': timestamp,
      },
      body,
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe(1); // PONG
  });

  it('routes slash command to gateway', async () => {
    const app = discordRouter({
      gateway,
      sessionMapper,
      publicKey: rawPublicKey,
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({
      type: DiscordInteractionType.APPLICATION_COMMAND,
      id: '1',
      token: 't',
      application_id: 'a',
      channel_id: 'C1',
      user: { id: 'U1', username: 'user' },
      data: {
        name: 'franken',
        options: [{ name: 'query', value: 'hello', type: 3 }],
      },
    });
    const signature = getSignature(body, timestamp);

    const res = await app.request('/interactions', {
      method: 'POST',
      headers: {
        'X-Signature-Ed25519': signature,
        'X-Signature-Timestamp': timestamp,
      },
      body,
    });

    expect(res.status).toBe(200);
    expect(gateway.handleInbound).toHaveBeenCalledWith(expect.objectContaining({
      text: 'hello',
      externalUserId: 'U1',
    }));
  });

  it('routes button click to gateway', async () => {
    const app = discordRouter({
      gateway,
      sessionMapper,
      publicKey: rawPublicKey,
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({
      type: DiscordInteractionType.MESSAGE_COMPONENT,
      id: '1',
      token: 't',
      application_id: 'a',
      channel_id: 'C1',
      user: { id: 'U1', username: 'user' },
      data: {
        custom_id: 'approve',
        component_type: 2,
      },
    });
    const signature = getSignature(body, timestamp);

    const res = await app.request('/interactions', {
      method: 'POST',
      headers: {
        'X-Signature-Ed25519': signature,
        'X-Signature-Timestamp': timestamp,
      },
      body,
    });

    expect(res.status).toBe(200);
    expect(gateway.handleAction).toHaveBeenCalledWith('discord', 'session-123', 'approve');
  });
});
