import { describe, it, expect, vi } from 'vitest';
import { ConversationEngine } from '../../../src/chat/conversation-engine.js';
import type { ILlmClient } from '@franken/core';
import type { TranscriptMessage } from '../../../src/chat/types.js';

describe('Cost Budget Enforcement', () => {
  it('rejects turns when session budget is exceeded', async () => {
    const llm: ILlmClient = { complete: vi.fn().mockResolvedValue('Reply') };
    const engine = new ConversationEngine({
      llm,
      projectName: 'test',
      budgetPerSession: 0.01, // very low budget
    });

    // Simulate history that already consumed the budget
    const history: TranscriptMessage[] = [
      {
        role: 'assistant',
        content: 'Previous reply',
        timestamp: new Date().toISOString(),
        modelTier: 'cheap',
        tokens: 100000,
        costUsd: 0.02,
      },
    ];

    const result = await engine.processTurn('hello', history);
    expect(result.outcome.kind).toBe('reply');
    if (result.outcome.kind === 'reply') {
      expect(result.outcome.content.toLowerCase()).toContain('budget');
    }
    // LLM should NOT have been called — budget already exceeded
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('allows turns when budget is not exceeded', async () => {
    const llm: ILlmClient = {
      complete: vi.fn().mockResolvedValue('Hello back!'),
    };
    const engine = new ConversationEngine({
      llm,
      projectName: 'test',
      budgetPerSession: 1.0,
    });

    const history: TranscriptMessage[] = [
      {
        role: 'assistant',
        content: 'Previous reply',
        timestamp: new Date().toISOString(),
        modelTier: 'cheap',
        tokens: 100,
        costUsd: 0.001,
      },
    ];

    const result = await engine.processTurn('hello', history);
    expect(result.outcome.kind).toBe('reply');
    if (result.outcome.kind === 'reply') {
      expect(result.outcome.content).toBe('Hello back!');
    }
    expect(llm.complete).toHaveBeenCalled();
  });

  it('allows turns when no budget is configured', async () => {
    const llm: ILlmClient = {
      complete: vi.fn().mockResolvedValue('No budget limit'),
    };
    const engine = new ConversationEngine({
      llm,
      projectName: 'test',
      // no budgetPerSession
    });

    const history: TranscriptMessage[] = [
      {
        role: 'assistant',
        content: 'Expensive reply',
        timestamp: new Date().toISOString(),
        costUsd: 999,
      },
    ];

    const result = await engine.processTurn('hello', history);
    expect(result.outcome.kind).toBe('reply');
    if (result.outcome.kind === 'reply') {
      expect(result.outcome.content).toBe('No budget limit');
    }
  });

  it('sums costUsd across all history messages', async () => {
    const llm: ILlmClient = { complete: vi.fn().mockResolvedValue('Reply') };
    const engine = new ConversationEngine({
      llm,
      projectName: 'test',
      budgetPerSession: 0.05,
    });

    const history: TranscriptMessage[] = [
      {
        role: 'assistant',
        content: 'Reply 1',
        timestamp: new Date().toISOString(),
        costUsd: 0.02,
      },
      {
        role: 'assistant',
        content: 'Reply 2',
        timestamp: new Date().toISOString(),
        costUsd: 0.02,
      },
      {
        role: 'assistant',
        content: 'Reply 3',
        timestamp: new Date().toISOString(),
        costUsd: 0.02,
      },
    ];

    // Total = 0.06 > budget of 0.05
    const result = await engine.processTurn('hello', history);
    expect(result.outcome.kind).toBe('reply');
    if (result.outcome.kind === 'reply') {
      expect(result.outcome.content.toLowerCase()).toContain('budget');
    }
    expect(llm.complete).not.toHaveBeenCalled();
  });
});
