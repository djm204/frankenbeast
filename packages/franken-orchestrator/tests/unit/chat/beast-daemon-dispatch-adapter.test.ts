import { afterEach, describe, expect, it, vi } from 'vitest';
import { BeastDaemonDispatchAdapter } from '../../../src/chat/beast-daemon-dispatch-adapter.js';

import { testCredential } from '../../support/test-credentials.js';

const TEST_DAEMON_TOKEN = testCredential('TEST_DAEMON_TOKEN');
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
          chatSessionId: 'session-1',
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
      operatorToken: TEST_DAEMON_TOKEN,
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
      expect(headers.get('authorization')).toBe(`Bearer ${TEST_DAEMON_TOKEN}`);
    }
  });

  it('does not call the daemon for ordinary chat turns', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new BeastDaemonDispatchAdapter({
      baseUrl: 'http://127.0.0.1:4050',
      operatorToken: TEST_DAEMON_TOKEN,
    });

    await expect(adapter.handle('hello there', {
      projectId: 'project',
      sessionId: 'session-1',
      transcript: [],
    })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns maintenance guidance when daemon dispatch is paused', async () => {
    const context = {
      agentId: 'agent-1',
      definitionId: 'martin-loop',
      interviewSessionId: 'interview-1',
      status: 'interviewing' as const,
    };
    const fetchMock = vi.fn(async (url: URL | RequestInfo) => {
      const target = url.toString();
      if (target.endsWith('/v1/beasts/catalog')) {
        return Response.json({ data: definitions });
      }
      if (target.endsWith('/v1/beasts/interviews/interview-1/answer')) {
        return Response.json({
          data: {
            complete: true,
            config: { objective: 'Ship it' },
            session: { id: 'interview-1', definitionId: 'martin-loop' },
          },
        });
      }
      if (target.endsWith('/v1/beasts/runs')) {
        return Response.json({
          error: {
            code: 'MAINTENANCE_MODE_ACTIVE',
            message: 'Maintenance mode is active; new Beast dispatch is paused. Reason: deploy',
            details: {
              maintenance: {
                enabled: true,
                reason: 'deploy',
                allowedCommands: ['beasts list', 'beasts maintenance off'],
              },
            },
          },
        }, { status: 423, statusText: 'Locked' });
      }
      return Response.json({ error: 'unexpected' }, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new BeastDaemonDispatchAdapter({
      baseUrl: 'http://127.0.0.1:4050',
      operatorToken: TEST_DAEMON_TOKEN,
    });

    const result = await adapter.handle('Ship it', {
      projectId: 'project',
      sessionId: 'session-1',
      transcript: [],
      beastContext: context,
    });

    expect(result).toMatchObject({
      kind: 'dispatch',
      definitionId: 'martin-loop',
      assistantMessage: expect.stringContaining('Maintenance mode is active'),
      beastContext: null,
    });
    expect(result?.assistantMessage).toContain('Reason: deploy');
    expect(result?.assistantMessage).toContain('beasts maintenance off');
  });

  it('keeps daemon-backed interviews active after invalid option answers', async () => {
    const context = {
      agentId: 'agent-1',
      definitionId: 'martin-loop',
      interviewSessionId: 'interview-1',
      status: 'interviewing' as const,
    };
    const fetchMock = vi.fn(async (url: URL | RequestInfo) => {
      const target = url.toString();
      if (target.endsWith('/v1/beasts/interviews/interview-1/answer')) {
        return Response.json({
          error: {
            code: 'INVALID_INTERVIEW_ANSWER',
            message: "Invalid answer for 'provider': expected one of claude, codex, gemini, aider",
            details: {
              promptKey: 'provider',
              prompt: 'Which provider should run the martin loop?',
              options: ['claude', 'codex', 'gemini', 'aider'],
            },
          },
        }, { status: 400, statusText: 'Bad Request' });
      }
      if (target.endsWith('/v1/beasts/catalog')) {
        return Response.json({ data: definitions });
      }
      return Response.json({ error: 'unexpected' }, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new BeastDaemonDispatchAdapter({
      baseUrl: 'http://127.0.0.1:4050',
      operatorToken: TEST_DAEMON_TOKEN,
    });

    const result = await adapter.handle('not-a-provider', {
      projectId: 'project',
      sessionId: 'session-1',
      transcript: [],
      beastContext: context,
    });

    expect(result).toMatchObject({
      kind: 'interview',
      definitionId: 'martin-loop',
      assistantMessage: expect.stringContaining('Options: claude, codex, gemini, aider'),
      beastContext: expect.objectContaining({
        agentId: 'agent-1',
        interviewSessionId: 'interview-1',
        status: 'interviewing',
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('propagates daemon catalog failures for launch requests', async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new BeastDaemonDispatchAdapter({
      baseUrl: 'http://127.0.0.1:4050',
      operatorToken: TEST_DAEMON_TOKEN,
    });

    await expect(adapter.handle('spawn a martin beast', {
      projectId: 'project',
      sessionId: 'session-1',
      transcript: [],
    })).rejects.toThrow('Beast daemon request failed: 401 Unauthorized');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null for launch requests only after a reachable daemon has no matching definition', async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [{ id: 'chunk-plan', label: 'Chunk Plan' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new BeastDaemonDispatchAdapter({
      baseUrl: 'http://127.0.0.1:4050',
      operatorToken: TEST_DAEMON_TOKEN,
    });

    await expect(adapter.handle('spawn a martin beast', {
      projectId: 'project',
      sessionId: 'session-1',
      transcript: [],
    })).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
