import { join } from 'node:path';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import type { CliArgs } from './args.js';
import type { ProjectPaths } from './project-root.js';
import type { InterviewIO } from '../planning/interview-loop.js';
import { FileInitStateStore } from '../init/init-state-store.js';
import { runInteractiveInit } from '../init/init-engine.js';

export interface InitCommandOptions {
  args: CliArgs;
  config: OrchestratorConfig;
  io: InterviewIO;
  paths: ProjectPaths;
  print: (message: string) => void;
}

export async function handleInitCommand(options: InitCommandOptions): Promise<void> {
  if (options.args.initVerify) {
    options.print(`Init verify is not implemented yet for ${options.paths.configFile}.`);
    return;
  }

  if (options.args.initRepair) {
    options.print(`Init repair is not implemented yet for ${options.paths.configFile}.`);
    return;
  }

  const stateStore = new FileInitStateStore(join(options.paths.frankenbeastDir, 'init-state.json'));
  const result = await runInteractiveInit({
    configFile: options.paths.configFile,
    stateStore,
    io: options.io,
  });

  options.print(
    `Saved init config to ${options.paths.configFile} with modules: ${result.state.selectedModules.join(', ') || 'none'}.`,
  );
}
