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

  it('keeps oversized memory injection under the configured budget while preserving priority facts', async () => {
    const llmClient = {
      complete: vi.fn().mockResolvedValue('ok'),
    };
    const oversizedContext: MemoryContext = {
      rules: [
        'User preference: keep responses concise and direct.',
        'Procedure memory: run package tests from the package directory.',
        ...Array.from({ length: 20 }, (_, index) => `Stale rule observation ${index}: ${'low-value '.repeat(10)}`),
      ],
      adrs: [
        'Project convention: use Vitest for TypeScript unit coverage.',
        ...Array.from({ length: 20 }, (_, index) => `Archived ADR note ${index}: ${'legacy '.repeat(12)}`),
      ],
      knownErrors: [
        'Environment memory: CI runs Node 24 with npm workspaces.',
        ...Array.from({ length: 20 }, (_, index) => `Stale observation ${index}: ${'outdated '.repeat(12)}`),
      ],
    };
    const handler = new LlmSkillHandler(llmClient, { memoryContextBudgetChars: 900 });

    await handler.execute('Use memory safely', oversizedContext);

    const prompt = llmClient.complete.mock.calls[0]?.[0] as string;
    const memoryBlock = prompt.slice(prompt.indexOf('Memory Context:'));
    expect(memoryBlock.length).toBeLessThanOrEqual(900);
    expect(memoryBlock).toContain('User preference: keep responses concise and direct.');
    expect(memoryBlock).toContain('Project convention: use Vitest for TypeScript unit coverage.');
    expect(memoryBlock).toContain('Environment memory: CI runs Node 24 with npm workspaces.');
    expect(memoryBlock).toContain('Procedure memory: run package tests from the package directory.');
    expect(memoryBlock).toContain('[memory truncated:');
    expect(memoryBlock).not.toContain('Stale observation 19');
  });

  it('orders truncated memory deterministically by priority before stale observations', async () => {
    const llmClient = {
      complete: vi.fn().mockResolvedValue('ok'),
    };
    const handler = new LlmSkillHandler(llmClient, { memoryContextBudgetChars: 700 });

    await handler.execute('Rank memory', {
      adrs: [
        'Archived ADR: previous migration note.',
        'Project convention: conventional commits are required.',
      ],
      rules: [
        'Stale rule: old status update wording.',
        'User preference: report blockers explicitly.',
        'Procedure memory: trigger @codex review after every PR update.',
      ],
      knownErrors: [
        'Stale observation: old provider outage.',
        'Environment memory: tests run with deterministic Vitest seed.',
      ],
    });

    const prompt = llmClient.complete.mock.calls[0]?.[0] as string;
    const userPreference = prompt.indexOf('User preference: report blockers explicitly.');
    const projectConvention = prompt.indexOf('Project convention: conventional commits are required.');
    const environmentMemory = prompt.indexOf('Environment memory: tests run with deterministic Vitest seed.');
    const procedureMemory = prompt.indexOf('Procedure memory: trigger @codex review after every PR update.');
    const staleObservation = prompt.indexOf('Stale observation: old provider outage.');

    expect(userPreference).toBeGreaterThan(-1);
    expect(projectConvention).toBeGreaterThan(userPreference);
    expect(environmentMemory).toBeGreaterThan(projectConvention);
    expect(procedureMemory).toBeGreaterThan(environmentMemory);
    expect(staleObservation === -1 || staleObservation > procedureMemory).toBe(true);
  });
});
