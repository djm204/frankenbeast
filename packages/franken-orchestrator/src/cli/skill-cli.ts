import type { SkillAction } from './args.js';
import type { SkillManager } from '../skills/skill-manager.js';

export interface SkillCommandDeps {
  skillManager: SkillManager;
  action?: SkillAction;
  target?: string | undefined;
  command?: string | undefined;
  commandArgs?: string[] | undefined;
  print(message: string): void;
}

function scaffoldCommand(name: string): { command: string; args: string[] } {
  return {
    command: 'node',
    args: [
      '-e',
      `console.error(${JSON.stringify(`Skill '${name}' was scaffolded but is not configured. Edit skills/${name}/mcp.json with the MCP server command before enabling it.`)}); process.exit(1);`,
    ],
  };
}

export async function handleSkillCommand(deps: SkillCommandDeps): Promise<void> {
  const { skillManager, action, target, command, commandArgs = [], print } = deps;

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
      if (!command) {
        throw new Error('skill add requires a runnable MCP server command. Use `skill scaffold <name>` to create an incomplete template.');
      }
      await skillManager.installCustom(target, { command, args: commandArgs });
      print(`Installed skill '${target}' with MCP command '${command}'.`);
      if (commandArgs.length > 0) {
        print(`Arguments: ${commandArgs.join(' ')}`);
      }
      return;
    }
    case 'scaffold': {
      if (!target) throw new Error('skill scaffold requires a name');
      await skillManager.installCustom(target, scaffoldCommand(target));
      print(`Scaffolded incomplete skill '${target}' in skills directory.`);
      print(`Edit skills/${target}/mcp.json with the real MCP server command before enabling it.`);
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
      throw new Error('Usage: frankenbeast skill <list|add|scaffold|remove|enable|disable|info> [name]');
  }
}
