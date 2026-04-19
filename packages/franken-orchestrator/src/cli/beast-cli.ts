import type { CliArgs } from './args.js';
import type { InterviewIO } from '../planning/interview-loop.js';
import { createBeastServices } from '../beasts/create-beast-services.js';
import { collectBeastConfig } from './beast-prompts.js';
import type { ProjectPaths } from './project-root.js';
import { createBeastControlClient } from './beast-control-client.js';

interface BeastCommandDeps {
  args: CliArgs;
  io: InterviewIO;
  paths: ProjectPaths;
  print(message: string): void;
  control?: ReturnType<typeof createBeastControlClient>;
}

export async function handleBeastCommand(deps: BeastCommandDeps): Promise<void> {
  const { args, io, paths, print } = deps;
  const services = createBeastServices(paths);
  const control = deps.control ?? createBeastControlClient(paths);
  const actor = process.env.USER ?? 'operator';

  switch (args.beastAction) {
    case 'catalog': {
      const catalog = services.catalog.listDefinitions()
        .map((definition) => `${definition.id}: ${definition.description}`)
        .join('\n');
      print(catalog);
      return;
    }
    case 'create':
    case 'spawn': {
      if (!args.beastTarget) {
        throw new Error('beasts spawn requires a definition id');
      }
      const definition = services.catalog.getDefinition(args.beastTarget);
      if (!definition) {
        throw new Error(`Unknown Beast definition: ${args.beastTarget}`);
      }
      const config = await collectBeastConfig(io, definition);
      const run = await services.dispatch.createRun({
        definitionId: definition.id,
        config,
        dispatchedBy: 'cli',
        dispatchedByUser: actor,
        executionMode: 'process',
        startNow: true,
        ...(args.moduleConfig ? { moduleConfig: args.moduleConfig } : {}),
      });
      print(`Spawned ${run.definitionId} as ${run.id}`);
      return;
    }
    case 'list': {
      const runs = services.runs.listRuns();
      print(JSON.stringify(runs, null, 2));
      return;
    }
    case 'status': {
      if (!args.beastTarget) {
        throw new Error('beasts status requires a run id');
      }
      print(JSON.stringify(services.runs.getRun(args.beastTarget), null, 2));
      return;
    }
    case 'logs': {
      if (!args.beastTarget) {
        throw new Error('beasts logs requires a run id');
      }
      const logs = await services.runs.readLogs(args.beastTarget);
      print(logs.join('\n'));
      return;
    }
    case 'stop': {
      if (!args.beastTarget) {
        throw new Error('beasts stop requires a run id');
      }
      const run = await services.runs.stop(args.beastTarget, actor);
      print(`Stopped ${run.id}`);
      return;
    }
    case 'kill': {
      if (!args.beastTarget) {
        throw new Error('beasts kill requires a run id');
      }
      const run = await services.runs.kill(args.beastTarget, actor);
      print(`Killed ${run.id}`);
      return;
    }
    case 'restart': {
      if (!args.beastTarget) {
        throw new Error('beasts restart requires a run id');
      }
      const run = await services.runs.restart(args.beastTarget, actor);
      print(`Restarted ${run.id}`);
      return;
    }
    case 'resume': {
      if (!args.beastTarget) throw new Error('beasts resume requires an agent id');
      const run = await control.resumeAgent(args.beastTarget, actor);
      print(`Resumed ${run.id}`);
      return;
    }
    case 'delete': {
      if (!args.beastTarget) throw new Error('beasts delete requires an agent id');
      await control.deleteAgent(args.beastTarget);
      print(`Deleted ${args.beastTarget}`);
      return;
    }
    default:
      throw new Error('Unknown beasts command');
  }
}
