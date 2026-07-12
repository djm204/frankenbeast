import { join } from 'node:path';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import type { SecureBackend } from '../network/network-config.js';
import type { CliArgs } from './args.js';
import type { ProjectPaths } from './project-root.js';
import type { InterviewIO } from '../planning/interview-loop.js';
import { FileInitStateStore } from '../init/init-state-store.js';
import { runInteractiveInit, runRepairInit } from '../init/init-engine.js';
import { verifyInit } from '../init/init-verify.js';
import { createSecretStore } from '../network/secret-store.js';

export interface InitCommandOptions {
  args: CliArgs;
  config: OrchestratorConfig;
  io: InterviewIO;
  paths: ProjectPaths;
  print: (message: string) => void;
}

export async function handleInitCommand(options: InitCommandOptions): Promise<void> {
  const configFile = options.args.config ?? options.paths.configFile;
  const stateStore = new FileInitStateStore(join(options.paths.frankenbeastDir, 'init-state.json'));

  // Verify path: no secret store needed — pure file validation
  if (options.args.initVerify) {
    const verification = await verifyInit({
      configFile,
      stateStore,
      allowTrustedProviderCommandOverrides: options.args.trustProviderCommandOverrides,
    });
    options.print(
      verification.ok
        ? `Init verify passed for ${configFile}.`
        : verification.messages.join('\n'),
    );
    return;
  }

  if (options.args.initNonInteractive) {
    const verification = await verifyInit({
      configFile,
      stateStore,
      allowTrustedProviderCommandOverrides: options.args.trustProviderCommandOverrides,
    });
    if (!verification.ok) {
      throw new Error(
        [
          'Cannot run init non-interactively because required init configuration is missing or incomplete:',
          ...verification.messages.map((message) => `- ${message}`),
          'Run `frankenbeast init` interactively, or provide a complete config and init state before using `frankenbeast init --non-interactive`.',
        ].join('\n'),
      );
    }
    options.print(`Init config is already complete at ${configFile}.`);
    return;
  }

  if (options.args.initRepair) {
    const verification = await verifyInit({
      configFile,
      stateStore,
      allowTrustedProviderCommandOverrides: options.args.trustProviderCommandOverrides,
    });
    const invalidJsonIssues = verification.issues.filter((issue) =>
      issue.code === 'invalid-config-json');
    if (invalidJsonIssues.length > 0) {
      throw new Error(
        [
          'Cannot repair init because required init JSON is malformed:',
          ...invalidJsonIssues.map((issue) => `- ${issue.message}`),
        ].join('\n'),
      );
    }
  }

  // Interactive and repair paths need the secret store
  const secureBackend = options.config.network.secureBackend ?? 'local-encrypted';
  let passphrase: string | undefined = process.env.FRANKENBEAST_PASSPHRASE;
  if (secureBackend === 'local-encrypted' && !passphrase) {
    passphrase = (await options.io.ask('Enter passphrase for local encrypted store:')).trim() || undefined;
  }
  const secretStore = createSecretStore(secureBackend, {
    projectRoot: options.paths.root,
    io: options.io,
    passphrase,
  });
  const initBackend = options.args.initBackend as SecureBackend | undefined;

  if (options.args.initRepair) {
    const result = await runRepairInit({
      configFile,
      stateStore,
      io: options.io,
      initBackend,
      secretStore,
      allowTrustedProviderCommandOverrides: options.args.trustProviderCommandOverrides,
    });
    options.print(
      `Repaired init config at ${configFile} with modules: ${result.state.selectedModules.join(', ') || 'none'}.`,
    );
    return;
  }
  const result = await runInteractiveInit({
    configFile,
    stateStore,
    io: options.io,
    initBackend,
    secretStore,
    allowTrustedProviderCommandOverrides: options.args.trustProviderCommandOverrides,
  });

  options.print(
    `Saved init config to ${configFile} with modules: ${result.state.selectedModules.join(', ') || 'none'}.`,
  );
}
