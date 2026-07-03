import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChatApp } from '../../../src/http/chat-app.js';

function createProxyApp() {
  return createChatApp({
    sessionStoreDir: '/tmp/chat-app-beast-daemon-proxy-test',
    llm: { complete: vi.fn().mockResolvedValue('hello') },
    projectName: 'proxy-test',
    beastDaemon: {
      baseUrl: 'http://127.0.0.1:4050',
      operatorToken: 'daemon-token',
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
      headers: { authorization: 'Bearer daemon-token' },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('http://127.0.0.1:4050/v1/beasts/catalog?limit=1');
    expect((init.headers as Headers).get('authorization')).toBe('Bearer daemon-token');
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
});
