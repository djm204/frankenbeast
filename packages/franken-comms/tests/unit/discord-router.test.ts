import { describe, it, expect, vi, beforeEach } from 'vitest';
import { discordRouter } from '../../src/channels/discord/discord-router.js';
import { DiscordInteractionType } from '../../src/channels/discord/discord-schemas.js';
import { generateKeyPairSync, sign } from 'node:crypto';

describe('discordRouter', () => {
  let keys: any;
  let rawPublicKey: string;
  const gateway = {
    handleInbound: vi.fn().mockResolvedValue(undefined),
    handleAction: vi.fn().mockResolvedValue(undefined),
  };
  const sessionMapper = {
    mapToSessionId: vi.fn().mockReturnValue('session-123'),
  };

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
      gateway: gateway as any,
      sessionMapper: sessionMapper as any,
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
      gateway: gateway as any,
      sessionMapper: sessionMapper as any,
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
        options: [{ name: 'query', value: 'hello' }],
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
      gateway: gateway as any,
      sessionMapper: sessionMapper as any,
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
