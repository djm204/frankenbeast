import { describe, it, expect, vi } from 'vitest';
import { SkillsPortAdapter } from '../../../src/adapters/skills-adapter.js';
import type { SkillInput } from '../../../src/deps.js';

interface TestSkillContract {
  skill_id: string;
  metadata: { name: string; description: string; source: string };
  interface: { input_schema: Record<string, unknown>; output_schema: Record<string, unknown> };
  constraints: { is_destructive: boolean; requires_hitl: boolean; sandbox_type: string };
}

class FakeSkillRegistry {
  constructor(private readonly skills: TestSkillContract[]) {}

  hasSkill(id: string): boolean {
    return this.skills.some(skill => skill.skill_id === id);
  }

  getSkill(id: string): TestSkillContract | undefined {
    return this.skills.find(skill => skill.skill_id === id);
  }

  getAll(): TestSkillContract[] {
    return this.skills;
  }
}

const baseSkill: TestSkillContract = {
  skill_id: 'base',
  metadata: { name: 'Base Skill', description: 'Base', source: 'LOCAL' },
  interface: { input_schema: {}, output_schema: {} },
  constraints: { is_destructive: false, requires_hitl: false, sandbox_type: 'LOCAL' },
};

const input: SkillInput = {
  objective: 'Do the thing',
  context: { adrs: [], knownErrors: [], rules: [] },
  dependencyOutputs: new Map(),
  sessionId: 'sess-1',
  projectId: 'proj-1',
};

describe('SkillsPortAdapter', () => {
  it('dispatches llm skills via ILlmClient.complete', async () => {
    const registry = new FakeSkillRegistry([
      { ...baseSkill, skill_id: 'llm-skill', metadata: { ...baseSkill.metadata, name: 'LLM' } },
    ]);
    const llmClient = { complete: vi.fn().mockResolvedValue('LLM output') };
    const adapter = new SkillsPortAdapter(registry, llmClient);

    const result = await adapter.execute('llm-skill', input);

    expect(llmClient.complete).toHaveBeenCalledWith('Do the thing');
    expect(result).toEqual({ output: 'LLM output' });
  });

  it('dispatches function skills via registered handler', async () => {
    const registry = new FakeSkillRegistry([
      { ...baseSkill, skill_id: 'fn-skill', metadata: { ...baseSkill.metadata, name: 'Fn' } },
    ]);
    const llmClient = { complete: vi.fn() };
    const adapter = new SkillsPortAdapter(registry, llmClient);
    const handler = vi.fn().mockResolvedValue({ output: 'handled', tokensUsed: 1 });

    adapter.registerHandler('fn-skill', handler);

    const result = await adapter.execute('fn-skill', input);

    expect(handler).toHaveBeenCalledWith(input);
    expect(result).toEqual({ output: 'handled', tokensUsed: 1 });
    expect(llmClient.complete).not.toHaveBeenCalled();
  });

  it('dispatches mcp skills via IMcpModule.callTool', async () => {
    const registry = new FakeSkillRegistry([
      { ...baseSkill, skill_id: 'mcp-skill', metadata: { ...baseSkill.metadata, name: 'MCP' } },
    ]);
    const llmClient = { complete: vi.fn() };
    const mcp = {
      callTool: vi.fn().mockResolvedValue({ content: 'mcp-result', isError: false }),
      getAvailableTools: () => [{ name: 'mcp-skill', serverId: 'srv', description: 'desc' }],
    };

    const adapter = new SkillsPortAdapter(registry, llmClient, mcp);

    const result = await adapter.execute('mcp-skill', input);

    expect(mcp.callTool).toHaveBeenCalledWith('mcp-skill', input);
    expect(result).toEqual({ output: { content: 'mcp-result', isError: false } });
  });

  it('throws a descriptive error when skill is missing', async () => {
    const registry = new FakeSkillRegistry([]);
    const llmClient = { complete: vi.fn() };
    const adapter = new SkillsPortAdapter(registry, llmClient);

    await expect(adapter.execute('missing-skill', input)).rejects.toThrow(
      'Skill not found: missing-skill',
    );
  });
});
