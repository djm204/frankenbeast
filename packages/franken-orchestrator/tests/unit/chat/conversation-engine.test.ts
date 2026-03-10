import { describe, it, expect, vi } from 'vitest';
import { ConversationEngine } from '../../../src/chat/conversation-engine.js';
import { ModelTier } from '../../../src/chat/types.js';
import type { ILlmClient } from '@franken/core';

function mockLlm(response = 'Mock response'): ILlmClient {
  return { complete: vi.fn().mockResolvedValue(response) };
}

describe('ConversationEngine', () => {
  it('processes a simple chat turn end-to-end', async () => {
    const llm = mockLlm('Hello back!');
    const engine = new ConversationEngine({ llm, projectName: 'test' });
    const result = await engine.processTurn('hello', []);

    expect(result.outcome.kind).toBe('reply');
    if (result.outcome.kind === 'reply') {
      expect(result.outcome.content).toBe('Hello back!');
    }
    expect(result.tier).toBe(ModelTier.Cheap);
  });

  it('calls the LLM for reply outcomes', async () => {
    const llm = mockLlm('response');
    const engine = new ConversationEngine({ llm, projectName: 'test' });
    await engine.processTurn('how are you?', []);
    expect(llm.complete).toHaveBeenCalled();
  });

  it('does NOT call the LLM for execute outcomes', async () => {
    const llm = mockLlm();
    const engine = new ConversationEngine({ llm, projectName: 'test' });
    const result = await engine.processTurn('fix the login bug in auth.ts', []);
    expect(result.outcome.kind).toBe('execute');
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('records transcript messages for reply turns', async () => {
    const llm = mockLlm('Hi!');
    const engine = new ConversationEngine({ llm, projectName: 'test' });
    const result = await engine.processTurn('hello', []);

    expect(result.newMessages).toHaveLength(2); // user + assistant
    expect(result.newMessages[0]!.role).toBe('user');
    expect(result.newMessages[1]!.role).toBe('assistant');
    expect(result.newMessages[1]!.modelTier).toBe(ModelTier.Cheap);
  });

  it('catches LLM errors and returns error reply', async () => {
    const llm: ILlmClient = { complete: vi.fn().mockRejectedValue(new Error('API timeout')) };
    const engine = new ConversationEngine({ llm, projectName: 'test' });
    const result = await engine.processTurn('hello', []);

    expect(result.outcome.kind).toBe('reply');
    if (result.outcome.kind === 'reply') {
      expect(result.outcome.content.toLowerCase()).toContain('error');
    }
  });
});
