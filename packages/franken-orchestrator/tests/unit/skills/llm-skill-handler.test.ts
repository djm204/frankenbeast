import { describe, it, expect, vi } from 'vitest';
import type { MemoryContext } from '../../../src/deps.js';
import { LlmSkillHandler } from '../../../src/skills/llm-skill-handler.js';

describe('LlmSkillHandler', () => {
  const context: MemoryContext = {
    adrs: ['ADR-001: Prefer deterministic outputs'],
    rules: ['Always validate inputs', 'No network calls'],
    knownErrors: ['Timeout when payload exceeds 1MB'],
  };

  it('builds a prompt from the objective and context and returns LLM output', async () => {
    const llmClient = {
      complete: vi.fn().mockResolvedValue('LLM result'),
    };
    const handler = new LlmSkillHandler(llmClient);

    const result = await handler.execute('Summarize the plan', context);

    const prompt = llmClient.complete.mock.calls[0]?.[0] as string;
    expect(prompt).toContain('Summarize the plan');
    expect(prompt).toContain('ADR-001: Prefer deterministic outputs');
    expect(prompt).toContain('Always validate inputs');
    expect(prompt).toContain('Timeout when payload exceeds 1MB');
    expect(result.output).toBe('LLM result');

    const expectedTokens = Math.ceil((prompt.length + 'LLM result'.length) / 4);
    expect(result.tokensUsed).toBe(expectedTokens);
  });

  it('wraps LLM errors with objective context', async () => {
    const llmClient = {
      complete: vi.fn().mockRejectedValue(new Error('Service unavailable')),
    };
    const handler = new LlmSkillHandler(llmClient);

    await expect(handler.execute('Draft release notes', context)).rejects.toThrow(
      'Skill execution failed for objective "Draft release notes": Service unavailable',
    );
  });
});
