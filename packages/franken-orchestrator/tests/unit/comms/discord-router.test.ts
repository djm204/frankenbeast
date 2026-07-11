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
    vi.clearAllMocks();
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

  it('acknowledges slash commands before delayed gateway processing resolves', async () => {
    let resolveInbound!: () => void;
    let inboundResolved = false;
    vi.mocked(gateway.handleInbound).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveInbound = () => {
          inboundResolved = true;
          resolve();
        };
      }),
    );
    const app = discordRouter({
      gateway,
      sessionMapper,
      publicKey: rawPublicKey,
      verifySignature: false,
    });

    const responsePromise = app.request('/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
      }),
    });

    const earlyResult = await Promise.race([
      responsePromise.then(() => 'responded'),
      new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 20)),
    ]);
    if (earlyResult !== 'responded') {
      resolveInbound();
      await responsePromise;
    }

    expect(earlyResult).toBe('responded');
    expect(inboundResolved).toBe(false);
    expect(gateway.handleInbound).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello' }));
    resolveInbound();
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

  it('acknowledges button clicks before delayed gateway action processing resolves', async () => {
    let resolveAction!: () => void;
    let actionResolved = false;
    vi.mocked(gateway.handleAction).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveAction = () => {
          actionResolved = true;
          resolve();
        };
      }),
    );
    const app = discordRouter({
      gateway,
      sessionMapper,
      publicKey: rawPublicKey,
      verifySignature: false,
    });

    const responsePromise = app.request('/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
      }),
    });

    const earlyResult = await Promise.race([
      responsePromise.then(() => 'responded'),
      new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 20)),
    ]);
    if (earlyResult !== 'responded') {
      resolveAction();
      await responsePromise;
    }

    expect(earlyResult).toBe('responded');
    expect(actionResolved).toBe(false);
    expect(gateway.handleAction).toHaveBeenCalledWith('discord', 'session-123', 'approve');
    resolveAction();
  });

  it('returns 400 for invalid interaction payloads without invoking handlers', async () => {
    const app = discordRouter({
      gateway,
      sessionMapper,
      publicKey: rawPublicKey,
      verifySignature: false,
    });

    const res = await app.request('/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: DiscordInteractionType.APPLICATION_COMMAND, data: 'not-an-object' }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid payload' });
    expect(gateway.handleInbound).not.toHaveBeenCalled();
    expect(gateway.handleAction).not.toHaveBeenCalled();
  });
});
