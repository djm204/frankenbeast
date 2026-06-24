import { existsSync, unlinkSync, readdirSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve, join } from 'node:path';
import { BeastLogger } from '../logging/beast-logger.js';
import { MartinLoop } from '../skills/martin-loop.js';
import { GitBranchIsolator } from '../skills/git-branch-isolator.js';
import { CliSkillExecutor } from '../skills/cli-skill-executor.js';
import { CliLlmAdapter } from '../adapters/cli-llm-adapter.js';
import { createDefaultRegistry } from '../skills/providers/cli-provider.js';
import { CliObserverBridge } from '../adapters/cli-observer-bridge.js';
import { FileCheckpointStore } from '../checkpoint/file-checkpoint-store.js';
import { FileChunkSessionStore } from '../session/chunk-session-store.js';
import { FileChunkSessionSnapshotStore } from '../session/chunk-session-snapshot-store.js';
import { ChunkSessionRenderer } from '../session/chunk-session-renderer.js';
import { ChunkSessionCompactor } from '../session/chunk-session-compactor.js';
import { ChunkSessionGc } from '../session/chunk-session-gc.js';
import { PrCreator } from '../closure/pr-creator.js';
import { AdapterLlmClient } from '../adapters/adapter-llm-client.js';
import { CachedCliLlmClient } from '../cache/cached-cli-llm-client.js';
import { CritiquePortAdapter } from '../adapters/critique-adapter.js';
import { bridgeToBeastConfig, bridgeToExistingDeps } from './dep-bridge.js';
import { createBeastDeps, type ConsolidatedDeps } from './create-beast-deps.js';
import { GovernorPortAdapter } from '../adapters/governor-adapter.js';
import type { GovernorPortAdapterDeps } from '../adapters/governor-adapter.js';
import { IssueFetcher } from '../issues/issue-fetcher.js';
import { IssueTriage } from '../issues/issue-triage.js';
import { IssueGraphBuilder } from '../issues/issue-graph-builder.js';
import { IssueReview } from '../issues/issue-review.js';
import type { ReviewIO } from '../issues/issue-review.js';
import { IssueRunner, type IssueRuntimeSupport, type IssueRuntimeArtifacts } from '../issues/issue-runner.js';
import { setupTraceViewer } from './trace-viewer.js';
import { ReplayContentStore } from '../replay/replay-content-store.js';
import type { TraceViewerHandle } from './trace-viewer.js';
import type {
  BeastLoopDeps, IPlannerModule, ICritiqueModule, IGovernorModule,
} from '../deps.js';
import type { RunConfig } from './run-config-loader.js';
import type { ProjectPaths } from './project-root.js';

export interface CliDepOptions {
  paths: ProjectPaths;
  baseBranch: string;
  budget: number;
  provider: string;
  providers?: string[] | undefined;
  providersConfig?: Record<string, { command?: string | undefined; model?: string | undefined; extraArgs?: string[] | undefined }> | undefined;
  noPr: boolean;
  verbose: boolean;
  reset: boolean;
  resume?: boolean | undefined;
  planDirOverride?: string | undefined;
  /** When provided, issue-specific deps will be created. */
  issueIO?: ReviewIO | undefined;
  /** Dry-run flag for IssueReview. */
  dryRun?: boolean | undefined;
  /** Stream line callback for real-time progress during LLM calls. */
  onStreamLine?: ((line: string) => void) | undefined;
  /**
   * Override working directory for the LLM adapter.
   * Use os.tmpdir() for planning calls to prevent project-scoped plugins
   * (superpowers, feature-dev, etc.) from loading in the spawned CLI.
   * Plugins load based on .claude/settings.json at the git project root;
   * running from /tmp means no project root, so no plugins fire.
   */
  adapterWorkingDir?: string | undefined;
  /** Override the model used by the LLM adapter (e.g. 'claude-sonnet-4-6' for chat). */
  adapterModel?: string | undefined;
  /** When true, omit tool/permission flags — used for conversational chat. */
  chatMode?: boolean | undefined;
  /** Security tier for firewall guardrails. Default: 'MODERATE'. */
  firewallSecurityTier?: 'STRICT' | 'MODERATE' | 'PERMISSIVE';
  /** Directory containing project-local skills. Default: <root>/skills */
  skillsDir?: string;
  /** Per-module enable/disable toggles. Defaults to all enabled. Falls back to FRANKENBEAST_MODULE_* env vars. */
  enabledModules?: import('../beasts/types.js').ModuleConfig;
  /** Max critique loop iterations before halting. Default: 3. */
  critiqueMaxIterations?: number;
  /** Consensus threshold for critique pass verdict. Default: 0.7. */
  critiqueConsensusThreshold?: number;
  /** RunConfig loaded from config file passthrough (spawned agent). */
  runConfig?: RunConfig | undefined;
  /** OrchestratorConfig for consolidation field overrides (security, brain, providers). */
  orchestratorConfig?: import('../config/orchestrator-config.js').OrchestratorConfig | undefined;
  /** Stable Beast session/run id used to correlate replay records and persisted manifests. */
  runSessionId?: string | undefined;
}

export interface IssueCliDeps {
  fetcher: IssueFetcher;
  triage: IssueTriage;
  graphBuilder: IssueGraphBuilder;
  review: IssueReview;
  runner: IssueRunner;
  executor: CliSkillExecutor;
  git: GitBranchIsolator;
  prCreator?: PrCreator | undefined;
  checkpoint: FileCheckpointStore;
  issueRuntime: IssueRuntimeSupport;
}

export interface CliDeps {
  deps: BeastLoopDeps;
  cliLlmAdapter: CliLlmAdapter;
  observerBridge: CliObserverBridge;
  logger: BeastLogger;
  finalize: () => Promise<void>;
  issueDeps?: IssueCliDeps | undefined;
  skillManager?: import('../skills/skill-manager.js').SkillManager | undefined;
  providerRegistry?: import('../providers/provider-registry.js').ProviderRegistry | undefined;
  middlewareChain?: ReturnType<typeof import('../middleware/security-profiles.js').buildMiddlewareChain> | undefined;
}

// ── Passthrough Stubs ──

const stubPlanner: IPlannerModule = {
  createPlan: async () => { throw new Error('Planner not available in CLI mode; use graphBuilder'); },
};
const stubCritique: ICritiqueModule = {
  reviewPlan: async () => ({ verdict: 'pass' as const, findings: [], score: 1.0 }),
};
const stubGovernor: IGovernorModule = {
  requestApproval: async () => ({ decision: 'approved' as const }),
};

function issueArtifactsFor(paths: ProjectPaths, issueNumber: number): IssueRuntimeArtifacts {
  const planName = `issue-${issueNumber}`;
  const issueDir = resolve(paths.buildDir, 'issues', planName);
  return {
    planName,
    planDir: resolve(paths.plansDir, planName),
    checkpointFile: resolve(issueDir, `${planName}.checkpoint`),
    logFile: resolve(issueDir, `${planName}-build.log`),
  };
}

function createIssueRuntimeSupport(paths: ProjectPaths): IssueRuntimeSupport {
  return {
    planNameForIssue: (issueNumber: number) => issueArtifactsFor(paths, issueNumber).planName,
    checkpointForIssue: (issueNumber: number) => new FileCheckpointStore(issueArtifactsFor(paths, issueNumber).checkpointFile),
    artifactsForIssue: (issueNumber: number) => issueArtifactsFor(paths, issueNumber),
  };
}

function discoverWorkspacePackages(root: string): string[] {
  const packagesDir = resolve(root, 'packages');
  try {
    return readdirSync(packagesDir)
      .map(dir => {
        try {
          const pkg = JSON.parse(
            readFileSync(resolve(packagesDir, dir, 'package.json'), 'utf-8'),
          );
          return pkg.name as string;
        } catch { return null; }
      })
      .filter((name): name is string => name !== null);
  } catch { return []; }
}

interface EffectiveCliConfig {
  provider: string;
  model?: string | undefined;
  baseBranch: string;
  budget: number;
  branchPattern: string;
  prCreation?: 'auto' | 'manual' | 'disabled' | undefined;
  mergeStrategy?: 'merge' | 'squash' | 'rebase' | undefined;
  skills?: string[] | undefined;
  modules: {
    memory: boolean;
    planner: boolean;
    critique: boolean;
    governor: boolean;
  };
}

interface SessionArtifacts {
  planName: string;
  checkpointFile: string;
  logFile: string;
}

interface ObserverDepsBundle {
  logger: BeastLogger;
  observerBridge: CliObserverBridge;
  replayAuditRoot: string;
  runSessionId: string;
  traceViewerHandle: TraceViewerHandle | null;
}

interface ExecutionStackDeps {
  checkpoint: FileCheckpointStore;
  chunkSessionStore: FileChunkSessionStore;
  chunkSessionSnapshotStore: FileChunkSessionSnapshotStore;
  chunkSessionRenderer: ChunkSessionRenderer;
  registry: ReturnType<typeof createDefaultRegistry>;
  martin: MartinLoop;
  gitIso: GitBranchIsolator;
}

interface LlmDeps {
  cliLlmAdapter: CliLlmAdapter;
  cachedLlm: CachedCliLlmClient;
}

interface CliExecutorDeps {
  cliExecutor: CliSkillExecutor;
  prCreator?: PrCreator | undefined;
}

function resolveEffectiveConfig(options: CliDepOptions): EffectiveCliConfig {
  const effectiveModules = options.runConfig?.modules ?? options.enabledModules;
  return {
    provider: options.runConfig?.llmConfig?.default?.provider
      ?? options.runConfig?.provider
      ?? options.provider,
    model: options.runConfig?.llmConfig?.default?.model
      ?? options.runConfig?.model,
    baseBranch: options.runConfig?.gitConfig?.baseBranch ?? options.baseBranch,
    budget: options.budget,
    branchPattern: options.runConfig?.gitConfig?.branchPattern ?? 'feat/',
    prCreation: options.runConfig?.gitConfig?.prCreation,
    mergeStrategy: options.runConfig?.gitConfig?.mergeStrategy,
    skills: options.runConfig?.skills,
    modules: {
      memory: effectiveModules?.memory ?? (process.env.FRANKENBEAST_MODULE_MEMORY !== 'false'),
      planner: effectiveModules?.planner ?? (process.env.FRANKENBEAST_MODULE_PLANNER !== 'false'),
      critique: effectiveModules?.critique ?? (process.env.FRANKENBEAST_MODULE_CRITIQUE !== 'false'),
      governor: effectiveModules?.governor ?? (process.env.FRANKENBEAST_MODULE_GOVERNOR !== 'false'),
    },
  };
}

function createSessionArtifacts(options: CliDepOptions): SessionArtifacts {
  const { paths } = options;
  const planName = options.planDirOverride
    ? basename(options.planDirOverride).replace(/\/$/, '')
    : basename(paths.plansDir) === 'plans' ? 'session' : basename(paths.plansDir);
  const checkpointFile = resolve(paths.buildDir, `${planName}.checkpoint`);
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return {
    planName,
    checkpointFile,
    logFile: resolve(paths.buildDir, `${planName}-${ts}-build.log`),
  };
}

function clearSessionArtifacts(options: CliDepOptions, artifacts: SessionArtifacts): void {
  const { paths } = options;
  if (options.reset) {
    const memoryDbPath = resolve(paths.buildDir, 'memory.db');
    for (const f of [artifacts.checkpointFile, paths.tracesDb, memoryDbPath]) {
      try { if (existsSync(f)) unlinkSync(f); } catch {}
    }
    for (const dir of [resolve(paths.buildDir, 'issues'), paths.chunkSessionsDir, paths.chunkSessionSnapshotsDir]) {
      try { if (existsSync(dir)) rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  } else if (!options.resume) {
    try { if (existsSync(artifacts.checkpointFile)) unlinkSync(artifacts.checkpointFile); } catch {}
    for (const dir of [paths.chunkSessionsDir, paths.chunkSessionSnapshotsDir]) {
      try { if (existsSync(dir)) rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  }
}

async function createObserverDeps(
  options: CliDepOptions,
  config: EffectiveCliConfig,
  artifacts: SessionArtifacts,
): Promise<ObserverDepsBundle> {
  mkdirSync(options.paths.buildDir, { recursive: true });
  const logger = new BeastLogger({
    verbose: options.verbose,
    captureForFile: true,
    logFile: artifacts.logFile,
  });
  const replayAuditRoot = resolve(options.paths.root, '.fbeast', 'audit');
  const replayStore = new ReplayContentStore(replayAuditRoot);
  const observerBridge = new CliObserverBridge({ budgetLimitUsd: config.budget, replayStore });
  const runSessionId = options.runSessionId ?? `cli-session-${Date.now()}`;
  observerBridge.startTrace(runSessionId);
  const traceViewerHandle = options.verbose
    ? await setupTraceViewer(options.paths.tracesDb, logger)
    : null;

  return { logger, observerBridge, replayAuditRoot, runSessionId, traceViewerHandle };
}

function createExecutionStack(
  options: CliDepOptions,
  config: EffectiveCliConfig,
  artifacts: SessionArtifacts,
): ExecutionStackDeps {
  const checkpoint = new FileCheckpointStore(artifacts.checkpointFile);
  const chunkSessionStore = new FileChunkSessionStore(options.paths.chunkSessionsDir);
  const chunkSessionSnapshotStore = new FileChunkSessionSnapshotStore(options.paths.chunkSessionSnapshotsDir);
  const chunkSessionRenderer = new ChunkSessionRenderer();
  const chunkSessionGc = new ChunkSessionGc({
    sessionRoot: options.paths.chunkSessionsDir,
    snapshotRoot: options.paths.chunkSessionSnapshotsDir,
    completedTtlMs: 24 * 60 * 60 * 1000,
    failedTtlMs: 72 * 60 * 60 * 1000,
  });
  chunkSessionGc.collect();

  const registry = createDefaultRegistry();
  const martin = new MartinLoop(registry);
  const gitIso = new GitBranchIsolator({
    baseBranch: config.baseBranch,
    branchPrefix: config.branchPattern,
    autoCommit: true,
    workingDir: options.paths.root,
    ...(config.mergeStrategy ? { mergeStrategy: config.mergeStrategy as 'merge' | 'squash' | 'rebase' } : {}),
  });

  return {
    checkpoint,
    chunkSessionStore,
    chunkSessionSnapshotStore,
    chunkSessionRenderer,
    registry,
    martin,
    gitIso,
  };
}

function createLlmDeps(
  options: CliDepOptions,
  config: EffectiveCliConfig,
  artifacts: SessionArtifacts,
  observer: ObserverDepsBundle,
  stack: ExecutionStackDeps,
): LlmDeps {
  const resolvedProvider = stack.registry.get(config.provider);
  const override = options.providersConfig?.[config.provider];
  const cliLlmAdapter = new CliLlmAdapter(resolvedProvider, {
    workingDir: options.adapterWorkingDir ?? options.paths.root,
    ...(override?.command ? { commandOverride: override.command } : {}),
    ...((config.model ?? options.adapterModel) != null ? { model: (config.model ?? options.adapterModel)! } : {}),
    ...(options.chatMode ? { chatMode: true } : {}),
    ...(options.onStreamLine ? { onStreamLine: options.onStreamLine } : {}),
    replayRunId: () => observer.observerBridge.getActiveSessionId() ?? observer.runSessionId,
    replayRecorder: (record) => observer.observerBridge.recordReplay(record),
    ...(options.providers ? { providers: options.providers } : {}),
    registry: stack.registry,
    ...(options.providersConfig ? { providerOverrides: options.providersConfig } : {}),
  });

  new AdapterLlmClient(
    cliLlmAdapter,
    observer.observerBridge.observerDeps as never,
    config.provider,
  );

  const cachedLlm = new CachedCliLlmClient({
    cacheRootDir: options.paths.llmCacheDir,
    cliAdapter: cliLlmAdapter,
    projectId: options.paths.root,
    provider: config.provider,
    model: override?.model ?? config.model ?? options.adapterModel ?? config.provider,
    operation: 'cli-session',
    workId: `session:${artifacts.planName}`,
    stablePrefix: 'surface:cli',
    workPrefix: `plan:${artifacts.planName}`,
    observer: observer.observerBridge.observerDeps as never,
  });

  return { cliLlmAdapter, cachedLlm };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current: unknown = error;
  while (current !== undefined && current !== null) {
    chain.push(current);
    if (typeof current !== 'object' || !('cause' in current)) break;
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
}

function errorDiagnostic(error: unknown): string {
  return errorChain(error).map(errorMessage).join(': ');
}

function isMissingOptionalModule(error: unknown, moduleName: string): boolean {
  return errorChain(error).some((candidate) => {
    if (typeof candidate !== 'object' || candidate === null) return false;
    const code = 'code' in candidate ? String((candidate as { code?: unknown }).code) : undefined;
    if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'MODULE_NOT_FOUND') return false;

    const message = errorMessage(candidate);
    return message.includes(`'${moduleName}'`)
      || message.includes(`"${moduleName}"`)
      || message.includes(`Cannot find module ${moduleName}`)
      || message.includes(`Cannot find package ${moduleName}`);
  });
}

async function importOptionalModule<T>(moduleName: string, logger: BeastLogger): Promise<T | undefined> {
  try {
    return await import(moduleName) as T;
  } catch (error) {
    if (isMissingOptionalModule(error, moduleName)) {
      logger.warn(`${moduleName} unavailable, using stub: ${errorDiagnostic(error)}`, 'dep-factory');
      return undefined;
    }
    throw new Error(`Failed to load optional module ${moduleName}: ${errorDiagnostic(error)}`, { cause: error });
  }
}

async function createCritiqueDeps(
  options: CliDepOptions,
  config: EffectiveCliConfig,
  observer: ObserverDepsBundle,
): Promise<ICritiqueModule> {
  if (!config.modules.critique) return stubCritique;

  const critiqueModule = await importOptionalModule<typeof import('@franken/critique')>(
    '@franken/critique',
    observer.logger,
  );
  if (!critiqueModule) return stubCritique;

  const critiqueGuardrails = {
    getSafetyRules: async () => [] as never[],
    executeSandbox: async () => ({ success: true as const, output: '', exitCode: 0, timedOut: false }),
  };
  const critiqueMemory = {
    searchADRs: async () => [] as never[],
    searchEpisodic: async () => [] as never[],
    recordLesson: async () => {},
  };
  const critiqueObservability = {
    getTokenSpend: (sessionId: string) => observer.observerBridge.getTokenSpend(sessionId),
  };

  const reviewer = critiqueModule.createReviewer({
    guardrails: critiqueGuardrails,
    memory: critiqueMemory,
    observability: critiqueObservability,
    knownPackages: discoverWorkspacePackages(options.paths.root),
  });

  return new CritiquePortAdapter({
    loop: { run: (input: never, adapterConfig: never) => reviewer.review(input, adapterConfig) },
    config: {
      maxIterations: options.critiqueMaxIterations ?? 3,
      // `config.budget` is the CLI `--budget <usd>` dollar limit, so enforce it
      // as a cost budget. The token budget is left unbounded; the dollar budget
      // is the single budget the CLI exposes.
      tokenBudget: Number.POSITIVE_INFINITY,
      costBudgetUsd: config.budget,
      consensusThreshold: options.critiqueConsensusThreshold ?? 0.7,
      sessionId: `cli-critique-${Date.now()}`,
      taskId: 'plan-review',
    },
  });
}

async function createGovernanceDeps(
  options: CliDepOptions,
  config: EffectiveCliConfig,
  finalize: () => Promise<void>,
  logger: BeastLogger,
): Promise<{ governor: IGovernorModule; finalize: () => Promise<void> }> {
  if (!config.modules.governor) return { governor: stubGovernor, finalize };

  const governorModule = await importOptionalModule<typeof import('@franken/governor')>(
    '@franken/governor',
    logger,
  );
  if (!governorModule) return { governor: stubGovernor, finalize };

  const { stdin, stdout } = await import('node:process');
  if (!stdin.isTTY) {
    return {
      governor: new GovernorPortAdapter({
        gateway: { requestApproval: async () => ({ decision: 'APPROVE' as const }) } as never,
        projectId: basename(options.paths.root),
        defaultDecision: process.env.FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL === '1'
          ? ('approved' as const)
          : ('rejected' as const),
      }),
      finalize,
    };
  }

  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: stdin, output: stdout });
  const cliChannel = new governorModule.CliChannel({
    readline: { question: (prompt: string) => rl.question(prompt) },
    operatorName: 'operator',
  });
  const gateway = new governorModule.ApprovalGateway({
    channel: cliChannel,
    auditRecorder: { record: async () => {} },
    config: governorModule.defaultConfig(),
  });

  return {
    governor: new GovernorPortAdapter({
      gateway: gateway as unknown as GovernorPortAdapterDeps['gateway'],
      projectId: basename(options.paths.root),
    }),
    finalize: async () => {
      rl.close();
      await finalize();
    },
  };
}

function createCliExecutorDeps(
  options: CliDepOptions,
  config: EffectiveCliConfig,
  artifacts: SessionArtifacts,
  observer: ObserverDepsBundle,
  stack: ExecutionStackDeps,
  llm: LlmDeps,
): CliExecutorDeps {
  const prDisabled = options.noPr || config.prCreation === 'disabled';
  const prCreator = prDisabled ? undefined : new PrCreator(
    { targetBranch: config.baseBranch, disabled: false, remote: 'origin' },
    undefined,
    llm.cachedLlm,
  );
  const commitMessageFn = prCreator
    ? (diffStat: string, objective: string) => prCreator.generateCommitMessage(diffStat, objective)
    : undefined;

  const override = options.providersConfig?.[config.provider];
  const cliExecutor = new CliSkillExecutor(
    stack.martin,
    stack.gitIso,
    observer.observerBridge.observerDeps,
    'npx tsc --noEmit',
    commitMessageFn,
    observer.logger,
    {
      provider: config.provider,
      planName: artifacts.planName,
      sessionStore: stack.chunkSessionStore,
      snapshotStore: stack.chunkSessionSnapshotStore,
      renderer: stack.chunkSessionRenderer,
      compactor: new ChunkSessionCompactor({
        summarize: async (prompt: string) => {
          const response = await llm.cachedLlm.complete(prompt, {
            operation: 'chunk-session-compaction',
            workId: `chunk-compactor:${artifacts.planName}`,
            stablePrefix: 'surface:chunk-session-compactor',
            workPrefix: `plan:${artifacts.planName}`,
          });
          return response.trim();
        },
      }),
      contextUsage: (prompt: string, provider: string, maxTokens: number) =>
        observer.observerBridge.estimateContextWindow({
          renderedPrompt: prompt,
          provider,
          maxTokens,
        }),
      providers: options.providers,
      ...(override?.command ? { command: override.command } : {}),
    },
  );

  return { cliExecutor, prCreator };
}

function createConsolidatedDeps(
  options: CliDepOptions,
  config: EffectiveCliConfig,
  observer: ObserverDepsBundle,
  stack: ExecutionStackDeps,
  executor: CliExecutorDeps,
  critique: ICritiqueModule,
  governor: IGovernorModule,
): ConsolidatedDeps {
  const runConfigOverrides: import('../deps.js').RunConfigOverrides | undefined =
    config.skills?.length
      ? { allowedSkills: config.skills }
      : undefined;

  const beastConfig = bridgeToBeastConfig(options, options.orchestratorConfig);
  const existingDeps = bridgeToExistingDeps({
    planner: stubPlanner,
    critique,
    governor,
    observer: observer.observerBridge,
    logger: observer.logger,
    cliExecutor: executor.cliExecutor,
    checkpoint: stack.checkpoint,
    ...(executor.prCreator ? { prCreator: executor.prCreator } : {}),
    ...(runConfigOverrides ? { runConfigOverrides } : {}),
  });

  try {
    return createBeastDeps(beastConfig, existingDeps);
  } catch (error) {
    const reason = errorMessage(error);
    observer.logger.warn(`createBeastDeps failed: ${reason}`, 'dep-factory');
    throw new Error(`createBeastDeps failed: ${reason}`);
  }
}

function createSkillDeps(consolidated: ConsolidatedDeps, allowedSkills?: string[] | undefined): BeastLoopDeps['skills'] {
  const baseSkills = consolidated.skills;
  const cliSkillCompat = (id: string) => id.startsWith('cli:');
  return allowedSkills?.length
    ? {
        hasSkill: (id: string) => cliSkillCompat(id) || (allowedSkills.includes(id) && baseSkills.hasSkill(id)),
        getAvailableSkills: () => baseSkills.getAvailableSkills().filter((s) => allowedSkills.includes(s.id)),
        execute: baseSkills.execute,
      }
    : {
        hasSkill: (id: string) => cliSkillCompat(id) || baseSkills.hasSkill(id),
        getAvailableSkills: () => baseSkills.getAvailableSkills(),
        execute: baseSkills.execute,
      };
}

function createIssueDeps(
  options: CliDepOptions,
  paths: ProjectPaths,
  stack: ExecutionStackDeps,
  executor: CliExecutorDeps,
  llm: LlmDeps,
): IssueCliDeps | undefined {
  if (!options.issueIO) return undefined;

  const completeFn = (
    prompt: string,
    hint?: {
      operation?: string;
      workId?: string;
      stablePrefix?: string;
      workPrefix?: string;
    },
  ) => llm.cachedLlm.complete(prompt, {
    operation: hint?.operation ?? 'issues',
    workId: hint?.workId,
    stablePrefix: hint?.stablePrefix ?? 'surface:issues',
    workPrefix: hint?.workPrefix,
  });
  return {
    fetcher: new IssueFetcher(),
    triage: new IssueTriage(completeFn),
    graphBuilder: new IssueGraphBuilder(completeFn),
    review: new IssueReview(options.issueIO, { dryRun: options.dryRun }),
    runner: new IssueRunner(),
    executor: executor.cliExecutor,
    git: stack.gitIso,
    prCreator: executor.prCreator,
    checkpoint: stack.checkpoint,
    issueRuntime: createIssueRuntimeSupport(paths),
  };
}

function appendAuditFinalize(
  finalize: () => Promise<void>,
  observer: ObserverDepsBundle,
  consolidated: ConsolidatedDeps,
): () => Promise<void> {
  return async () => {
    const runId = observer.runSessionId;
    try {
      consolidated.persistAuditTrail?.(runId);
      const bridgeManifest = observer.observerBridge.getReplayManifest();
      if (bridgeManifest.length > 0) {
        mkdirSync(observer.replayAuditRoot, { recursive: true });
        const manifestsByRunId = new Map<string, Array<(typeof bridgeManifest)[number]>>();
        for (const record of bridgeManifest) {
          const records = manifestsByRunId.get(record.runId) ?? [];
          records.push(record);
          manifestsByRunId.set(record.runId, records);
        }
        for (const [manifestRunId, records] of manifestsByRunId) {
          const replayManifestPath = join(observer.replayAuditRoot, `${manifestRunId}.replay.json`);
          let existingManifest: unknown[] = [];
          if (existsSync(replayManifestPath)) {
            const parsed = JSON.parse(readFileSync(replayManifestPath, 'utf8')) as unknown;
            if (Array.isArray(parsed)) {
              existingManifest = parsed;
            }
          }
          writeFileSync(
            replayManifestPath,
            JSON.stringify([...existingManifest, ...records], null, 2),
            'utf8',
          );
        }
      }
    } catch { /* best-effort */ }
    try { consolidated.sqliteBrain?.close(); } catch { /* best-effort */ }
    try { observer.logger.close(); } catch { /* best-effort */ }
    await finalize();
  };
}

function createObserverFinalize(observer: ObserverDepsBundle): () => Promise<void> {
  return async () => {
    if (observer.traceViewerHandle) {
      await observer.traceViewerHandle.stop();
    }
  };
}

export async function createCliDeps(options: CliDepOptions): Promise<CliDeps> {
  const config = resolveEffectiveConfig(options);
  const artifacts = createSessionArtifacts(options);
  clearSessionArtifacts(options, artifacts);

  const observer = await createObserverDeps(options, config, artifacts);
  let finalize = createObserverFinalize(observer);

  try {
    const stack = createExecutionStack(options, config, artifacts);
    const llm = createLlmDeps(options, config, artifacts, observer, stack);
    const critique = await createCritiqueDeps(options, config, observer);

    const governance = await createGovernanceDeps(options, config, finalize, observer.logger);
    finalize = governance.finalize;

    const executor = createCliExecutorDeps(options, config, artifacts, observer, stack, llm);
    const consolidated = createConsolidatedDeps(
      options,
      config,
      observer,
      stack,
      executor,
      critique,
      governance.governor,
    );
    const deps: BeastLoopDeps = {
      ...consolidated,
      skills: createSkillDeps(consolidated, config.skills),
    };
    const issueDeps = createIssueDeps(options, options.paths, stack, executor, llm);
    finalize = appendAuditFinalize(finalize, observer, consolidated);

    return {
      deps,
      cliLlmAdapter: llm.cliLlmAdapter,
      observerBridge: observer.observerBridge,
      logger: observer.logger,
      finalize,
      issueDeps,
      ...(consolidated.skillManager ? { skillManager: consolidated.skillManager } : {}),
      ...(consolidated.providerRegistry ? { providerRegistry: consolidated.providerRegistry } : {}),
      ...(consolidated.middlewareChain ? { middlewareChain: consolidated.middlewareChain } : {}),
    };
  } catch (error) {
    try { await finalize(); } catch { /* best-effort */ }
    try { observer.logger.close(); } catch { /* best-effort */ }
    throw error;
  }
}
