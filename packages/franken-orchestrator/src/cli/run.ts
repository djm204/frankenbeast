#!/usr/bin/env node

function printLine(...args: unknown[]): void {
  console.info(...args);
}


import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { accessSync, constants, existsSync, lstatSync, readdirSync, statSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs, printUsage } from './args.js';
import type { CliArgs } from './args.js';
import { handleBeastCommand } from './beast-cli.js';
import { handleInitCommand } from './init-command.js';
import { handleSkillCommand } from './skill-cli.js';
import { handleSecurityCommand } from './security-cli.js';
import { loadConfig } from './config-loader.js';
import { cleanupBuild } from './cleanup.js';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import { resolveProjectRoot, getProjectPaths, generatePlanName, scaffoldFrankenbeast, readActivePlanName, writeActivePlanName } from './project-root.js';
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
import { basename, delimiter, dirname, join, resolve as resolvePath } from 'node:path';
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
import { defaultConfig, parseOrchestratorConfig } from '../config/orchestrator-config.js';
import { resolveManagedChatAttachment, runManagedChatRepl } from '../network/chat-attach.js';
import {
  healthcheckNetworkService,
  preflightNetworkService,
  startNetworkService,
  stopNetworkService,
} from '../network/network-supervisor-runtime.js';
import type { ISecretStore } from '../network/secret-store.js';
import { resolveSecurityConfig, type SecurityConfig } from '../middleware/security-profiles.js';
import { startBeastDaemon } from '../http/beast-daemon-server.js';
import { createBeastServices } from '../beasts/create-beast-services.js';
import { TransportSecurityService } from '../http/security/transport-security.js';
import { CommsConfigSchema, type CommsConfig } from '../comms/config/comms-config.js';
import { assertLocalPlaintextOrSecureHttpUrl, localPlaintextOrSecureEndpoint } from '../network/network-url.js';
import { loadRunConfigFromEnv, type RunConfig } from './run-config-loader.js';

/**
 * Creates an InterviewIO backed by stdin/stdout.
 */
export function createStdinIO(): InterviewIO & { close(): void } {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: (question: string) =>
      new Promise<string>((resolve) => rl.question(`${question}\n> `, resolve)),
    display: (message: string) => printLine(message),
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
export function resolvePhases(args: Partial<Pick<CliArgs, 'subcommand' | 'designDoc' | 'planDir' | 'resume'>>): {
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
  if (args.resume) {
    return { entryPhase: 'execute' };
  }
  if (args.planDir) {
    return { entryPhase: 'execute' };
  }
  if (args.designDoc) {
    return { entryPhase: 'plan' };
  }

  // No files, no subcommand — full interactive flow
  return { entryPhase: 'interview' };
}

export function defaultRunPlanNeedsGuidance(planDir: string): boolean {
  try {
    const stats = statSync(planDir);
    if (!stats.isDirectory()) return false;
    return !readdirSync(planDir).some((entry) => (
      entry.endsWith('.md') &&
      !entry.startsWith('00_') &&
      /^\d{2}/.test(entry)
    ));
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return true;
    }
    throw err;
  }
}

export function formatMissingRunPlanGuidance(
  planDir: string,
): string {
  const planName = basename(planDir);
  return 'No runnable default run plan chunks found under ' + planDir + '. '
    + `Create it with \`frankenbeast plan --design-doc <file> --plan-name ${planName}\`, `
    + 'or run `frankenbeast interview` first and then plan the generated design before running.';
}

export function shouldShowMissingRunPlanGuidance(
  args: Partial<Pick<CliArgs, 'subcommand' | 'resume' | 'planDir' | 'planName'>>,
  planNeedsGuidance: boolean,
): boolean {
  return args.subcommand === 'run'
    && !args.resume
    && !args.planDir
    && !args.planName
    && planNeedsGuidance;
}

export interface ResumeTarget {
  planName: string;
  checkpointFile: string;
  planDir?: string;
  ambiguousPlanDir?: boolean;
}

function findUniquePlanDirByBasename(root: string, planName: string): string | undefined | null {
  const skip = new Set(['.git', '.fbeast', 'node_modules']);
  const matches: string[] = [];

  function visit(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (skip.has(entry)) continue;
      const path = join(dir, entry);
      let stats;
      try {
        stats = lstatSync(path);
      } catch {
        continue;
      }
      if (!stats.isDirectory()) continue;
      if (entry === planName) {
        matches.push(path);
        continue;
      }
      visit(path);
    }
  }

  visit(root);
  if (matches.length === 0) return undefined;
  return matches.length === 1 ? matches[0] : null;
}

export function discoverResumeTarget(root: string): ResumeTarget | undefined {
  const buildDir = join(root, '.fbeast', '.build');
  let newest: { checkpointFile: string; mtimeMs: number } | undefined;

  try {
    for (const entry of readdirSync(buildDir)) {
      if (entry === '.checkpoint') continue;
      if (!entry.endsWith('.checkpoint')) continue;
      const checkpointFile = join(buildDir, entry);
      const stats = statSync(checkpointFile);
      if (!stats.isFile()) continue;
      if (!newest || stats.mtimeMs > newest.mtimeMs) {
        newest = { checkpointFile, mtimeMs: stats.mtimeMs };
      }
    }
  } catch {
    return undefined;
  }

  if (!newest) return undefined;

  const fileName = basename(newest.checkpointFile);
  const planName = fileName.replace(/\.checkpoint$/i, '');
  if (!planName) return undefined;

  const scopedPlanDir = join(root, '.fbeast', 'plans', planName);
  const fbeastPlanDir = join(root, '.fbeast', planName);
  const customPlanDir = join(root, planName);
  const nestedPlanDir = !existsSync(scopedPlanDir) && !existsSync(customPlanDir) && !existsSync(fbeastPlanDir)
    ? findUniquePlanDirByBasename(root, planName)
    : undefined;
  const planDir = !existsSync(scopedPlanDir) && existsSync(customPlanDir)
    ? customPlanDir
    : !existsSync(scopedPlanDir) && existsSync(fbeastPlanDir)
      ? fbeastPlanDir
    : nestedPlanDir ?? undefined;

  if (nestedPlanDir === null) {
    return { planName, checkpointFile: newest.checkpointFile, ambiguousPlanDir: true };
  }

  return { planName, checkpointFile: newest.checkpointFile, ...(planDir ? { planDir } : {}) };
}

function ensureResumeTargetIsUsable(resumeTarget: ResumeTarget | undefined): void {
  if (resumeTarget?.ambiguousPlanDir) {
    throw new Error(
      `Multiple custom plan directories named "${resumeTarget.planName}" match ${resumeTarget.checkpointFile}; pass --plan-dir explicitly to resume this checkpoint.`,
    );
  }
}

function branchExists(root: string, branch: string): boolean {
  try {
    execFileSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
      cwd: root,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function isConventionalBaseBranch(branch: string): boolean {
  return /^(main|master|trunk|develop|dev|release(?:\/.*)?)$/.test(branch);
}

export function inferResumeBaseBranch(root: string): string | undefined {
  try {
    const currentBranch = execFileSync('git', ['branch', '--show-current'], {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const reflog = execFileSync('git', ['reflog', '--format=%gs'], {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const candidateBaseBranches: string[] = [];
    for (const line of reflog.split('\n')) {
      const match = /^checkout: moving from (\S+) to (\S+)$/.exec(line.trim());
      if (!match) continue;
      const [, fromBranch, toBranch] = match;
      if (toBranch === currentBranch && isConventionalBaseBranch(toBranch) && branchExists(root, toBranch)) {
        return toBranch;
      }
      if (toBranch === currentBranch && fromBranch && fromBranch !== 'HEAD' && isConventionalBaseBranch(fromBranch) && branchExists(root, fromBranch)) {
        candidateBaseBranches.push(fromBranch);
      }
    }
    const originalBaseBranch = candidateBaseBranches.at(-1);
    if (originalBaseBranch) return originalBaseBranch;
  } catch {
    // Fall through to the normal base-branch resolver when reflog is unavailable.
  }

  return undefined;
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

function canInitHandleConfigLoadError(args: CliArgs): boolean {
  return args.subcommand === 'init';
}

async function isInitConfigFileError(configFile: string, error: unknown): Promise<boolean> {
  if (error instanceof SyntaxError) {
    return true;
  }
  if (error instanceof TypeError && /config file must contain a json object/i.test(error.message)) {
    return true;
  }
  if (error instanceof Error && error.message.startsWith('Config file not found:')) {
    return true;
  }
  try {
    const raw = await readFile(configFile, 'utf-8');
    const value = JSON.parse(raw) as unknown;
    return value === null || typeof value !== 'object' || Array.isArray(value);
  } catch (fileError) {
    return fileError instanceof SyntaxError;
  }
}

function initFallbackConfig(args: CliArgs): OrchestratorConfig {
  const config = defaultConfig();
  if (args.initBackend) {
    config.network.secureBackend = args.initBackend as OrchestratorConfig['network']['secureBackend'];
  }
  return config;
}

export function resolveDashboardAllowedOrigins(config: OrchestratorConfig): string[] {
  if (!config.dashboard?.enabled) {
    return [];
  }

  const { host, port } = config.dashboard;
  const origins = [localPlaintextOrSecureEndpoint(host, port)];
  if (host === '127.0.0.1' || host === '::1' || host === '[::1]' || host === '0.0.0.0') {
    origins.push(localPlaintextOrSecureEndpoint('localhost', port));
  }
  if (host === '0.0.0.0') {
    origins.push(localPlaintextOrSecureEndpoint('127.0.0.1', port));
  }
  return origins;
}

function resolveConfigSecurity(config: OrchestratorConfig): SecurityConfig {
  const security = config.security;
  const overrides: Partial<Omit<SecurityConfig, 'profile'>> = {};
  if (security?.injectionDetection !== undefined) overrides.injectionDetection = security.injectionDetection;
  if (security?.piiMasking !== undefined) overrides.piiMasking = security.piiMasking;
  if (security?.outputValidation !== undefined) overrides.outputValidation = security.outputValidation;
  if (security?.webhookSignaturePolicy !== undefined) {
    overrides.webhookSignaturePolicy = security.webhookSignaturePolicy;
  }
  if (security?.allowedDomains !== undefined) overrides.allowedDomains = security.allowedDomains;
  if (security?.maxTokenBudget !== undefined) overrides.maxTokenBudget = security.maxTokenBudget;
  if (security?.requireApproval !== undefined) overrides.requireApproval = security.requireApproval;
  if (security?.customRules !== undefined) overrides.customRules = security.customRules;
  return resolveSecurityConfig(security?.profile ?? 'standard', overrides);
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

function resolveEffectivePreflightProvider(selectedProvider: string, runConfig: RunConfig | undefined): string {
  return runConfig?.llmConfig?.default?.provider
    ?? runConfig?.provider
    ?? selectedProvider;
}

export interface ProviderCliAvailability {
  readonly provider: string;
  readonly command: string;
  readonly available: boolean;
}

export function checkProviderCliAvailability(
  selectedProvider: string,
  fallbackChain: readonly string[],
  overrides: OrchestratorConfig['providers']['overrides'] = {},
): ProviderCliAvailability[] {
  const registry = createDefaultRegistry();
  const providerNames = [...new Set([selectedProvider, ...fallbackChain].filter(Boolean))];
  return providerNames.map((provider) => {
    const command = overrides?.[provider]?.command ?? registry.get(provider).command;
    return {
      provider,
      command,
      available: isCommandAvailable(command),
    };
  });
}

export function assertAnyProviderCliAvailable(
  selectedProvider: string,
  fallbackChain: readonly string[],
  overrides: OrchestratorConfig['providers']['overrides'] = {},
): void {
  const report = checkProviderCliAvailability(selectedProvider, fallbackChain, overrides);
  if (report.some((entry) => entry.available)) {
    return;
  }

  const attempted = report
    .map((entry) => `${entry.provider} (${entry.command})`)
    .join(', ');
  throw new Error(
    'No configured LLM provider CLI is available. '
      + `Checked: ${attempted || 'none'}. `
      + 'Install one of: claude, codex, gemini, aider; or configure providers.overrides.<provider>.command.',
  );
}

function isCommandAvailable(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed.includes('/') || trimmed.includes('\\')) {
    return canExecuteCommand(trimmed);
  }

  const pathEntries = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : [''];
  const candidates = process.platform === 'win32' && extensions.some((ext) => trimmed.toLowerCase().endsWith(ext.toLowerCase()))
    ? [trimmed]
    : extensions.map((ext) => `${trimmed}${ext}`);

  return pathEntries.some((dir) => candidates.some((candidate) => canExecuteCommand(join(dir, candidate))));
}

function canExecuteCommand(candidate: string): boolean {
  try {
    if (process.platform === 'win32') {
      return existsSync(candidate);
    }
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
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

async function readEnvValueFromFile(filePath: string, key: string): Promise<string | undefined> {
  try {
    const contents = await readFile(filePath, 'utf8');
    const parsed = parseDotenv(contents);
    return parsed[key];
  } catch {
    return undefined;
  }
}

function defaultBeastsDaemonPidFile(root: string): string {
  return join(root, '.frankenbeast', 'beasts-daemon.pid');
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function readLiveBeastsDaemonPid(root: string): Promise<number | undefined> {
  try {
    const raw = await readFile(defaultBeastsDaemonPidFile(root), 'utf8');
    const pid = Number.parseInt(raw.trim(), 10);
    if (!Number.isFinite(pid) || pid <= 0 || !isPidAlive(pid)) {
      return undefined;
    }
    return pid;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function isHealthyBeastsDaemonEndpoint(baseUrl: string, expected: { root: string; pid: number }): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1000) });
    if (!response.ok) {
      return false;
    }
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object') {
      return false;
    }
    const record = body as Record<string, unknown>;
    return record.ok === true
      && record.service === 'beasts-daemon'
      && record.root === expected.root
      && record.pid === expected.pid;
  } catch {
    return false;
  }
}

async function waitForHealthyBeastsDaemonEndpoint(baseUrl: string, expected: { root: string; pid: number }): Promise<boolean> {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    if (await isHealthyBeastsDaemonEndpoint(baseUrl, expected)) {
      return true;
    }
    if (attempt < 8) {
      await sleep(250);
    }
  }
  return false;
}

async function resolveDetectedBeastsDaemonUrl(
  root: string,
  config: OrchestratorConfig,
  logger: BeastLogger,
): Promise<string | undefined> {
  const pid = await readLiveBeastsDaemonPid(root);
  if (pid === undefined) {
    return undefined;
  }
  const candidateUrl = localPlaintextOrSecureEndpoint(config.beastsDaemon.host, config.beastsDaemon.port);
  if (await waitForHealthyBeastsDaemonEndpoint(candidateUrl, { root, pid })) {
    logger.info(
      `Detected a live beasts-daemon pid file at ${defaultBeastsDaemonPidFile(root)}; `
      + `chat-server will proxy Beast control routes to ${candidateUrl}.`,
      'beasts-daemon',
    );
    return candidateUrl;
  }
  logger.warn(
    `Ignoring live-looking beasts-daemon pid file at ${defaultBeastsDaemonPidFile(root)} because `
    + `${candidateUrl}/health did not identify a reachable beasts-daemon for this checkout and pid; `
    + 'chat-server will keep standalone in-process Beast services.',
    'beasts-daemon',
  );
  return undefined;
}

async function resolveCommsSecret(root: string, ref: string | undefined, secretStore: ISecretStore | undefined): Promise<string | undefined> {
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
  const envValue = process.env[ref]?.trim();
  if (envValue) {
    return envValue;
  }
  const rootEnvValue = await readEnvValueFromFile(join(root, '.env'), ref);
  if (rootEnvValue?.trim()) {
    return rootEnvValue.trim();
  }
  const webEnvValue = await readEnvValueFromFile(join(root, 'packages', 'franken-web', '.env.local'), ref);
  return webEnvValue?.trim() ? webEnvValue.trim() : undefined;
}

async function resolveCommsPublicRef(
  root: string,
  ref: string | undefined,
  secretStore: ISecretStore | undefined,
  isLiteral: (value: string) => boolean,
): Promise<string | undefined> {
  if (!ref?.trim()) {
    return undefined;
  }
  const trimmed = ref.trim();
  const resolved = await resolveCommsSecret(root, ref, secretStore);
  if (resolved) {
    return resolved;
  }
  return isLiteral(trimmed) ? trimmed : undefined;
}

const isDiscordPublicKeyLiteral = (value: string): boolean => /^[a-f0-9]{64}$/i.test(value);
const isWhatsappPhoneNumberIdLiteral = (value: string): boolean => /^\d{5,}$/.test(value);

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
  root: string,
): Promise<CommsConfig | undefined> {
  if (!config.comms.enabled
    && !config.comms.slack.enabled
    && !config.comms.discord.enabled
    && !config.comms.telegram.enabled
    && !config.comms.whatsapp.enabled) {
    return undefined;
  }

  const slackToken = await resolveCommsSecret(root, config.comms.slack.botTokenRef, secretStore);
  const slackSigningSecret = await resolveCommsSecret(root, config.comms.slack.signingSecretRef, secretStore);
  const discordToken = await resolveCommsSecret(root, config.comms.discord.botTokenRef, secretStore);
  const discordPublicKey = await resolveCommsPublicRef(
    root,
    config.comms.discord.publicKeyRef,
    secretStore,
    isDiscordPublicKeyLiteral,
  );
  const telegramBotToken = await resolveCommsSecret(root, config.comms.telegram.botTokenRef, secretStore);
  const telegramWebhookSecretToken = await resolveCommsSecret(
    root,
    config.comms.telegram.webhookSecretTokenRef,
    secretStore,
  );
  const whatsappAccessToken = await resolveCommsSecret(root, config.comms.whatsapp.accessTokenRef, secretStore);
  const whatsappPhoneNumberId = await resolveCommsPublicRef(
    root,
    config.comms.whatsapp.phoneNumberIdRef,
    secretStore,
    isWhatsappPhoneNumberIdLiteral,
  );
  const whatsappAppSecret = await resolveCommsSecret(root, config.comms.whatsapp.appSecretRef, secretStore);
  const whatsappVerifyToken = await resolveCommsSecret(root, config.comms.whatsapp.verifyTokenRef, secretStore);

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
    webhookSecretToken: telegramWebhookSecretToken,
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
      token: await resolveCommsSecret(root, config.comms.orchestratorTokenRef, secretStore),
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
        webhookSecretToken: telegramWebhookSecretToken,
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
    trustProviderCommandOverrides: args.trustProviderCommandOverrides,
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
    printLine(removed > 0
      ? `Cleaned up ${removed} file${removed === 1 ? '' : 's'} from ${paths.buildDir}`
      : 'Nothing to clean up.');
    process.exit(0);
  }

  if (args.subcommand === 'network' && (args.networkAction ?? 'help') === 'help') {
    printLine(renderNetworkHelp());
    return;
  }

  const root = resolveProjectRoot(args.baseDir);
  if (process.env.FRANKENBEAST_NETWORK_MANAGED !== '1') {
    printLine(await renderBanner(root));
  }

  const resumeTarget = args.resume && !args.planDir && !args.planName && (!args.subcommand || args.subcommand === 'run')
    ? discoverResumeTarget(root)
    : undefined;
  ensureResumeTargetIsUsable(resumeTarget);
  const planDirOverride = args.planDir ?? resumeTarget?.planDir;

  // Resolve project root — scope plans by name unless --plan-dir overrides
  const shouldReuseActivePlanName = !args.designDoc && (args.subcommand === 'plan' || args.subcommand === 'run');
  const implicitPlanName = args.designDoc
    ? generatePlanName(args.designDoc)
    : (shouldReuseActivePlanName ? (readActivePlanName(root) ?? generatePlanName()) : generatePlanName());
  const planName = planDirOverride
    ? undefined
    : (args.planName ?? (args.subcommand === 'issues'
      ? undefined
      : (resumeTarget?.planName ?? implicitPlanName)));
  const paths = getProjectPaths(root, planName);
  let config: OrchestratorConfig;
  try {
    config = await resolveConfig(args, paths.configFile);
  } catch (error) {
    if (!canInitHandleConfigLoadError(args) || !await isInitConfigFileError(args.config ?? paths.configFile, error)) {
      throw error;
    }
    config = initFallbackConfig(args);
  }
  const runPlanDir = planDirOverride ?? paths.plansDir;
  const runPlanNeedsGuidance = defaultRunPlanNeedsGuidance(runPlanDir);

  const logger = new BeastLogger({ verbose: args.verbose });
  if (args.config) {
    logger.info(`Loaded config from ${args.config}`, 'config');
  } else {
    logger.info('Using default config (env + defaults)', 'config');
  }

  if (args.verbose) {
    printLine('Config:', JSON.stringify(config, null, 2));
  }

  if (resumeTarget) {
    logger.info(`Resuming ${resumeTarget.planName} from ${resumeTarget.checkpointFile}`, 'session');
  }

  if (shouldShowMissingRunPlanGuidance(args, runPlanNeedsGuidance)) {
    printLine(formatMissingRunPlanGuidance(runPlanDir));
    return;
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
        print: printLine,
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
        print: printLine,
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
        command: args.skillCommand,
        commandArgs: args.skillCommandArgs,
        print: printLine,
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
        configPath: args.config ?? paths.configFile,
        ...(config.security?.profile ? { currentProfile: config.security.profile } : {}),
        ...(config.security ? { currentSecurity: config.security } : {}),
        print: printLine,
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
      const commsConfig = await buildChatServerCommsConfig(config, bootSecretStore, root);
      const explicitBeastDaemonUrl = process.env.FRANKENBEAST_BEAST_DAEMON_URL
        ? assertLocalPlaintextOrSecureHttpUrl(
            process.env.FRANKENBEAST_BEAST_DAEMON_URL,
            'FRANKENBEAST_BEAST_DAEMON_URL',
          )
        : undefined;
      const detectedBeastDaemonUrl = !explicitBeastDaemonUrl && beastOperatorToken
        ? await resolveDetectedBeastsDaemonUrl(root, config, logger)
        : undefined;
      const beastDaemonUrl = explicitBeastDaemonUrl ?? detectedBeastDaemonUrl;
      const localBeastServices = beastOperatorToken && !beastDaemonUrl
        ? createBeastServices({
            beastsDb: join(paths.frankenbeastDir, 'beast.db'),
            beastLogsDir: paths.beastLogsDir,
            root,
          })
        : undefined;
      const allowedOrigins = Array.from(new Set([
        ...(args.allowOrigin ? [args.allowOrigin] : []),
        ...resolveDashboardAllowedOrigins(config),
      ]));
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
        ...(beastOperatorToken && beastDaemonUrl
          ? {
              beastDaemon: {
                baseUrl: beastDaemonUrl,
                operatorToken: beastOperatorToken,
              },
            }
          : {}),
        networkControl: {
          root,
          frankenbeastDir: paths.frankenbeastDir,
          configFile: paths.configFile,
          allowTrustedProviderCommandOverrides: args.trustProviderCommandOverrides,
          getConfig: () => mutableConfig,
          setConfig: (nextConfig) => {
            mutableConfig = nextConfig;
          },
        },
        ...(commsConfig ? { commsConfig } : {}),
        ...(args.host ? { host: args.host } : {}),
        ...(args.port !== undefined ? { port: args.port } : {}),
        ...(allowedOrigins.length > 0 ? { allowedOrigins } : {}),
        // Consolidated deps — skill/dashboard routes activate when providers are configured
        ...(skillManager ? { skillManager } : {}),
        ...(providerRegistry ? { providerRegistry } : {}),
        ...(skillManager && providerRegistry
          ? {
              dashboardDeps: {
                skillManager,
                getSecurityConfig: () => resolveConfigSecurity(mutableConfig),
                getProviders: () => providerRegistry.getProviders().map((p, i) => ({
                  name: p.name, type: p.type, available: true, failoverOrder: i,
                })),
              },
            }
          : {}),
        analyticsDeps: { analytics },
      });
      printLine(`Chat server listening on ${server.url}`);
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

  // Resolve base branch. Resume usually starts from the interrupted run's
  // feature branch, so infer the original base from git reflog unless the
  // user supplied an explicit --base-branch override.
  const baseBranch = args.resume && !args.baseBranch
    ? (inferResumeBaseBranch(root) ?? await resolveBaseBranch(root, args.baseBranch, io))
    : await resolveBaseBranch(root, args.baseBranch, io);

  // Determine phases
  const { entryPhase, exitAfter } = resolvePhases(args);
  const provider = resolveSelectedProvider(args, config);
  const runConfig = loadRunConfigFromEnv();
  const preflightProvider = resolveEffectivePreflightProvider(provider, runConfig);
  assertAnyProviderCliAvailable(
    preflightProvider,
    args.providers ?? config.providers.fallbackChain,
    config.providers.overrides,
  );

  // Create and run session
  // Precedence: CLI args > config file > defaults
  const session = new Session({
    paths,
    baseBranch,
    budget: args.budget,
    provider,
    providers: args.providers ?? config.providers.fallbackChain,
    providersConfig: config.providers.overrides,
    trustProviderCommandOverrides: args.trustProviderCommandOverrides,
    noPr: args.noPr,
    verbose: args.verbose,
    reset: args.reset,
    resume: args.resume,
    io,
    entryPhase,
    ...(exitAfter !== undefined ? { exitAfter } : {}),
    ...(args.designDoc !== undefined ? { designDocPath: args.designDoc } : {}),
    ...(planDirOverride !== undefined
      ? { planDirOverride }
      : {}),
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

  const shouldPersistActivePlanName = planName && !planDirOverride && args.subcommand !== 'issues' && (
    args.planName !== undefined
    || args.designDoc !== undefined
    || args.subcommand === 'interview'
    || args.subcommand === 'plan'
    || args.subcommand === undefined
  );

  if (shouldPersistActivePlanName) {
    writeActivePlanName(paths, planName);
  }

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
  printLine(`Beast daemon listening on ${daemon.url}`);

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
  parseOrchestratorConfig(updatedFileConfig, {
    allowTrustedProviderCommandOverrides: args.trustProviderCommandOverrides,
  });

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
    print: (message: string) => printLine(message),
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

  const configFile = args.config ? resolvePath(args.config) : undefined;
  const services = filterNetworkServices(
    deps.resolveServices(config, {
      repoRoot: root,
      ...(configFile ? { configFile } : {}),
      ...(args.networkSet ? { configOverrides: args.networkSet } : {}),
      allowTrustedProviderCommandOverrides: args.trustProviderCommandOverrides,
    }),
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
      await supervisor.stopAll({
        ...state,
        services: state.services.filter((service) => service.status === 'started'),
      });
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
