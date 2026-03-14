import { existsSync, unlinkSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { basename, resolve } from 'node:path';
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
import { FirewallPortAdapter } from '../adapters/firewall-adapter.js';
import type { FirewallPortAdapterDeps } from '../adapters/firewall-adapter.js';
import { EpisodicMemoryPortAdapter } from '../adapters/episodic-memory-port-adapter.js';
import { SkillRegistryBridge } from '../adapters/skill-registry-bridge.js';
import { SkillsPortAdapter } from '../adapters/skills-adapter.js';
import { IssueFetcher } from '../issues/issue-fetcher.js';
import { IssueTriage } from '../issues/issue-triage.js';
import { IssueGraphBuilder } from '../issues/issue-graph-builder.js';
import { IssueReview } from '../issues/issue-review.js';
import type { ReviewIO } from '../issues/issue-review.js';
import { IssueRunner, type IssueRuntimeSupport, type IssueRuntimeArtifacts } from '../issues/issue-runner.js';
import { setupTraceViewer } from './trace-viewer.js';
import type { TraceViewerHandle } from './trace-viewer.js';
import type {
  BeastLoopDeps, IFirewallModule, ISkillsModule, IMemoryModule,
  IPlannerModule, ICritiqueModule, IGovernorModule,
  IHeartbeatModule,
} from '../deps.js';
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
}

// ── Passthrough Stubs ──

const stubFirewall: IFirewallModule = {
  runPipeline: async (input) => ({ sanitizedText: input, violations: [], blocked: false }),
};
const stubMemory: IMemoryModule = {
  frontload: async () => {},
  getContext: async () => ({ adrs: [], knownErrors: [], rules: [] }),
  recordTrace: async () => {},
};
const stubPlanner: IPlannerModule = {
  createPlan: async () => { throw new Error('Planner not available in CLI mode; use graphBuilder'); },
};
const stubCritique: ICritiqueModule = {
  reviewPlan: async () => ({ verdict: 'pass' as const, findings: [], score: 1.0 }),
};
const stubGovernor: IGovernorModule = {
  requestApproval: async () => ({ decision: 'approved' as const }),
};
const stubHeartbeat: IHeartbeatModule = {
  pulse: async () => ({ improvements: [], techDebt: [], summary: '' }),
};

function createStubSkills(planDir: string): ISkillsModule {
  return {
    hasSkill: (id: string) => id.startsWith('cli:'),
    getAvailableSkills: () => {
      try {
        return readdirSync(planDir)
          .filter((f) => f.endsWith('.md') && !f.startsWith('00_') && /^\d{2}/.test(f))
          .map((f) => ({
            id: `cli:${f.replace('.md', '')}`,
            name: f.replace('.md', ''),
            executionType: 'cli' as const,
            requiresHitl: false,
          }));
      } catch { return []; }
    },
    execute: async () => { throw new Error('No skills in CLI mode'); },
  };
}

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

export async function createCliDeps(options: CliDepOptions): Promise<CliDeps> {
  const { paths, baseBranch, budget, verbose, noPr, reset } = options;

  // Resolve per-agent module toggles (options > env vars > default enabled)
  const modules = {
    firewall: options.enabledModules?.firewall ?? (process.env.FRANKENBEAST_MODULE_FIREWALL !== 'false'),
    skills: options.enabledModules?.skills ?? (process.env.FRANKENBEAST_MODULE_SKILLS !== 'false'),
    memory: options.enabledModules?.memory ?? (process.env.FRANKENBEAST_MODULE_MEMORY !== 'false'),
    planner: options.enabledModules?.planner ?? (process.env.FRANKENBEAST_MODULE_PLANNER !== 'false'),
    critique: options.enabledModules?.critique ?? (process.env.FRANKENBEAST_MODULE_CRITIQUE !== 'false'),
    governor: options.enabledModules?.governor ?? (process.env.FRANKENBEAST_MODULE_GOVERNOR !== 'false'),
    heartbeat: options.enabledModules?.heartbeat ?? (process.env.FRANKENBEAST_MODULE_HEARTBEAT !== 'false'),
  };

  // Derive plan name for plan-specific build artifacts
  const planName = options.planDirOverride
    ? basename(options.planDirOverride).replace(/\/$/, '')
    : basename(paths.plansDir) === 'plans' ? 'session' : basename(paths.plansDir);
  const checkpointFile = resolve(paths.buildDir, `${planName}.checkpoint`);

  // Reset if requested
  if (reset) {
    const memoryDbPath = resolve(paths.buildDir, 'memory.db');
    for (const f of [checkpointFile, paths.tracesDb, memoryDbPath]) {
      try { if (existsSync(f)) unlinkSync(f); } catch {}
    }
    for (const dir of [resolve(paths.buildDir, 'issues'), paths.chunkSessionsDir, paths.chunkSessionSnapshotsDir]) {
      try { if (existsSync(dir)) rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  }

  // Build timestamped log file: .build/<plan-name>-<datetime>-build.log
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19); // 2026-03-08T20-12-05
  const logFile = resolve(paths.buildDir, `${planName}-${ts}-build.log`);
  mkdirSync(paths.buildDir, { recursive: true });

  const logger = new BeastLogger({ verbose, captureForFile: true, logFile });

  // Observer
  const observerBridge = new CliObserverBridge({ budgetLimitUsd: budget });
  observerBridge.startTrace(`cli-session-${Date.now()}`);

  // Trace viewer (verbose mode only)
  let traceViewerHandle: TraceViewerHandle | null = null;
  if (verbose) {
    traceViewerHandle = await setupTraceViewer(paths.tracesDb, logger);
  }

  // CLI execution stack
  const checkpoint = new FileCheckpointStore(checkpointFile);
  const chunkSessionStore = new FileChunkSessionStore(paths.chunkSessionsDir);
  const chunkSessionSnapshotStore = new FileChunkSessionSnapshotStore(paths.chunkSessionSnapshotsDir);
  const chunkSessionRenderer = new ChunkSessionRenderer();
  const chunkSessionGc = new ChunkSessionGc({
    sessionRoot: paths.chunkSessionsDir,
    snapshotRoot: paths.chunkSessionSnapshotsDir,
    completedTtlMs: 24 * 60 * 60 * 1000,
    failedTtlMs: 72 * 60 * 60 * 1000,
  });
  chunkSessionGc.collect();
  const registry = createDefaultRegistry();
  const martin = new MartinLoop(registry);
  const gitIso = new GitBranchIsolator({
    baseBranch,
    branchPrefix: 'feat/',
    autoCommit: true,
    workingDir: paths.root,
  });
  const resolvedProvider = registry.get(options.provider);
  const override = options.providersConfig?.[options.provider];
  const cliLlmAdapter = new CliLlmAdapter(resolvedProvider, {
    workingDir: options.adapterWorkingDir ?? paths.root,
    ...(override?.command ? { commandOverride: override.command } : {}),
    ...(options.adapterModel ? { model: options.adapterModel } : {}),
    ...(options.chatMode ? { chatMode: true } : {}),
    ...(options.onStreamLine ? { onStreamLine: options.onStreamLine } : {}),
    ...(options.providers ? { providers: options.providers } : {}),
    registry,
    ...(options.providersConfig ? { providerOverrides: options.providersConfig } : {}),
  });

  const adapterLlm = new AdapterLlmClient(
    cliLlmAdapter,
    observerBridge.observerDeps as never,
    options.provider,
  );
  const cachedLlm = new CachedCliLlmClient({
    cacheRootDir: paths.llmCacheDir,
    cliAdapter: cliLlmAdapter,
    projectId: paths.root,
    provider: options.provider,
    model: override?.model ?? options.adapterModel ?? options.provider,
    operation: 'cli-session',
    workId: `session:${planName}`,
    stablePrefix: 'surface:cli',
    workPrefix: `plan:${planName}`,
    observer: observerBridge.observerDeps as never,
  });

  // Firewall (dynamic import — optional module)
  let firewall: IFirewallModule = stubFirewall;
  if (modules.firewall) {
    try {
      const { runPipeline, ClaudeAdapter } = await import('@franken/firewall');
      const firewallConfig = {
        project_name: basename(paths.root),
        security_tier: options.firewallSecurityTier ?? 'MODERATE',
        schema_version: 1 as const,
        agnostic_settings: {
          redact_pii: false,
          max_token_spend_per_call: budget,
          allowed_providers: ['anthropic' as const],
        },
        safety_hooks: { pre_flight: [] as string[], post_flight: [] as string[] },
      };
      firewall = new FirewallPortAdapter({
        runPipeline: runPipeline as unknown as FirewallPortAdapterDeps['runPipeline'],
        adapter: new ClaudeAdapter({
          apiKey: process.env.ANTHROPIC_API_KEY ?? '',
          model: options.adapterModel ?? 'claude-sonnet-4-6',
        }) as unknown as FirewallPortAdapterDeps['adapter'],
        config: firewallConfig,
        provider: 'anthropic',
        model: options.adapterModel ?? 'claude-sonnet-4-6',
      });
    } catch (error) {
      logger.warn(`Firewall module unavailable, using stub: ${error instanceof Error ? error.message : String(error)}`, 'dep-factory');
    }
  }

  // Skills (dynamic import — optional module)
  let skills: ISkillsModule = createStubSkills(options.planDirOverride ?? paths.plansDir);
  if (modules.skills) {
    try {
      const { createRegistry } = await import('@franken/skills');
      const skillsRegistry = createRegistry({
        localSkillsDir: options.skillsDir ?? resolve(paths.root, 'skills'),
      });
      await skillsRegistry.sync();
      const registryBridge = new SkillRegistryBridge(skillsRegistry);
      skills = new SkillsPortAdapter(registryBridge, adapterLlm);
    } catch (error) {
      logger.warn(`Skills module unavailable, using stub: ${error instanceof Error ? error.message : String(error)}`, 'dep-factory');
    }
  }

  // Memory (dynamic import — optional module)
  let memory: IMemoryModule = stubMemory;
  if (modules.memory) {
    try {
      const { EpisodicMemoryStore } = await import('franken-brain');
      const Database = (await import('better-sqlite3')).default;
      const memoryDbPath = resolve(paths.buildDir, 'memory.db');
      const memoryDb = new Database(memoryDbPath);
      const episodicStore = new EpisodicMemoryStore(memoryDb);
      memory = new EpisodicMemoryPortAdapter({
        episodicStore,
        projectId: basename(paths.root),
        projectRoot: paths.root,
      });
    } catch (error) {
      logger.warn(`Memory module unavailable, using stub: ${error instanceof Error ? error.message : String(error)}`, 'dep-factory');
    }
  }

  // PR creator (wrap adapter as ILlmClient for LLM-powered titles/descriptions)
  const prCreator = noPr ? undefined : new PrCreator(
    { targetBranch: baseBranch, disabled: false, remote: 'origin' },
    undefined,
    cachedLlm,
  );

  // Commit message generator — delegates to PrCreator's LLM prompt
  const commitMessageFn = prCreator
    ? (diffStat: string, objective: string) => prCreator.generateCommitMessage(diffStat, objective)
    : undefined;

  // Recovery verify command — typecheck as a fast sanity check that
  // dirty files from a crashed run don't break the build
  const verifyCommand = 'npx tsc --noEmit';

  const cliExecutor = new CliSkillExecutor(
    martin, gitIso, observerBridge.observerDeps,
    verifyCommand, commitMessageFn, logger,
    {
      provider: options.provider,
      planName,
      sessionStore: chunkSessionStore,
      snapshotStore: chunkSessionSnapshotStore,
      renderer: chunkSessionRenderer,
      compactor: new ChunkSessionCompactor({
        summarize: async (prompt: string) => {
          const response = await cachedLlm.complete(prompt, {
            operation: 'chunk-session-compaction',
            workId: `chunk-compactor:${planName}`,
            stablePrefix: 'surface:chunk-session-compactor',
            workPrefix: `plan:${planName}`,
          });
          return response.trim();
        },
      }),
      contextUsage: (prompt: string, provider: string, maxTokens: number) =>
        observerBridge.estimateContextWindow({
          renderedPrompt: prompt,
          provider,
          maxTokens,
        }),
      providers: options.providers,
      ...(override?.command ? { command: override.command } : {}),
    },
  );

  const finalize = async () => {
    if (traceViewerHandle) {
      await traceViewerHandle.stop();
    }
    // Log entries are now written incrementally by BeastLogger (crash-safe).
    // No batch write needed here.
  };

  const deps: BeastLoopDeps = {
    firewall,
    skills,
    memory,
    planner: stubPlanner,
    observer: observerBridge,
    critique: stubCritique,
    governor: stubGovernor,
    heartbeat: stubHeartbeat,
    logger,
    clock: () => new Date(),
    cliExecutor,
    checkpoint,
    ...(prCreator ? { prCreator } : {}),
  };

  // Issue pipeline deps (only created when issueIO is provided)
  let issueDeps: IssueCliDeps | undefined;
  if (options.issueIO) {
    const completeFn = (
      prompt: string,
      hint?: {
        operation?: string;
        workId?: string;
        stablePrefix?: string;
        workPrefix?: string;
      },
    ) => cachedLlm.complete(prompt, {
      operation: hint?.operation ?? 'issues',
      workId: hint?.workId,
      stablePrefix: hint?.stablePrefix ?? 'surface:issues',
      workPrefix: hint?.workPrefix,
    });
    const issueRuntime = createIssueRuntimeSupport(paths);
    issueDeps = {
      fetcher: new IssueFetcher(),
      triage: new IssueTriage(completeFn),
      graphBuilder: new IssueGraphBuilder(completeFn),
      review: new IssueReview(options.issueIO, { dryRun: options.dryRun }),
      runner: new IssueRunner(),
      executor: cliExecutor,
      git: gitIso,
      prCreator,
      checkpoint,
      issueRuntime,
    };
  }

  return { deps, cliLlmAdapter, observerBridge, logger, finalize, issueDeps };
}
