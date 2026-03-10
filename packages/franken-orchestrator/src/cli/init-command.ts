import { join } from 'node:path';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import type { CliArgs } from './args.js';
import type { ProjectPaths } from './project-root.js';
import type { InterviewIO } from '../planning/interview-loop.js';
import { FileInitStateStore } from '../init/init-state-store.js';
import { runInteractiveInit, runRepairInit } from '../init/init-engine.js';
import { verifyInit } from '../init/init-verify.js';

export interface InitCommandOptions {
  args: CliArgs;
  config: OrchestratorConfig;
  io: InterviewIO;
  paths: ProjectPaths;
  print: (message: string) => void;
}

export async function handleInitCommand(options: InitCommandOptions): Promise<void> {
  const stateStore = new FileInitStateStore(join(options.paths.frankenbeastDir, 'init-state.json'));

  if (options.args.initVerify) {
    const verification = await verifyInit({
      configFile: options.paths.configFile,
      stateStore,
    });
    options.print(
      verification.ok
        ? `Init verify passed for ${options.paths.configFile}.`
        : verification.messages.join('\n'),
    );
    return;
  }

  if (options.args.initRepair) {
    const result = await runRepairInit({
      configFile: options.paths.configFile,
      stateStore,
      io: options.io,
    });
    options.print(
      `Repaired init config at ${options.paths.configFile} with modules: ${result.state.selectedModules.join(', ') || 'none'}.`,
    );
    return;
  }
  const result = await runInteractiveInit({
    configFile: options.paths.configFile,
    stateStore,
    io: options.io,
  });

  options.print(
    `Saved init config to ${options.paths.configFile} with modules: ${result.state.selectedModules.join(', ') || 'none'}.`,
  );
}
