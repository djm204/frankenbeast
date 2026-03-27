import type { SkillAction } from './args.js';
import type { SkillManager } from '../skills/skill-manager.js';

export interface SkillCommandDeps {
  skillManager: SkillManager;
  action?: SkillAction;
  target?: string | undefined;
  print(message: string): void;
}

export async function handleSkillCommand(deps: SkillCommandDeps): Promise<void> {
  const { skillManager, action, target, print } = deps;

  switch (action) {
    case 'list': {
      const skills = skillManager.listInstalled();
      if (skills.length === 0) {
        print('No skills installed.');
        return;
      }
      const enabled = new Set(skillManager.getEnabledSkills());
      for (const skill of skills) {
        const status = enabled.has(skill.name) ? '[on]' : '[off]';
        print(`  ${status} ${skill.name}`);
      }
      return;
    }
    case 'add': {
      if (!target) throw new Error('skill add requires a name');
      // Create the skill directory with a placeholder mcp.json.
      // The user must edit mcp.json to set the correct command and args.
      await skillManager.installCustom(target, { command: 'EDIT_ME', args: [] });
      print(`Created skill '${target}' in skills directory.`);
      print(`Edit skills/${target}/mcp.json to configure the MCP server command.`);
      return;
    }
    case 'remove': {
      if (!target) throw new Error('skill remove requires a name');
      skillManager.remove(target);
      print(`Removed skill '${target}'`);
      return;
    }
    case 'enable': {
      if (!target) throw new Error('skill enable requires a name');
      skillManager.enable(target);
      print(`Enabled skill '${target}'`);
      return;
    }
    case 'disable': {
      if (!target) throw new Error('skill disable requires a name');
      skillManager.disable(target);
      print(`Disabled skill '${target}'`);
      return;
    }
    case 'info': {
      if (!target) throw new Error('skill info requires a name');
      const mcpConfig = skillManager.readMcpConfig(target);
      const context = skillManager.readContext(target);
      const tools = skillManager.readTools(target);
      print(JSON.stringify({ name: target, mcpConfig, context: context ?? undefined, tools }, null, 2));
      return;
    }
    default:
      throw new Error('Usage: frankenbeast skill <list|add|remove|enable|disable|info> [name]');
  }
}
