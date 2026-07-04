#!/usr/bin/env node

import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { parseArgs, printUsage } from './args.js';
import type { CliArgs } from './args.js';
import { handleBeastCommand } from './beast-cli.js';
import { handleInitCommand } from './init-command.js';
import { handleSkillCommand } from './skill-cli.js';
import { handleSecurityCommand } from './security-cli.js';
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
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { startChatServer } from '../http/chat-server.js';
import { createSqliteAnalyticsService } from '../analytics/sqlite-analytics-service.js';
import { parse as parseDotenv } from 'dotenv';
import { createSecretStore } from '../network/secret-store.js';
import { filterNetworkServices, resolveNetworkServices, type ResolvedNetworkService } from '../network/network-registry.js';
import { NetworkStateStore } from '../network/network-state-store.js';
import { NetworkLogStore } from '../network/network-logs.js';
import { NetworkSupervisor } from '../network/network-supervisor.js';
import { renderNetworkHelp } from '../network/network-help.js';
import { applyNetworkConfigSets } from '../network/network-config-paths.js';
import { OrchestratorConfigSchema } from '../config/orchestrator-config.js';
import { resolveManagedChatAttachment, runManagedChatRepl } from '../network/chat-attach.js';
import {
  healthcheckNetworkService,
  preflightNetworkService,
  startNetworkService,
  stopNetworkService,
} from '../network/network-supervisor-runtime.js';
import type { ISecretStore } from '../network/secret-store.js';
import { resolveSecurityConfig } from '../middleware/security-profiles.js';
import { startBeastDaemon } from '../http/beast-daemon-server.js';
import { createBeastServices } from '../beasts/create-beast-services.js';
import { TransportSecurityService } from '../http/security/transport-security.js';
import { CommsConfigSchema, type CommsConfig } from '../comms/config/comms-config.js';

/**
 * Creates an InterviewIO backed by stdin/stdout.
 */
export function createStdinIO(): InterviewIO & { close(): void } {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: (question: string) =>
      new Promise<string>((resolve) => rl.question(`${question}\n> `, resolve)),
    display: (message: string) => console.log(message),
    close: () => {
      rl.close();
      process.stdin.pause();
    },
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
export async function resolveConfig(args: CliArgs, defaultConfigPath?: string): Promise<OrchestratorConfig> {
  if (args.config && !existsSync(args.config)) {
    throw new Error(`Config file not found: ${args.config}`);
  }
  return loadConfig(args, defaultConfigPath);
}

interface ChatSurfaceDeps {
  chatLlm: AdapterLlmClient;
  execLlm: AdapterLlmClient;
  finalize: () => Promise<void>;
  projectId: string;
  sessionStoreDir: string;
  skillManager?: import('../skills/skill-manager.js').SkillManager | undefined;
  providerRegistry?: import('../providers/provider-registry.js').ProviderRegistry | undefined;
}

function resolveSelectedProvider(args: CliArgs, config: OrchestratorConfig): string {
  return args.providerSpecified ? args.provider : config.providers.default;
}

export async function resolveBeastOperatorToken(
  root: string,
  options?: { secretStore?: ISecretStore | undefined; config?: OrchestratorConfig | undefined } | undefined,
): Promise<string | undefined> {
  // 1. Secret store: highest priority when a store and operatorTokenRef are configured
  const { secretStore, config } = options ?? {};
  if (secretStore && config) {
    const lookupKey = config.network.operatorTokenRef;
    if (lookupKey) {
      try {
        const storeToken = await secretStore.resolve(lookupKey);
        if (storeToken?.trim()) {
          return storeToken.trim();
        }
      } catch {
        // Secret store unavailable (e.g. missing CLI binary) — fall through to env vars
      }
    }
  }

  // 2. Environment variables
  const token = process.env.FRANKENBEAST_BEAST_OPERATOR_TOKEN ?? process.env.VITE_BEAST_OPERATOR_TOKEN;
  const trimmed = token?.trim();
  if (trimmed) {
    return trimmed;
  }

  // 3. Root .env file
  const rootEnvToken = await readOperatorTokenFromEnvFile(join(root, '.env'));
  if (rootEnvToken?.trim()) {
    return rootEnvToken.trim();
  }

  // 4. franken-web .env.local
  const fileToken = await readOperatorTokenFromEnvFile(join(root, 'packages', 'franken-web', '.env.local'));
  return fileToken?.trim() ? fileToken.trim() : undefined;
}

async function readOperatorTokenFromEnvFile(filePath: string): Promise<string | undefined> {
  try {
    const contents = await readFile(filePath, 'utf8');
    const parsed = parseDotenv(contents);
    return parsed.FRANKENBEAST_BEAST_OPERATOR_TOKEN ?? parsed.VITE_BEAST_OPERATOR_TOKEN;
  } catch {
    return undefined;
  }
}

async function resolveCommsSecret(ref: string | undefined, secretStore: ISecretStore | undefined): Promise<string | undefined> {
  if (!ref?.trim()) {
    return undefined;
  }
  if (secretStore) {
    try {
      const resolved = await secretStore.resolve(ref);
      if (resolved?.trim()) {
        return resolved.trim();
      }
    } catch {
      // Fall through to environment lookup for deploys that keep refs as env var names.
    }
  }
  return process.env[ref]?.trim() || undefined;
}

async function resolveCommsPublicRef(ref: string | undefined, secretStore: ISecretStore | undefined): Promise<string | undefined> {
  if (!ref?.trim()) {
    return undefined;
  }
  return (await resolveCommsSecret(ref, secretStore)) ?? ref.trim();
}

function requireCommsChannelFields(
  channel: string,
  enabled: boolean,
  fields: Record<string, string | undefined>,
): void {
  if (!enabled) {
    return;
  }
  const missing = Object.entries(fields)
    .filter(([, value]) => !value?.trim())
    .map(([field]) => field);
  if (missing.length > 0) {
    throw new Error(
      `Cannot start enabled ${channel} comms channel; missing resolved ${missing.join(', ')}`,
    );
  }
}

async function buildChatServerCommsConfig(
  config: OrchestratorConfig,
  secretStore: ISecretStore | undefined,
): Promise<CommsConfig | undefined> {
  if (!config.comms.enabled
    && !config.comms.slack.enabled
    && !config.comms.discord.enabled
    && !config.comms.telegram.enabled
    && !config.comms.whatsapp.enabled) {
    return undefined;
  }

  const slackToken = await resolveCommsSecret(config.comms.slack.botTokenRef, secretStore);
  const slackSigningSecret = await resolveCommsSecret(config.comms.slack.signingSecretRef, secretStore);
  const discordToken = await resolveCommsSecret(config.comms.discord.botTokenRef, secretStore);
  const discordPublicKey = await resolveCommsPublicRef(config.comms.discord.publicKeyRef, secretStore);
  const telegramBotToken = await resolveCommsSecret(config.comms.telegram.botTokenRef, secretStore);
  const whatsappAccessToken = await resolveCommsSecret(config.comms.whatsapp.accessTokenRef, secretStore);
  const whatsappPhoneNumberId = await resolveCommsPublicRef(config.comms.whatsapp.phoneNumberIdRef, secretStore);
  const whatsappAppSecret = await resolveCommsSecret(config.comms.whatsapp.appSecretRef, secretStore);
  const whatsappVerifyToken = await resolveCommsSecret(config.comms.whatsapp.verifyTokenRef, secretStore);

  requireCommsChannelFields('slack', config.comms.slack.enabled, {
    token: slackToken,
    signingSecret: slackSigningSecret,
  });
  requireCommsChannelFields('discord', config.comms.discord.enabled, {
    token: discordToken,
    publicKey: discordPublicKey,
  });
  requireCommsChannelFields('telegram', config.comms.telegram.enabled, {
    botToken: telegramBotToken,
  });
  requireCommsChannelFields('whatsapp', config.comms.whatsapp.enabled, {
    accessToken: whatsappAccessToken,
    phoneNumberId: whatsappPhoneNumberId,
    appSecret: whatsappAppSecret,
    verifyToken: whatsappVerifyToken,
  });

  return CommsConfigSchema.parse({
    orchestrator: {
      wsUrl: config.comms.orchestratorWsUrl,
      token: await resolveCommsSecret(config.comms.orchestratorTokenRef, secretStore),
    },
    channels: {
      slack: {
        enabled: config.comms.slack.enabled,
        token: slackToken,
        signingSecret: slackSigningSecret,
      },
      discord: {
        enabled: config.comms.discord.enabled,
        token: discordToken,
        publicKey: discordPublicKey,
      },
      telegram: {
        enabled: config.comms.telegram.enabled,
        botToken: telegramBotToken,
      },
      whatsapp: {
        enabled: config.comms.whatsapp.enabled,
        accessToken: whatsappAccessToken,
        phoneNumberId: whatsappPhoneNumberId,
        appSecret: whatsappAppSecret,
        verifyToken: whatsappVerifyToken,
      },
    },
  });
}

async function createChatSurfaceDeps(
  args: CliArgs,
  config: OrchestratorConfig,
  paths: ReturnType<typeof getProjectPaths>,
): Promise<ChatSurfaceDeps> {
  const provider = resolveSelectedProvider(args, config);
  const sessionStoreDir = join(paths.frankenbeastDir, 'chat');
  const projectId = paths.root.split('/').pop() ?? 'unknown';
  const registry = createDefaultRegistry();
  const resolvedProvider = registry.get(provider);
  const chatDepOpts = {
    paths,
    baseBranch: 'main',
    budget: args.budget,
    provider,
    providers: args.providers ?? config.providers.fallbackChain,
    providersConfig: config.providers.overrides,
    noPr: true,
    verbose: args.verbose,
    reset: false,
    adapterWorkingDir: tmpdir(),
    adapterModel: config.chat?.model ?? resolvedProvider.chatModel,
    chatMode: true,
    orchestratorConfig: config,
  };
  const { cliLlmAdapter, finalize, skillManager, providerRegistry } = await createCliDeps(chatDepOpts);
  const chatLlm = new AdapterLlmClient(cliLlmAdapter);

  const override = config.providers.overrides?.[provider];
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
    ...(skillManager ? { skillManager } : {}),
    ...(providerRegistry ? { providerRegistry } : {}),
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

  // Resolve project root — scope plans by name unless --plan-dir overrides
  const planName = args.planDir ? undefined : (args.planName ?? generatePlanName(args.designDoc));
  const paths = getProjectPaths(root, planName);
  const config = await resolveConfig(args, paths.configFile);

  const logger = new BeastLogger({ verbose: args.verbose });
  if (args.config) {
    logger.info(`Loaded config from ${args.config}`, 'config');
  } else {
    logger.info('Using default config (env + defaults)', 'config');
  }

  if (args.verbose) {
    console.log('Config:', JSON.stringify(config, null, 2));
  }

  scaffoldFrankenbeast(paths);

  if (args.subcommand === 'beasts-daemon') {
    await runBeastDaemonCommand(args, config, root, paths);
    return;
  }

  if (args.subcommand === 'network') {
    await runNetworkCommand(args, config, root, paths);
    return;
  }

  if (args.subcommand === 'beasts') {
    const io = createStdinIO();
    try {
      await handleBeastCommand({
        args,
        io,
        paths,
        print: console.log,
      });
    } finally {
      io.close();
    }
    return;
  }

  if (args.subcommand === 'init') {
    const io = createStdinIO();
    try {
      await handleInitCommand({
        args,
        config,
        io,
        paths,
        print: console.log,
      });
    } finally {
      io.close();
    }
    return;
  }

  if (args.subcommand === 'skill') {
    try {
      const { SkillManager } = await import('../skills/skill-manager.js');
      const skillsDir = join(paths.frankenbeastDir, 'skills');
      const skillManager = new SkillManager(skillsDir, new Set());
      await handleSkillCommand({
        skillManager,
        action: args.skillAction,
        target: args.skillTarget,
        print: console.log,
      });
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
    return;
  }

  if (args.subcommand === 'security') {
    try {
      await handleSecurityCommand({
        action: args.securityAction,
        target: args.securityTarget,
        print: console.log,
      });
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
    return;
  }

  if (args.subcommand === 'chat' || args.subcommand === 'chat-server') {
    if (args.subcommand === 'chat') {
      // Resolve the operator token so the attach client can authenticate
      // when the managed chat-server has it configured (which it must, when
      // exposed). Mirror chat-server's boot: try the configured secret
      // store first (so deployments that keep the token only in the secure
      // backend still work), then fall through to env / .env via
      // resolveBeastOperatorToken.
      let attachSecretStore: ISecretStore | undefined;
      try {
        const secureBackend = config.network.secureBackend ?? 'local-encrypted';
        attachSecretStore = createSecretStore(secureBackend, {
          projectRoot: root,
          passphrase: process.env.FRANKENBEAST_PASSPHRASE,
        });
      } catch {
        attachSecretStore = undefined;
      }
      const attachOperatorToken = await resolveBeastOperatorToken(root, {
        ...(attachSecretStore ? { secretStore: attachSecretStore } : {}),
        config,
      }).catch(() => undefined);
      const managedAttachment = await resolveManagedChatAttachment({
        config,
        frankenbeastDir: paths.frankenbeastDir,
        ...(attachOperatorToken ? { operatorToken: attachOperatorToken } : {}),
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

    const { chatLlm, execLlm, finalize, projectId, sessionStoreDir, skillManager, providerRegistry } = await createChatSurfaceDeps(args, config, paths);

    if (args.subcommand === 'chat-server') {
      let mutableConfig = config;
      // Attempt to create a secret store for operator token resolution.
      // Only succeeds when a passphrase is available (non-interactive boot path).
      let bootSecretStore: import('../network/secret-store.js').ISecretStore | undefined;
      try {
        const secureBackend = config.network.secureBackend ?? 'local-encrypted';
        bootSecretStore = createSecretStore(secureBackend, {
          projectRoot: root,
          passphrase: process.env.FRANKENBEAST_PASSPHRASE,
        });
      } catch {
        // No passphrase available — fall through to env var / .env file resolution
        bootSecretStore = undefined;
      }
      const beastOperatorToken = await resolveBeastOperatorToken(root, {
        secretStore: bootSecretStore,
        config,
      });
      const analytics = createSqliteAnalyticsService({
        dbPath: join(paths.frankenbeastDir, 'beast.db'),
      });
      const commsConfig = await buildChatServerCommsConfig(config, bootSecretStore);
      const explicitBeastDaemonUrl = process.env.FRANKENBEAST_BEAST_DAEMON_URL;
      const localBeastServices = beastOperatorToken && !explicitBeastDaemonUrl
        ? createBeastServices({
            beastsDb: join(paths.frankenbeastDir, 'beast.db'),
            beastLogsDir: paths.beastLogsDir,
            root,
          })
        : undefined;
      const server = await startChatServer({
        sessionStoreDir,
        llm: chatLlm,
        executionLlm: execLlm,
        projectName: projectId,
        ...(beastOperatorToken ? { operatorToken: beastOperatorToken } : {}),
        ...(localBeastServices && beastOperatorToken
          ? {
              beastControl: {
                ...localBeastServices,
                operatorToken: beastOperatorToken,
                security: new TransportSecurityService(),
                rateLimit: { windowMs: 60_000, max: 20 },
              },
              disposeBeastControl: localBeastServices.dispose,
            }
          : {}),
        ...(beastOperatorToken && explicitBeastDaemonUrl
          ? {
              beastDaemon: {
                baseUrl: explicitBeastDaemonUrl,
                operatorToken: beastOperatorToken,
              },
            }
          : {}),
        networkControl: {
          root,
          frankenbeastDir: paths.frankenbeastDir,
          configFile: paths.configFile,
          getConfig: () => mutableConfig,
          setConfig: (nextConfig) => {
            mutableConfig = nextConfig;
          },
        },
        ...(commsConfig ? { commsConfig } : {}),
        ...(args.host ? { host: args.host } : {}),
        ...(args.port !== undefined ? { port: args.port } : {}),
        ...(args.allowOrigin ? { allowedOrigins: [args.allowOrigin] } : {}),
        // Consolidated deps — skill/dashboard routes activate when providers are configured
        ...(skillManager ? { skillManager } : {}),
        ...(providerRegistry ? { providerRegistry } : {}),
        ...(skillManager && providerRegistry
          ? {
              dashboardDeps: {
                skillManager,
                getSecurityConfig: () => resolveSecurityConfig('standard'),
                getProviders: () => providerRegistry.getProviders().map((p, i) => ({
                  name: p.name, type: p.type, available: true, failoverOrder: i,
                })),
              },
            }
          : {}),
        analyticsDeps: { analytics },
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
  const provider = resolveSelectedProvider(args, config);

  // Create and run session
  // Precedence: CLI args > config file > defaults
  const session = new Session({
    paths,
    baseBranch,
    budget: args.budget,
    provider,
    providers: args.providers ?? config.providers.fallbackChain,
    providersConfig: config.providers.overrides,
    noPr: args.noPr,
    verbose: args.verbose,
    reset: args.reset,
    resume: args.resume,
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
    targetUpstream: args.targetUpstream,
    dryRun: args.dryRun,
    maxCritiqueIterations: config.maxCritiqueIterations,
    maxDurationMs: config.maxDurationMs,
    enableTracing: config.enableTracing,
    enableHeartbeat: config.enableHeartbeat,
    enableReflection: config.enableReflection,
    minCritiqueScore: config.minCritiqueScore,
    maxTotalTokens: config.maxTotalTokens,
    orchestratorConfig: config,
  });

  // Issues subcommand dispatches to a separate flow
  if (args.subcommand === 'issues') {
    await session.runIssues();
    return;
  }

  const result = await session.start();

  // `no-op` is a benign terminal status (empty or intentionally-skipped plan),
  // so it must exit successfully alongside `completed` — otherwise CI/scripts
  // invoking frankenbeast for no-change tasks would see a spurious nonzero exit.
  if (result && result.status !== 'completed' && result.status !== 'no-op') {
    process.exit(1);
  }
}

type NetworkPaths = Pick<ReturnType<typeof getProjectPaths>, 'frankenbeastDir' | 'configFile'>;

type BeastDaemonPaths = ReturnType<typeof getProjectPaths>;

async function runBeastDaemonCommand(
  args: CliArgs,
  config: OrchestratorConfig,
  root: string,
  paths: BeastDaemonPaths,
): Promise<void> {
  let bootSecretStore: ISecretStore | undefined;
  try {
    bootSecretStore = createSecretStore(config.network.secureBackend ?? 'local-encrypted', {
      projectRoot: root,
      passphrase: process.env.FRANKENBEAST_PASSPHRASE,
    });
  } catch {
    bootSecretStore = undefined;
  }
  const operatorToken = await resolveBeastOperatorToken(root, {
    ...(bootSecretStore ? { secretStore: bootSecretStore } : {}),
    config,
  });
  if (!operatorToken) {
    throw new Error(
      'Refusing to start beasts-daemon without an operator token: set '
      + 'FRANKENBEAST_BEAST_OPERATOR_TOKEN, VITE_BEAST_OPERATOR_TOKEN, '
      + 'network.operatorTokenRef, or a .env token.',
    );
  }

  const daemon = await startBeastDaemon({
    root,
    beastsDb: paths.beastsDb,
    beastLogsDir: paths.beastLogsDir,
    operatorToken,
    ...(args.host ? { host: args.host } : {}),
    ...(args.port !== undefined ? { port: args.port } : {}),
  });
  console.log(`Beast daemon listening on ${daemon.url}`);

  const shutdown = async (): Promise<void> => {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    await daemon.close();
  };
  const onSignal = (): void => {
    void shutdown().then(() => process.exit(0));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
}

export interface NetworkCommandSupervisorLike {
  up(options: {
    services: ResolvedNetworkService[];
    detached: boolean;
    mode: 'secure' | 'insecure';
    secureBackend: string;
  }): Promise<{ services: { id: string; url?: string | undefined; status?: 'started' | 'already-running' | undefined }[] }>;
  stopAll(state: Awaited<ReturnType<NetworkCommandSupervisorLike['up']>>): Promise<void>;
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

async function persistNetworkConfigSets(args: CliArgs, paths: NetworkPaths): Promise<string> {
  const configFile = args.config ?? paths.configFile;
  let fileConfig: Partial<OrchestratorConfig> = {};

  try {
    fileConfig = JSON.parse(await readFile(configFile, 'utf-8')) as Partial<OrchestratorConfig>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  const updatedFileConfig = applyNetworkConfigSets(fileConfig, args.networkSet ?? []);
  OrchestratorConfigSchema.parse(updatedFileConfig);

  await mkdir(dirname(configFile), { recursive: true });
  await writeFile(configFile, JSON.stringify(updatedFileConfig, null, 2) + '\n', 'utf-8');
  return configFile;
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
    if (args.networkSet && args.networkSet.length > 0) {
      const configFile = await persistNetworkConfigSets(args, paths);
      deps.print(`Saved network config to ${configFile}.`);
    }
    deps.print(JSON.stringify({
      network: config.network,
      beastsDaemon: config.beastsDaemon,
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
      await supervisor.stopAll(state);
    }
    return;
  }

  deps.printError(`Unsupported network action: ${action}`);
}

import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

const self = fileURLToPath(import.meta.url);
const caller = process.argv[1];

export function shouldForceDirectCliExit(argv: readonly string[] = process.argv): boolean {
  void argv;
  return false;
}

export function runDirectCli(
  entrypoint: () => Promise<void> = main,
  exit: (code?: number) => never = process.exit,
  shouldExitOnSuccess: () => boolean = shouldForceDirectCliExit,
): void {
  void entrypoint()
    .then(() => {
      if (shouldExitOnSuccess()) {
        // Successful direct CLI invocations exit naturally after command-specific
        // cleanup disposes blocking handles. Avoid process.exit(0), which can
        // truncate asynchronous stdout writes for short commands like beasts logs.
      }
    })
    .catch((error) => {
      console.error('Fatal:', error instanceof Error ? error.message : error);
      exit(1);
    });
}

if (caller && realpathSync(caller) === realpathSync(self)) {
  runDirectCli();
}
