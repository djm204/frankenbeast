import { describe, expect, it, vi } from 'vitest';
import { createChatRuntime } from '../../../src/chat/chat-runtime-factory.js';

describe('chat runtime parity', () => {
  it('preserves CLI continuation semantics through the shared runtime factory', async () => {
    const llm = { complete: vi.fn().mockResolvedValue('continued reply') };
    const runtime = createChatRuntime({
      chatLlm: llm,
      projectName: 'test-project',
      sessionContinuation: true,
    });

    const first = await runtime.runtime.run('hello', {
      pendingApproval: false,
      projectId: 'test-project',
      transcript: [],
    });
    const second = await runtime.runtime.run('second', {
      pendingApproval: false,
      projectId: 'test-project',
      transcript: first.transcript,
    });

    expect(llm.complete).toHaveBeenNthCalledWith(2, 'second');
    expect(second.displayMessages[0]?.kind).toBe('reply');
  });

  it('uses the execution llm for execute outcomes while leaving conversational turns on chat llm', async () => {
    const chatLlm = { complete: vi.fn().mockResolvedValue('ignored chat reply') };
    const executionLlm = { complete: vi.fn().mockResolvedValue('execution result') };
    const runtime = createChatRuntime({
      chatLlm,
      executionLlm,
      projectName: 'test-project',
    });

    const result = await runtime.turnRunner.run({
      kind: 'execute',
      taskDescription: 'implement the dashboard shell',
      approvalRequired: false,
    });

    expect(result.summary).toContain('execution result');
    expect(executionLlm.complete).toHaveBeenCalledWith('implement the dashboard shell');
    expect(chatLlm.complete).not.toHaveBeenCalled();
  });

  it('matches CLI slash-command behavior for /approve when nothing is pending', async () => {
    const runtime = createChatRuntime({
      chatLlm: { complete: vi.fn().mockResolvedValue('ignored') },
      projectName: 'test-project',
    });

    const result = await runtime.runtime.run('/approve', {
      pendingApproval: false,
      projectId: 'test-project',
      transcript: [],
    });

    expect(result.displayMessages[0]?.content).toBe('Nothing pending.');
    expect(result.pendingApproval).toBe(false);
  });
});
