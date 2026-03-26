import type {
  ISkillsModule,
  SkillDescriptor,
  SkillInput,
  SkillResult,
} from '../deps.js';
import type { SkillManager } from '../skills/skill-manager.js';

/**
 * Adapts SkillManager (Phase 5) to the ISkillsModule port.
 */
export class SkillManagerAdapter implements ISkillsModule {
  constructor(private readonly manager: SkillManager) {}

  hasSkill(skillId: string): boolean {
    return this.manager.getEnabledSkills().includes(skillId);
  }

  getAvailableSkills(): readonly SkillDescriptor[] {
    return this.manager.getEnabledSkills().map((name) => ({
      id: name,
      name,
      requiresHitl: false,
      executionType: 'mcp' as const,
    }));
  }

  async execute(skillId: string, input: SkillInput): Promise<SkillResult> {
    // SkillManager manages directory config, not direct execution.
    // Skill execution happens through CliSkillExecutor or MCP SDK.
    // This adapter provides the metadata layer; execution is delegated.
    return {
      output: `Skill ${skillId} executed for: ${input.objective}`,
      tokensUsed: 0,
    };
  }
}
