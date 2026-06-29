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
    return this.manager.getEnabledSkills().some((enabledSkill) => (
      enabledSkill === skillId || this.manager.readTools(enabledSkill).some(tool => tool.name === skillId)
    ));
  }

  getAvailableSkills(): readonly SkillDescriptor[] {
    return this.manager.getEnabledSkills().flatMap((name) => {
      const tools = this.manager.readTools(name);

      if (tools.length > 1) {
        return tools.map((tool) => ({
          id: tool.name,
          name: tool.name,
          requiresHitl: false,
          executionType: 'mcp' as const,
        }));
      }

      return [{
        id: name,
        name,
        requiresHitl: false,
        executionType: 'mcp' as const,
      }];
    });
  }

  async execute(skillId: string, input: SkillInput): Promise<SkillResult> {
    void input;
    throw new Error(
      `MCP skill '${skillId}' cannot be executed by SkillManagerAdapter directly. ` +
        'Provide an IMcpModule to runExecution so executionType=mcp skills can be dispatched to a real MCP tool/server, ' +
        'or configure the skill as executionType=cli/function/llm with an executor that implements that path.',
    );
  }
}
