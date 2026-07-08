import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChatApp } from '../../../src/http/chat-app.js';

import { testCredential } from '../../support/test-credentials.js';

const TEST_DAEMON_TOKEN = testCredential('TEST_DAEMON_TOKEN');
const TEST_GATEWAY_TOKEN = testCredential('TEST_GATEWAY_TOKEN');
function createProxyApp() {
  return createChatApp({
    sessionStoreDir: '/tmp/chat-app-beast-daemon-proxy-test',
    llm: { complete: vi.fn().mockResolvedValue('hello') },
    projectName: 'proxy-test',
    beastDaemon: {
      baseUrl: 'http://127.0.0.1:4050',
      operatorToken: TEST_DAEMON_TOKEN,
    },
  });
}

function createProxyAppWithGatewayTokenOnly() {
  return createChatApp({
    sessionStoreDir: '/tmp/chat-app-beast-daemon-proxy-test',
    llm: { complete: vi.fn().mockResolvedValue('hello') },
    projectName: 'proxy-test',
    operatorToken: TEST_GATEWAY_TOKEN,
    beastDaemon: {
      baseUrl: 'http://127.0.0.1:4050',
    },
  });
}

describe('chat app beast daemon proxy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires operator auth before proxying beast daemon routes', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: 'ok' }), {
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const app = createProxyApp();

    const response = await app.request('/v1/beasts/catalog');

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('proxies authorized beast daemon requests with the daemon token', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: 'ok' }), {
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const app = createProxyApp();

    const response = await app.request('/v1/beasts/catalog?limit=1', {
      headers: { authorization: `Bearer ${TEST_DAEMON_TOKEN}` },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('http://127.0.0.1:4050/v1/beasts/catalog?limit=1');
    expect((init.headers as Headers).get('authorization')).toBe(`Bearer ${TEST_DAEMON_TOKEN}`);
  });

  it('lets ticket-authenticated SSE streams reach the daemon proxy without bearer auth', async () => {
    const fetchMock = vi.fn(async () => new Response('event: snapshot\ndata: {}\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const app = createProxyApp();

    const response = await app.request('/v1/beasts/events/stream?ticket=ticket-1');

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('http://127.0.0.1:4050/v1/beasts/events/stream?ticket=ticket-1');
  });

  it('injects the effective gateway token for daemon SSE ticket requests', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ticket: 'ticket-1' }));
    vi.stubGlobal('fetch', fetchMock);
    const app = createProxyAppWithGatewayTokenOnly();

    const response = await app.request('/v1/beasts/events/ticket', {
      method: 'POST',
      headers: { 'x-frankenbeast-operator-token': TEST_GATEWAY_TOKEN },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect((init.headers as Headers).get('authorization')).toBe(`Bearer ${TEST_GATEWAY_TOKEN}`);
  });

  it('strips hop-by-hop headers before forwarding daemon requests', async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
    const app = createProxyApp();

    const response = await app.request('/v1/beasts/runs', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TEST_DAEMON_TOKEN}`,
        connection: 'keep-alive, x-remove-me',
        'transfer-encoding': 'chunked',
        'x-remove-me': 'remove-me',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ok: true }),
    });

    expect(response.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    const forwardedHeaders = init.headers as Headers;
    expect(forwardedHeaders.has('connection')).toBe(false);
    expect(forwardedHeaders.has('transfer-encoding')).toBe(false);
    expect(forwardedHeaders.has('x-remove-me')).toBe(false);
    expect(forwardedHeaders.has('host')).toBe(false);
  });
});
