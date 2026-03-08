import { describe, it, expect, vi } from 'vitest';
import { LlmSummarisationStrategy } from '../../../src/compression/llm-summarisation-strategy.js';
import type { ILlmClient } from '../../../src/compression/llm-client-interface.js';
import type { WorkingTurn } from '../../../src/types/index.js';
import { generateId } from '../../../src/types/index.js';

function t(content: string, tokenCount = 20, overrides: Partial<WorkingTurn> = {}): WorkingTurn {
  return {
    id: generateId(),
    type: 'working',
    projectId: 'p',
    status: 'pending',
    createdAt: Date.now(),
    role: 'user',
    content,
    tokenCount,
    ...overrides,
  };
}

function makeLlmClient(response = 'This is a summary.'): ILlmClient {
  return { complete: vi.fn(async () => response) };
}

describe('LlmSummarisationStrategy', () => {
  it('calls ILlmClient.complete() with a prompt containing the turn content', async () => {
    const llm = makeLlmClient();
    const strategy = new LlmSummarisationStrategy(llm);
    const turns = [t('first message'), t('second message')];

    await strategy.compress(turns, 200);

    expect(llm.complete).toHaveBeenCalledOnce();
    const prompt = vi.mocked(llm.complete).mock.calls[0]![0];
    expect(prompt).toContain('first message');
    expect(prompt).toContain('second message');
  });

  it('prompt includes instruction to preserve tool outputs', async () => {
    const llm = makeLlmClient();
    const strategy = new LlmSummarisationStrategy(llm);
    await strategy.compress([t('x', 10, { role: 'tool' })], 100);
    const prompt = vi.mocked(llm.complete).mock.calls[0]![0];
    expect(prompt.toLowerCase()).toMatch(/tool/);
  });

  it('returns a single summary WorkingTurn with role=assistant', async () => {
    const strategy = new LlmSummarisationStrategy(makeLlmClient('A concise summary.'));
    const result = await strategy.compress([t('a'), t('b')], 200);
    expect(result.summary.role).toBe('assistant');
    expect(result.summary.type).toBe('working');
  });

  it('summary content is the LLM response', async () => {
    const strategy = new LlmSummarisationStrategy(makeLlmClient('LLM wrote this.'));
    const result = await strategy.compress([t('x')], 100);
    expect(result.summary.content).toBe('LLM wrote this.');
  });

  it('droppedCount equals the number of input turns', async () => {
    const strategy = new LlmSummarisationStrategy(makeLlmClient());
    const turns = [t('a'), t('b'), t('c')];
    const result = await strategy.compress(turns, 200);
    expect(result.droppedCount).toBe(3);
  });

  it('summary tokenCount is the character length divided by 4 (tiktoken approximation)', async () => {
    const text = 'A'.repeat(40); // 40 chars → 10 tokens approx
    const strategy = new LlmSummarisationStrategy(makeLlmClient(text));
    const result = await strategy.compress([t('x')], 100);
    expect(result.summary.tokenCount).toBe(10);
  });

  it('falls back to TruncationStrategy when ILlmClient throws', async () => {
    const failingLlm: ILlmClient = {
      complete: vi.fn(async () => { throw new Error('LLM unavailable'); }),
    };
    const strategy = new LlmSummarisationStrategy(failingLlm);
    const turns = [t('a', 60), t('b', 60)];

    // Should not throw — falls back to truncation
    const result = await strategy.compress(turns, 70);
    expect(result.summary).toBeDefined();
    expect(result.droppedCount).toBeGreaterThan(0);
  });

  it('summary has a new ULID id (not one of the input ids)', async () => {
    const strategy = new LlmSummarisationStrategy(makeLlmClient());
    const turns = [t('x')];
    const result = await strategy.compress(turns, 200);
    expect(turns.map((x) => x.id)).not.toContain(result.summary.id);
  });
});
