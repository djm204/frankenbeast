import { afterEach, describe, expect, it, vi } from 'vitest';
import { BeastDaemonDispatchAdapter } from '../../../src/chat/beast-daemon-dispatch-adapter.js';

const definitions = [
  { id: 'martin-loop', label: 'Martin Loop' },
];

describe('BeastDaemonDispatchAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drives chat Beast interview and dispatch through the daemon API', async () => {
    const fetchMock = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      const target = url.toString();
      if (target.endsWith('/v1/beasts/catalog')) {
        return Response.json({ data: definitions });
      }
      if (target.endsWith('/v1/beasts/interviews/martin-loop/start')) {
        return Response.json({
          data: {
            id: 'interview-1',
            definitionId: 'martin-loop',
            currentPrompt: { prompt: 'Objective?' },
          },
        });
      }
      if (target.endsWith('/v1/beasts/interviews/interview-1/answer')) {
        expect(JSON.parse(String(init?.body))).toEqual({ answer: 'Ship it' });
        return Response.json({
          data: {
            complete: true,
            config: { objective: 'Ship it' },
            session: { id: 'interview-1', definitionId: 'martin-loop' },
          },
        });
      }
      if (target.endsWith('/v1/beasts/runs')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          definitionId: 'martin-loop',
          config: { objective: 'Ship it' },
          executionMode: 'container',
          startNow: true,
        });
        return Response.json({ data: { id: 'run-1', status: 'running' } }, { status: 201 });
      }
      return Response.json({ error: 'unexpected' }, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new BeastDaemonDispatchAdapter({
      baseUrl: 'http://127.0.0.1:4050',
      operatorToken: 'daemon-token',
    });

    const interview = await adapter.handle('spawn a martin beast', {
      projectId: 'project',
      sessionId: 'session-1',
      transcript: [],
      executionMode: 'container',
    });

    expect(interview?.kind).toBe('interview');
    expect(interview?.assistantMessage).toContain('Objective?');

    const dispatched = await adapter.handle('Ship it', {
      projectId: 'project',
      sessionId: 'session-1',
      transcript: [],
      beastContext: interview?.beastContext,
      executionMode: 'container',
    });

    expect(dispatched).toMatchObject({
      kind: 'dispatch',
      runId: 'run-1',
      beastContext: null,
    });
    for (const call of fetchMock.mock.calls) {
      const headers = new Headers(call[1]?.headers);
      expect(headers.get('authorization')).toBe('Bearer daemon-token');
    }
  });
});
