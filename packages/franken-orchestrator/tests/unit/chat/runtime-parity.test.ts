import { describe, expect, it, vi } from 'vitest';
import type { ConversationEngine } from '../../../src/chat/conversation-engine.js';
import { createChatRuntime } from '../../../src/chat/chat-runtime-factory.js';
import { ChatRuntime } from '../../../src/chat/runtime.js';
import { TurnRunner } from '../../../src/chat/turn-runner.js';

describe('chat runtime parity', () => {
  it('preserves CLI continuation semantics through the shared runtime factory', async () => {
    const llm = { complete: vi.fn().mockResolvedValue('continued reply') };
    const runtime = createChatRuntime({
      chatLlm: llm,
      projectName: 'test-project',
      sessionContinuation: true,
    });

    const first = await runtime.runtime.run('hello', {
      sessionId: 'session-1',
      pendingApproval: false,
      projectId: 'test-project',
      transcript: [],
    });
    const second = await runtime.runtime.run('second', {
      sessionId: 'session-1',
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
    }, { sessionId: 'session-1' });

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
      sessionId: 'session-1',
      pendingApproval: false,
      projectId: 'test-project',
      transcript: [],
    });

    expect(result.displayMessages[0]?.content).toBe('Nothing pending.');
    expect(result.pendingApproval).toBe(false);
  });

  it('returns approval context for execution turns requiring approval', async () => {
    const runtime = new ChatRuntime({
      engine: {
        processTurn: vi.fn().mockResolvedValue({
          tier: 'premium_execution',
          newMessages: [],
          outcome: {
            kind: 'execute',
            taskDescription: 'deploy staging',
            approvalRequired: true,
          },
        }),
      } as unknown as ConversationEngine,
      turnRunner: new TurnRunner({ execute: vi.fn() }),
    });

    const result = await runtime.run('deploy staging', {
      sessionId: 'session-1',
      pendingApproval: false,
      projectId: 'test-project',
      transcript: [],
    });

    expect(result.pendingApproval).toBe(true);
    expect(result.pendingApprovalDescription).toBe('deploy staging');
    expect(result.pendingApprovalContext).toEqual(expect.objectContaining({
      tool: 'execution',
      command: 'deploy staging',
      risk: expect.stringContaining('Requires explicit approval'),
      sessionId: 'session-1',
    }));
  });

  it('blocks normal chat turns while approval is pending', async () => {
    const engine = { processTurn: vi.fn() };
    const runner = new TurnRunner({ execute: vi.fn() });
    const runtime = new ChatRuntime({
      engine: engine as unknown as ConversationEngine,
      turnRunner: runner,
    });
    const transcript = [
      { role: 'assistant' as const, content: 'approval required: deploy staging', timestamp: '2026-07-09T00:00:00.000Z' },
    ];

    const result = await runtime.run('please continue anyway', {
      sessionId: 'session-1',
      pendingApproval: true,
      projectId: 'test-project',
      transcript,
    });

    expect(result.state).toBe('pending_approval');
    expect(result.pendingApproval).toBe(true);
    expect(result.transcript).toBe(transcript);
    expect(result.displayMessages[0]).toMatchObject({
      kind: 'approval',
      content: expect.stringContaining('Approval is pending'),
    });
    expect(engine.processTurn).not.toHaveBeenCalled();
  });

  it('blocks mutating slash commands while approval is pending', async () => {
    const runtime = createChatRuntime({
      chatLlm: { complete: vi.fn().mockResolvedValue('chat ignored') },
      executionLlm: { complete: vi.fn().mockResolvedValue('execution ignored') },
      projectName: 'test-project',
    });

    const result = await runtime.runtime.run('/run deploy something else', {
      sessionId: 'session-1',
      pendingApproval: true,
      pendingApprovalDescription: 'deploy staging',
      pendingApprovalContext: { tool: 'execution', command: 'deploy staging', sessionId: 'session-1' },
      projectId: 'test-project',
      transcript: [],
    });

    expect(result.state).toBe('pending_approval');
    expect(result.pendingApproval).toBe(true);
    expect(result.pendingApprovalDescription).toBe('deploy staging');
    expect(result.pendingApprovalContext).toEqual(expect.objectContaining({ command: 'deploy staging' }));
    expect(result.displayMessages[0]?.content).toContain('Approval is pending');
  });

  it('maps comms rejection action text to a rejected approval state', async () => {
    const runtime = createChatRuntime({
      chatLlm: { complete: vi.fn().mockResolvedValue('chat ignored') },
      projectName: 'test-project',
    });

    const result = await runtime.runtime.run('Action rejected by user: reject', {
      sessionId: 'session-1',
      pendingApproval: true,
      pendingApprovalDescription: 'deploy staging',
      pendingApprovalContext: { tool: 'execution', command: 'deploy staging', sessionId: 'session-1' },
      projectId: 'test-project',
      transcript: [],
    });

    expect(result.state).toBe('rejected');
    expect(result.pendingApproval).toBe(false);
    expect(result.displayMessages[0]).toMatchObject({ kind: 'approval', content: 'Rejected.' });
  });
});
