import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import type { CliArgs } from './args.js';
import type { ProjectPaths } from './project-root.js';
import type { InterviewIO } from '../planning/interview-loop.js';

export interface InitCommandOptions {
  args: CliArgs;
  config: OrchestratorConfig;
  io: InterviewIO;
  paths: ProjectPaths;
  print: (message: string) => void;
}

export async function handleInitCommand(options: InitCommandOptions): Promise<void> {
  const mode = options.args.initVerify
    ? 'verify'
    : options.args.initRepair
      ? 'repair'
      : 'wizard';
  const interaction = options.args.initNonInteractive ? 'non-interactive' : 'interactive';
  options.print(`Init ${mode} (${interaction}) is not implemented yet for ${options.paths.configFile}.`);
}
