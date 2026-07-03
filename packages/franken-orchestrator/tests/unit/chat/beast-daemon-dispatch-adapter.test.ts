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
      if (target.endsWith('/v1/beasts/agents')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          definitionId: 'martin-loop',
          chatSessionId: 'session-1',
          autoDispatch: false,
        });
        return Response.json({ data: { id: 'agent-1' } }, { status: 201 });
      }
      if (target.endsWith('/v1/beasts/runs')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          definitionId: 'martin-loop',
          trackedAgentId: 'agent-1',
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
    expect(interview?.beastContext?.agentId).toBe('agent-1');

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

  it('does not call the daemon for ordinary chat turns', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new BeastDaemonDispatchAdapter({
      baseUrl: 'http://127.0.0.1:4050',
      operatorToken: 'daemon-token',
    });

    await expect(adapter.handle('hello there', {
      projectId: 'project',
      sessionId: 'session-1',
      transcript: [],
    })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
