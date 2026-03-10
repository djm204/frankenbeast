import { describe, expect, it, vi } from 'vitest';
import { ChatBeastDispatchAdapter } from '../../../src/chat/beast-dispatch-adapter.js';
import type { BeastCatalogService } from '../../../src/beasts/services/beast-catalog-service.js';
import type { BeastDispatchService } from '../../../src/beasts/services/beast-dispatch-service.js';
import type { BeastInterviewService } from '../../../src/beasts/services/beast-interview-service.js';
import type { BeastInterviewPrompt } from '../../../src/beasts/types.js';

const providerPrompt: BeastInterviewPrompt = {
  key: 'provider',
  prompt: 'Which provider should run the martin loop?',
  kind: 'string',
  required: true,
  options: ['claude', 'codex'],
};

const objectivePrompt: BeastInterviewPrompt = {
  key: 'objective',
  prompt: 'What should the martin loop accomplish?',
  kind: 'string',
  required: true,
};

describe('ChatBeastDispatchAdapter', () => {
  it('starts a persisted interview when chat asks to spawn a beast', async () => {
    const adapter = new ChatBeastDispatchAdapter({
      catalog: {
        listDefinitions: () => [
          { id: 'martin-loop', label: 'Martin Loop' },
        ],
      } as unknown as BeastCatalogService,
      interviews: {
        start: vi.fn(() => ({
          id: 'interview-1',
          definitionId: 'martin-loop',
          status: 'active',
          answers: {},
          createdAt: '2026-03-10T00:00:00.000Z',
          updatedAt: '2026-03-10T00:00:00.000Z',
          currentPrompt: providerPrompt,
        })),
      } as unknown as BeastInterviewService,
      dispatch: {} as BeastDispatchService,
    });

    const result = await adapter.handle('spawn a martin beast', {
      projectId: 'proj',
      sessionId: 'chat-1',
      transcript: [],
    });

    expect(result).toMatchObject({
      definitionId: 'martin-loop',
      kind: 'interview',
      beastContext: {
        definitionId: 'martin-loop',
        interviewSessionId: 'interview-1',
        status: 'interviewing',
      },
    });
    expect(result?.assistantMessage).toContain('Which provider should run the martin loop?');
  });

  it('answers interview prompts and dispatches a Beast run when the interview completes', async () => {
    const answer = vi
      .fn()
      .mockReturnValueOnce({
        session: {
          id: 'interview-1',
          definitionId: 'martin-loop',
          status: 'active',
          answers: { provider: 'claude' },
          createdAt: '2026-03-10T00:00:00.000Z',
          updatedAt: '2026-03-10T00:00:01.000Z',
          currentPrompt: objectivePrompt,
        },
        currentPrompt: objectivePrompt,
        complete: false,
      })
      .mockReturnValueOnce({
        session: {
          id: 'interview-1',
          definitionId: 'martin-loop',
          status: 'completed',
          answers: { provider: 'claude', objective: 'Ship Beast monitoring' },
          createdAt: '2026-03-10T00:00:00.000Z',
          updatedAt: '2026-03-10T00:00:02.000Z',
        },
        complete: true,
        config: { provider: 'claude', objective: 'Ship Beast monitoring' },
      });
    const createRun = vi.fn().mockResolvedValue({
      id: 'run-1',
      definitionId: 'martin-loop',
      status: 'running',
      dispatchedBy: 'chat',
    });
    const adapter = new ChatBeastDispatchAdapter({
      catalog: {
        listDefinitions: () => [
          { id: 'martin-loop', label: 'Martin Loop' },
        ],
      } as unknown as BeastCatalogService,
      interviews: {
        answer,
      } as unknown as BeastInterviewService,
      dispatch: {
        createRun,
      } as unknown as BeastDispatchService,
    });

    const nextPrompt = await adapter.handle('claude', {
      projectId: 'proj',
      sessionId: 'chat-1',
      transcript: [],
      beastContext: {
        definitionId: 'martin-loop',
        interviewSessionId: 'interview-1',
        status: 'interviewing',
      },
    });

    expect(nextPrompt).toMatchObject({
      kind: 'interview',
      assistantMessage: expect.stringContaining('What should the martin loop accomplish?'),
      beastContext: {
        definitionId: 'martin-loop',
        interviewSessionId: 'interview-1',
        status: 'interviewing',
      },
    });

    const dispatched = await adapter.handle('Ship Beast monitoring', {
      projectId: 'proj',
      sessionId: 'chat-1',
      transcript: [],
      beastContext: {
        definitionId: 'martin-loop',
        interviewSessionId: 'interview-1',
        status: 'interviewing',
      },
    });

    expect(createRun).toHaveBeenCalledWith({
      definitionId: 'martin-loop',
      config: { provider: 'claude', objective: 'Ship Beast monitoring' },
      dispatchedBy: 'chat',
      dispatchedByUser: 'chat-session:chat-1',
      startNow: true,
    });
    expect(dispatched).toMatchObject({
      kind: 'dispatch',
      assistantMessage: expect.stringContaining('run-1'),
      beastContext: null,
      runId: 'run-1',
    });
  });
});
