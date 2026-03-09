import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { discordSignatureMiddleware } from '../../../src/security/discord-signature.js';
import { generateKeyPairSync, sign } from 'node:crypto';

describe('discordSignatureMiddleware', () => {
  let publicKey: string;
  let privateKey: any;
  const app = new Hono();

  beforeEach(() => {
    const keys = generateKeyPairSync('ed25519');
    privateKey = keys.privateKey;
    publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }) as string;
    // Extract raw hex public key for the middleware as Discord provides it
    // In a real scenario, this is the 32-byte hex string from Discord Dev Portal
  });

  // We'll use a simplified mock for the test since PEM/SPKI is easier with node:crypto
  // but the middleware will expect the hex string.
  
  it('rejects requests with missing headers', async () => {
    const localApp = new Hono();
    localApp.use('/discord/*', discordSignatureMiddleware({ publicKey: 'dummy' }));
    localApp.post('/discord/interactions', (c) => c.json({ ok: true }));

    const res = await localApp.request('/discord/interactions', {
      method: 'POST',
      body: JSON.stringify({ type: 1 }),
    });
    expect(res.status).toBe(401);
  });

  it('accepts requests with valid signatures', async () => {
    const keys = generateKeyPairSync('ed25519');
    const rawPublicKey = keys.publicKey.export({ type: 'spki', format: 'der' }).slice(-32).toString('hex');
    
    const localApp = new Hono();
    localApp.use('/discord/*', discordSignatureMiddleware({ publicKey: rawPublicKey }));
    localApp.post('/discord/interactions', (c) => c.json({ ok: true }));

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({ type: 1 });
    const message = Buffer.from(timestamp + body);
    const signature = sign(null, message, keys.privateKey).toString('hex');

    const res = await localApp.request('/discord/interactions', {
      method: 'POST',
      headers: {
        'X-Signature-Ed25519': signature,
        'X-Signature-Timestamp': timestamp,
      },
      body,
    });
    expect(res.status).toBe(200);
  });

  it('rejects requests with invalid signatures', async () => {
    const keys = generateKeyPairSync('ed25519');
    const rawPublicKey = keys.publicKey.export({ type: 'spki', format: 'der' }).slice(-32).toString('hex');

    const localApp = new Hono();
    localApp.use('/discord/*', discordSignatureMiddleware({ publicKey: rawPublicKey }));

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({ type: 1 });
    
    const res = await localApp.request('/discord/interactions', {
      method: 'POST',
      headers: {
        'X-Signature-Ed25519': 'a'.repeat(128), // Invalid hex signature
        'X-Signature-Timestamp': timestamp,
      },
      body,
    });
    expect(res.status).toBe(401);
  });
});
