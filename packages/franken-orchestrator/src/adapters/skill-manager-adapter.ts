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
    return this.manager.getEnabledSkills().some((enabledSkill) => {
      const tools = this.manager.readTools(enabledSkill);
      return (
        (enabledSkill === skillId && isServerAliasExecutable(enabledSkill, tools)) ||
        tools.some(tool => tool.name === skillId || namespacedToolId(enabledSkill, tool.name) === skillId)
      );
    });
  }

  getAvailableSkills(): readonly SkillDescriptor[] {
    return this.manager.getEnabledSkills().flatMap((name) => {
      const tools = this.manager.readTools(name);
      const descriptors: SkillDescriptor[] = [];

      if (isServerAliasExecutable(name, tools)) {
        descriptors.push(createDescriptor(name, name, undefined, aliasToolFor(name, tools)?.requiresHitl ?? true));
      }

      for (const tool of tools) {
        if (tool.name !== name) {
          descriptors.push(createDescriptor(tool.name, tool.name, name, tool.requiresHitl ?? true));
        }
        descriptors.push(createDescriptor(namespacedToolId(name, tool.name), tool.name, name, tool.requiresHitl ?? true));
      }

      return descriptors;
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

function createDescriptor(id: string, name: string, parentSkillId: string | undefined, requiresHitl: boolean): SkillDescriptor {
  return {
    id,
    name,
    ...(parentSkillId ? { parentSkillId } : {}),
    requiresHitl,
    executionType: 'mcp',
  };
}

function namespacedToolId(skillName: string, toolName: string): string {
  return `${skillName}/${toolName}`;
}

function isServerAliasExecutable(
  skillName: string,
  tools: ReturnType<SkillManager['readTools']>,
): boolean {
  return tools.length === 0 || tools.length === 1 || tools.some(tool => tool.name === skillName);
}

function aliasToolFor(
  skillName: string,
  tools: ReturnType<SkillManager['readTools']>,
): ReturnType<SkillManager['readTools']>[number] | undefined {
  if (tools.length === 1) return tools[0];
  return tools.find(tool => tool.name === skillName);
}
