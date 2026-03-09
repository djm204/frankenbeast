import { describe, expect, it, vi } from 'vitest';
import { ConversationEngine } from '../../../src/chat/conversation-engine.js';
import { ChatRuntime } from '../../../src/chat/runtime.js';
import { TurnRunner } from '../../../src/chat/turn-runner.js';

describe('chat runtime parity', () => {
  it('preserves CLI continuation semantics through shared runtime configuration', async () => {
    const llm = { complete: vi.fn().mockResolvedValue('continued reply') };
    const engine = new ConversationEngine({
      llm,
      projectName: 'test-project',
      sessionContinuation: true,
    });
    const runtime = new ChatRuntime({
      engine,
      turnRunner: new TurnRunner({
        execute: vi.fn().mockResolvedValue({
          status: 'success',
          summary: 'done',
          filesChanged: [],
          testsRun: 0,
          errors: [],
        }),
      }),
    });

    const first = await runtime.run('hello', {
      pendingApproval: false,
      projectId: 'test-project',
      transcript: [],
    });
    const second = await runtime.run('second', {
      pendingApproval: false,
      projectId: 'test-project',
      transcript: first.transcript,
    });

    expect(llm.complete).toHaveBeenNthCalledWith(2, 'second');
    expect(second.displayMessages[0]?.kind).toBe('reply');
  });

  it('matches CLI slash-command behavior for /approve when nothing is pending', async () => {
    const runtime = new ChatRuntime({
      engine: new ConversationEngine({
        llm: { complete: vi.fn().mockResolvedValue('ignored') },
        projectName: 'test-project',
      }),
      turnRunner: new TurnRunner({
        execute: vi.fn().mockResolvedValue({
          status: 'success',
          summary: 'done',
          filesChanged: [],
          testsRun: 0,
          errors: [],
        }),
      }),
    });

    const result = await runtime.run('/approve', {
      pendingApproval: false,
      projectId: 'test-project',
      transcript: [],
    });

    expect(result.displayMessages[0]?.content).toBe('Nothing pending.');
    expect(result.pendingApproval).toBe(false);
  });
});
