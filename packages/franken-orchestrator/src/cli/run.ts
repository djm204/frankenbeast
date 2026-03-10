#!/usr/bin/env node

import { open } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { parseArgs, printUsage } from './args.js';
import type { CliArgs } from './args.js';
import { handleBeastCommand } from './beast-cli.js';
import { handleInitCommand } from './init-command.js';
import { loadConfig } from './config-loader.js';
import { cleanupBuild } from './cleanup.js';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import { resolveProjectRoot, getProjectPaths, generatePlanName, scaffoldFrankenbeast } from './project-root.js';
import { resolveBaseBranch } from './base-branch.js';
import { Session } from './session.js';
import type { SessionPhase } from './session.js';
import type { InterviewIO } from '../planning/interview-loop.js';
import { renderBanner, BeastLogger } from '../logging/beast-logger.js';
import { ChatRepl } from './chat-repl.js';
import { createChatRuntime } from '../chat/chat-runtime-factory.js';
import { FileSessionStore } from '../chat/session-store.js';
import { createCliDeps } from './dep-factory.js';
import { createDefaultRegistry } from '../skills/providers/cli-provider.js';
import { AdapterLlmClient } from '../adapters/adapter-llm-client.js';
import { CliLlmAdapter } from '../adapters/cli-llm-adapter.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startChatServer } from '../http/chat-server.js';
import { filterNetworkServices, resolveNetworkServices, type ResolvedNetworkService } from '../network/network-registry.js';
import { NetworkStateStore } from '../network/network-state-store.js';
import { NetworkLogStore } from '../network/network-logs.js';
import { NetworkSupervisor } from '../network/network-supervisor.js';
import { renderNetworkHelp } from '../network/network-help.js';
import { resolveManagedChatAttachment, runManagedChatRepl } from '../network/chat-attach.js';
import {
  healthcheckNetworkService,
  preflightNetworkService,
  startNetworkService,
  stopNetworkService,
} from '../network/network-supervisor-runtime.js';

/**
 * Creates an InterviewIO backed by stdin/stdout.
 */
export function createStdinIO(): InterviewIO {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: (question: string) =>
      new Promise<string>((resolve) => rl.question(`${question}\n> `, resolve)),
    display: (message: string) => console.log(message),
  };
}

/**
 * Determines entry phase and exit behavior from CLI args.
 * Subcommand takes precedence, then flags, then default.
 */
export function resolvePhases(args: Pick<CliArgs, 'subcommand' | 'designDoc' | 'planDir'>): {
  entryPhase: SessionPhase;
  exitAfter?: SessionPhase;
} {
  // Subcommand mode
  if (args.subcommand === 'interview') {
    return { entryPhase: 'interview', exitAfter: 'interview' };
  }
  if (args.subcommand === 'plan') {
    return { entryPhase: 'plan', exitAfter: 'plan' };
  }
  if (args.subcommand === 'run') {
    return { entryPhase: 'execute' };
  }
  if (args.subcommand === 'issues') {
    return { entryPhase: 'execute' };
  }

  // Default mode — detect entry from provided files
  if (args.planDir) {
    return { entryPhase: 'execute' };
  }
  if (args.designDoc) {
    return { entryPhase: 'plan' };
  }

  // No files, no subcommand — full interactive flow
  return { entryPhase: 'interview' };
}

/**
 * Validates config path and loads config from all sources.
 * Exported for testability.
 */
export async function resolveConfig(args: CliArgs): Promise<OrchestratorConfig> {
  if (args.config && !existsSync(args.config)) {
    throw new Error(`Config file not found: ${args.config}`);
  }
  return loadConfig(args);
}

interface ChatSurfaceDeps {
  chatLlm: AdapterLlmClient;
  execLlm: AdapterLlmClient;
  finalize: () => Promise<void>;
  projectId: string;
  sessionStoreDir: string;
}

async function createChatSurfaceDeps(
  args: CliArgs,
  config: OrchestratorConfig,
  paths: ReturnType<typeof getProjectPaths>,
): Promise<ChatSurfaceDeps> {
  const sessionStoreDir = join(paths.frankenbeastDir, 'chat');
  const projectId = paths.root.split('/').pop() ?? 'unknown';
  const registry = createDefaultRegistry();
  const resolvedProvider = registry.get(args.provider);
  const chatDepOpts = {
    paths,
    baseBranch: 'main',
    budget: args.budget,
    provider: args.provider,
    providers: args.providers ?? config.providers.fallbackChain,
    providersConfig: config.providers.overrides,
    noPr: true,
    verbose: args.verbose,
    reset: false,
    adapterWorkingDir: tmpdir(),
    adapterModel: config.chat?.model ?? resolvedProvider.chatModel,
    chatMode: true,
  };
  const { cliLlmAdapter, finalize } = await createCliDeps(chatDepOpts);
  const chatLlm = new AdapterLlmClient(cliLlmAdapter);

  const override = config.providers.overrides?.[args.provider];
  const execAdapter = new CliLlmAdapter(resolvedProvider, {
    workingDir: paths.root,
    ...(override?.command ? { commandOverride: override.command } : {}),
  });
  const execLlm = new AdapterLlmClient(execAdapter);

  return {
    chatLlm,
    execLlm,
    finalize,
    projectId,
    sessionStoreDir,
  };
}

export async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (args.cleanup) {
    const root = resolveProjectRoot(args.baseDir);
    const paths = getProjectPaths(root);
    const removed = cleanupBuild(paths.buildDir);
    console.log(removed > 0
      ? `Cleaned up ${removed} file${removed === 1 ? '' : 's'} from ${paths.buildDir}`
      : 'Nothing to clean up.');
    process.exit(0);
  }

  const root = resolveProjectRoot(args.baseDir);
  if (process.env.FRANKENBEAST_NETWORK_MANAGED !== '1') {
    console.log(await renderBanner(root));
  }

  const config = await resolveConfig(args);

  const logger = new BeastLogger({ verbose: args.verbose });
  if (args.config) {
    logger.info(`Loaded config from ${args.config}`, 'config');
  } else {
    logger.info('Using default config (env + defaults)', 'config');
  }

  if (args.verbose) {
    console.log('Config:', JSON.stringify(config, null, 2));
  }

  // Resolve project root — scope plans by name unless --plan-dir overrides
  const planName = args.planDir ? undefined : (args.planName ?? generatePlanName(args.designDoc));
  const paths = getProjectPaths(root, planName);
  scaffoldFrankenbeast(paths);

  if (args.subcommand === 'network') {
    await runNetworkCommand(args, config, root, paths);
    return;
  }

  if (args.subcommand === 'beasts') {
    await handleBeastCommand({
      args,
      io: createStdinIO(),
      paths,
      print: console.log,
    });
    return;
  }

  if (args.subcommand === 'init') {
    await handleInitCommand({
      args,
      config,
      io: createStdinIO(),
      paths,
      print: console.log,
    });
    return;
  }

  if (args.subcommand === 'chat' || args.subcommand === 'chat-server') {
    if (args.subcommand === 'chat') {
      const managedAttachment = await resolveManagedChatAttachment({
        config,
        frankenbeastDir: paths.frankenbeastDir,
      });
      if (managedAttachment) {
        await runManagedChatRepl({
          attachment: managedAttachment,
          projectId: paths.root.split('/').pop() ?? 'unknown',
          verbose: args.verbose,
        });
        return;
      }
    }

    const { chatLlm, execLlm, finalize, projectId, sessionStoreDir } = await createChatSurfaceDeps(args, config, paths);

    if (args.subcommand === 'chat-server') {
      let mutableConfig = config;
      const server = await startChatServer({
        sessionStoreDir,
        llm: chatLlm,
        executionLlm: execLlm,
        projectName: projectId,
        networkControl: {
          root,
          frankenbeastDir: paths.frankenbeastDir,
          configFile: paths.configFile,
          getConfig: () => mutableConfig,
          setConfig: (nextConfig) => {
            mutableConfig = nextConfig;
          },
        },
        ...(args.host ? { host: args.host } : {}),
        ...(args.port !== undefined ? { port: args.port } : {}),
        ...(args.allowOrigin ? { allowedOrigins: [args.allowOrigin] } : {}),
      });
      console.log(`Chat server listening on ${server.url}`);
      return;
    }

    const sessionStore = new FileSessionStore(sessionStoreDir);
    const runtime = createChatRuntime({
      chatLlm,
      executionLlm: execLlm,
      projectName: projectId,
      sessionContinuation: true,
    });
    const repl = new ChatRepl({
      engine: runtime.engine,
      turnRunner: runtime.turnRunner,
      projectId,
      sessionStore,
      verbose: args.verbose,
    });
    await repl.start();
    await finalize();
    return;
  }

  // Create IO for non-chat interactive prompts (chat owns its own readline)
  const io = createStdinIO();

  // Resolve base branch
  const baseBranch = await resolveBaseBranch(root, args.baseBranch, io);

  // Determine phases
  const { entryPhase, exitAfter } = resolvePhases(args);

  // Create and run session
  // Precedence: CLI args > config file > defaults
  const session = new Session({
    paths,
    baseBranch,
    budget: args.budget,
    provider: args.provider,
    providers: args.providers ?? config.providers.fallbackChain,
    providersConfig: config.providers.overrides,
    noPr: args.noPr,
    verbose: args.verbose,
    reset: args.reset,
    io,
    entryPhase,
    ...(exitAfter !== undefined ? { exitAfter } : {}),
    ...(args.designDoc !== undefined ? { designDocPath: args.designDoc } : {}),
    ...(args.planDir !== undefined ? { planDirOverride: args.planDir } : {}),
    // Issue-specific config
    issueLabel: args.issueLabel,
    issueMilestone: args.issueMilestone,
    issueSearch: args.issueSearch,
    issueAssignee: args.issueAssignee,
    issueLimit: args.issueLimit,
    issueRepo: args.issueRepo,
    dryRun: args.dryRun,
    maxCritiqueIterations: config.maxCritiqueIterations,
    maxDurationMs: config.maxDurationMs,
    enableTracing: config.enableTracing,
    enableHeartbeat: config.enableHeartbeat,
    minCritiqueScore: config.minCritiqueScore,
    maxTotalTokens: config.maxTotalTokens,
  });

  // Issues subcommand dispatches to a separate flow
  if (args.subcommand === 'issues') {
    await session.runIssues();
    return;
  }

  const result = await session.start();

  if (result && result.status !== 'completed') {
    process.exit(1);
  }
}

type NetworkPaths = Pick<ReturnType<typeof getProjectPaths>, 'frankenbeastDir'>;

export interface NetworkCommandSupervisorLike {
  up(options: {
    services: ResolvedNetworkService[];
    detached: boolean;
    mode: 'secure' | 'insecure';
    secureBackend: string;
  }): Promise<{ services: { id: string; url?: string | undefined; status?: 'started' | 'already-running' | undefined }[] }>;
  down(): Promise<void>;
  status(): Promise<{ mode?: string; secureBackend?: string; services: Array<{ id: string; status: string }> }>;
  stop(target: string | 'all'): Promise<void>;
  logs(target: string | 'all'): Promise<string[]>;
}

export interface NetworkCommandDeps {
  resolveServices: typeof resolveNetworkServices;
  createSupervisor: (paths: NetworkPaths) => NetworkCommandSupervisorLike;
  print: (message: string) => void;
  printError: (message: string) => void;
  renderHelp: () => string;
  waitForShutdown: () => Promise<void>;
}

function createDefaultNetworkDeps(root: string): NetworkCommandDeps {
  return {
    resolveServices: resolveNetworkServices,
    createSupervisor: (paths) => {
      const stateStore = new NetworkStateStore(join(paths.frankenbeastDir, 'network', 'state.json'));
      const logStore = new NetworkLogStore(join(paths.frankenbeastDir, 'network', 'logs'));
      return new NetworkSupervisor({
        stateStore,
        logStore,
        startService: startNetworkService,
        stopService: stopNetworkService,
        healthcheck: healthcheckNetworkService,
        preflightService: preflightNetworkService,
      });
    },
    print: (message: string) => console.log(message),
    printError: (message: string) => console.error(message),
    renderHelp: renderNetworkHelp,
    waitForShutdown: () => waitForTerminationSignal(root),
  };
}

async function waitForTerminationSignal(root: string): Promise<void> {
  void root;
  await new Promise<void>((resolve) => {
    const cleanup = (): void => {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      resolve();
    };
    const onSignal = (): void => cleanup();
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
  });
}

function formatStatus(status: { mode?: string; secureBackend?: string; services: Array<{ id: string; status: string }> }): string[] {
  const lines = [
    `Mode: ${status.mode ?? 'unknown'}`,
  ];

  if (status.secureBackend) {
    lines.push(`Secure backend: ${status.secureBackend}`);
  }

  for (const service of status.services) {
    lines.push(`${service.id}: ${service.status}`);
  }

  return lines;
}

export async function runNetworkCommand(
  args: CliArgs,
  config: OrchestratorConfig,
  root: string,
  paths: NetworkPaths,
  deps: NetworkCommandDeps = createDefaultNetworkDeps(root),
): Promise<void> {
  const action = args.networkAction ?? 'help';
  const supervisor = deps.createSupervisor(paths);

  if (action === 'help') {
    deps.print(deps.renderHelp());
    return;
  }

  if (action === 'config') {
    deps.print(JSON.stringify({
      network: config.network,
      chat: config.chat,
      dashboard: config.dashboard,
      comms: config.comms,
    }, null, 2));
    return;
  }

  if (action === 'down') {
    await supervisor.down();
    deps.print('Stopped managed services.');
    return;
  }

  if (action === 'status') {
    const status = await supervisor.status();
    for (const line of formatStatus(status)) {
      deps.print(line);
    }
    return;
  }

  if (action === 'logs') {
    const target = args.networkTarget ?? 'all';
    const logs = await supervisor.logs(target);
    for (const logFile of logs) {
      deps.print(logFile);
    }
    return;
  }

  if (action === 'stop') {
    const target = args.networkTarget ?? 'all';
    await supervisor.stop(target);
    deps.print(`Stopped ${target}.`);
    return;
  }

  const services = filterNetworkServices(
    deps.resolveServices(config, { repoRoot: root }),
    action === 'up' ? undefined : args.networkTarget,
  );

  if (action === 'restart') {
    await supervisor.stop(args.networkTarget ?? 'all');
  }

  if (action === 'up' || action === 'start' || action === 'restart') {
    const state = await supervisor.up({
      services,
      detached: args.networkDetached,
      mode: config.network.mode,
      secureBackend: config.network.secureBackend,
    });
    const startedServices = state.services.filter((service) => service.status !== 'already-running');
    const reusedServices = state.services.filter((service) => service.status === 'already-running');
    if (startedServices.length > 0) {
      deps.print(`Started ${startedServices.length} service${startedServices.length === 1 ? '' : 's'}.`);
    }
    if (reusedServices.length > 0) {
      deps.print(`Already running ${reusedServices.length} service${reusedServices.length === 1 ? '' : 's'}.`);
    }
    for (const service of state.services) {
      if (service.url) {
        deps.print(`${service.id}: ${service.url}`);
      }
    }
    if (!args.networkDetached) {
      await deps.waitForShutdown();
      await supervisor.stop(args.networkTarget ?? 'all');
    }
    return;
  }

  deps.printError(`Unsupported network action: ${action}`);
}

import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

const self = fileURLToPath(import.meta.url);
const caller = process.argv[1];
if (caller && realpathSync(caller) === realpathSync(self)) {
  main().catch((error) => {
    console.error('Fatal:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
