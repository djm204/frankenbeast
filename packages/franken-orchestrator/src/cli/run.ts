#!/usr/bin/env node

import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { parseArgs, printUsage } from './args.js';
import type { CliArgs } from './args.js';
import { loadConfig } from './config-loader.js';
import { cleanupBuild } from './cleanup.js';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import { resolveProjectRoot, getProjectPaths, generatePlanName, scaffoldFrankenbeast } from './project-root.js';
import { resolveBaseBranch } from './base-branch.js';
import { Session } from './session.js';
import type { SessionPhase } from './session.js';
import type { InterviewIO } from '../planning/interview-loop.js';
import { renderBanner, BeastLogger } from '../logging/beast-logger.js';

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

async function main(): Promise<void> {
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
  console.log(await renderBanner(root));

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

  // Create IO for interactive prompts
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

main().catch((error) => {
  console.error('Fatal:', error instanceof Error ? error.message : error);
  process.exit(1);
});
