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

  it('truncates an oversized priority memory instead of replacing it with lower-priority facts', async () => {
    const llmClient = {
      complete: vi.fn().mockResolvedValue('ok'),
    };
    const handler = new LlmSkillHandler(llmClient, { memoryContextBudgetChars: 180 });

    await handler.execute('Keep top priority memory', {
      rules: [
        `User preference: ${'critical preference '.repeat(20)}`,
        'Stale rule: tiny but outdated.',
      ],
      adrs: [],
      knownErrors: [],
    });

    const prompt = llmClient.complete.mock.calls[0]?.[0] as string;
    const memoryBlock = prompt.slice(prompt.indexOf('Memory Context:'));
    expect(memoryBlock.length).toBeLessThanOrEqual(180);
    expect(memoryBlock).toContain('User preference: critical preference');
    expect(memoryBlock).toContain('…');
    expect(memoryBlock).toContain('[memory truncated: 1 lower-priority entry omitted]');
    expect(memoryBlock).not.toContain('Stale rule: tiny but outdated.');
  });

  it('preserves insertion order for same-priority known errors so newest failures stay first', async () => {
    const llmClient = {
      complete: vi.fn().mockResolvedValue('ok'),
    };
    const handler = new LlmSkillHandler(llmClient, { memoryContextBudgetChars: 230 });

    await handler.execute('Recover from errors', {
      adrs: [],
      rules: [],
      knownErrors: [
        'Z newest failure from recentFailures should remain first.',
        'A older failure sorts alphabetically first but is less recent.',
        'M oldest failure should be omitted under the budget.',
      ],
    });

    const prompt = llmClient.complete.mock.calls[0]?.[0] as string;
    expect(prompt.indexOf('Z newest failure')).toBeLessThan(prompt.indexOf('A older failure'));
  });

  it('demotes stale category-labeled memories before active facts', async () => {
    const llmClient = {
      complete: vi.fn().mockResolvedValue('ok'),
    };
    const handler = new LlmSkillHandler(llmClient, { memoryContextBudgetChars: 260 });

    await handler.execute('Ignore stale facts', {
      adrs: ['Project convention: active TypeScript convention.'],
      rules: [
        'Stale user preference: outdated verbose status reports.',
        'User preference: active concise status reports.',
      ],
      knownErrors: ['Stale environment memory: retired Node version.'],
    });

    const prompt = llmClient.complete.mock.calls[0]?.[0] as string;
    const activePreference = prompt.indexOf('User preference: active concise status reports.');
    const activeProject = prompt.indexOf('Project convention: active TypeScript convention.');
    const stalePreference = prompt.indexOf('Stale user preference: outdated verbose status reports.');

    expect(activePreference).toBeGreaterThan(-1);
    expect(activeProject).toBeGreaterThan(activePreference);
    expect(stalePreference === -1 || stalePreference > activeProject).toBe(true);
  });

  it('does not demote active memories that mention stale resources', async () => {
    const llmClient = {
      complete: vi.fn().mockResolvedValue('ok'),
    };
    const handler = new LlmSkillHandler(llmClient, { memoryContextBudgetChars: 260 });

    await handler.execute('Keep active stale-branch preference', {
      adrs: ['ADR-002: generic architecture rule.'],
      rules: [
        'Generic rule that should come after preferences.',
        'User preference: warn before deleting stale branches.',
      ],
      knownErrors: [],
    });

    const prompt = llmClient.complete.mock.calls[0]?.[0] as string;
    expect(prompt.indexOf('User preference: warn before deleting stale branches.')).toBeLessThan(
      prompt.indexOf('Generic rule that should come after preferences.'),
    );
  });

  it('coerces restored non-string memory values before ranking', async () => {
    const llmClient = {
      complete: vi.fn().mockResolvedValue('ok'),
    };
    const handler = new LlmSkillHandler(llmClient);
    const restoredContext = {
      adrs: [404],
      rules: ['User preference: keep recovered facts visible.'],
      knownErrors: [{ code: 'E_RESTORED' }],
    } as unknown as MemoryContext;

    await expect(handler.execute('Handle restored context', restoredContext)).resolves.toMatchObject({ output: 'ok' });
    const prompt = llmClient.complete.mock.calls[0]?.[0] as string;
    expect(prompt).toContain('404');
    expect(prompt).toContain('[object Object]');
  });

  it('does not reserve a truncation marker when all memory entries fit', async () => {
    const llmClient = {
      complete: vi.fn().mockResolvedValue('ok'),
    };
    const handler = new LlmSkillHandler(llmClient, { memoryContextBudgetChars: 145 });

    await handler.execute('Render fitting memory', {
      adrs: [],
      rules: [
        'User preference: keep this medium-sized preference in context.',
        'Tiny rule.',
      ],
      knownErrors: [],
    });

    const prompt = llmClient.complete.mock.calls[0]?.[0] as string;
    const memoryBlock = prompt.slice(prompt.indexOf('Memory Context:'));
    expect(memoryBlock.length).toBeLessThanOrEqual(145);
    expect(memoryBlock).toContain('User preference: keep this medium-sized preference in context.');
    expect(memoryBlock).toContain('Tiny rule.');
    expect(memoryBlock).not.toContain('[memory truncated:');
  });
});
