import { existsSync, unlinkSync, readdirSync, mkdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { BeastLogger } from '../logging/beast-logger.js';
import { MartinLoop } from '../skills/martin-loop.js';
import { GitBranchIsolator } from '../skills/git-branch-isolator.js';
import { CliSkillExecutor } from '../skills/cli-skill-executor.js';
import { CliLlmAdapter } from '../adapters/cli-llm-adapter.js';
import { createDefaultRegistry } from '../skills/providers/cli-provider.js';
import { CliObserverBridge } from '../adapters/cli-observer-bridge.js';
import { FileCheckpointStore } from '../checkpoint/file-checkpoint-store.js';
import { PrCreator } from '../closure/pr-creator.js';
import { AdapterLlmClient } from '../adapters/adapter-llm-client.js';
import { IssueFetcher } from '../issues/issue-fetcher.js';
import { IssueTriage } from '../issues/issue-triage.js';
import { IssueGraphBuilder } from '../issues/issue-graph-builder.js';
import { IssueReview } from '../issues/issue-review.js';
import type { ReviewIO } from '../issues/issue-review.js';
import { IssueRunner } from '../issues/issue-runner.js';
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

export async function createCliDeps(options: CliDepOptions): Promise<CliDeps> {
  const { paths, baseBranch, budget, verbose, noPr, reset } = options;

  // Derive plan name for plan-specific build artifacts
  const planName = options.planDirOverride
    ? basename(options.planDirOverride).replace(/\/$/, '')
    : 'session';
  const checkpointFile = resolve(paths.buildDir, `${planName}.checkpoint`);

  // Reset if requested
  if (reset) {
    for (const f of [checkpointFile, paths.tracesDb]) {
      try { if (existsSync(f)) unlinkSync(f); } catch {}
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
  });

  const adapterLlm = new AdapterLlmClient(cliLlmAdapter);

  // PR creator (wrap adapter as ILlmClient for LLM-powered titles/descriptions)
  const prCreator = noPr ? undefined : new PrCreator(
    { targetBranch: baseBranch, disabled: false, remote: 'origin' },
    undefined,
    adapterLlm,
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
    firewall: stubFirewall,
    skills: createStubSkills(options.planDirOverride ?? paths.plansDir),
    memory: stubMemory,
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
    const completeFn = (prompt: string) => adapterLlm.complete(prompt);
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
    };
  }

  return { deps, cliLlmAdapter, observerBridge, logger, finalize, issueDeps };
}
