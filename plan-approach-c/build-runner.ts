#!/usr/bin/env npx tsx
/**
 * FRANKENBEAST Build Runner — Thin CLI Shell
 * Constructs BeastLoopDeps and calls BeastLoop.run().
 */
import { resolve } from 'node:path';
import { mkdirSync, existsSync, unlinkSync, appendFileSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import {
  BeastLoop, BeastLogger, BANNER, ANSI, budgetBar, statusBadge, logHeader,
  ChunkFileGraphBuilder, LlmGraphBuilder, InterviewLoop, AdapterLlmClient, CliSkillExecutor, RalphLoop, GitBranchIsolator,
  FileCheckpointStore, PrCreator,
} from '../franken-orchestrator/src/index.js';
import type { InterviewIO } from '../franken-orchestrator/src/index.js';
import type {
  BeastLoopDeps, BeastResult, IFirewallModule, ISkillsModule, IMemoryModule,
  IPlannerModule, IObserverModule, ICritiqueModule, IGovernorModule, IHeartbeatModule,
} from '../franken-orchestrator/src/index.js';
import {
  TraceContext, SpanLifecycle, TokenCounter, CostCalculator, CircuitBreaker,
  LoopDetector, SQLiteAdapter, TraceServer, DEFAULT_PRICING,
} from '../franken-observer/src/index.js';

// ── CLI Args ──
interface CliArgs {
  baseBranch: string; planDir: string; budget: number;
  mode: 'chunks' | 'design-doc' | 'interview';
  designDoc: string;
  provider: 'claude' | 'codex';
  noPr: boolean; reset: boolean; verbose: boolean; help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    baseBranch: '', planDir: resolve(import.meta.dirname || __dirname, '.'),
    budget: 10, mode: 'chunks', designDoc: '', provider: 'claude',
    noPr: false, reset: false, verbose: false, help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--base-branch': args.baseBranch = argv[++i]; break;
      case '--plan-dir': args.planDir = resolve(argv[++i]); break;
      case '--budget': args.budget = parseFloat(argv[++i]); break;
      case '--mode': { const v = argv[++i]; if (v === 'chunks' || v === 'design-doc' || v === 'interview') args.mode = v; break; }
      case '--design-doc': args.designDoc = resolve(argv[++i]); break;
      case '--provider': { const v = (argv[++i] ?? '').toLowerCase(); if (v === 'claude' || v === 'codex') args.provider = v; break; }
      case '--no-pr': args.noPr = true; break;
      case '--reset': args.reset = true; break;
      case '--verbose': args.verbose = true; break;
      case '--help': case '-h': args.help = true; break;
    }
  }
  return args;
}

function showHelp(): void {
  console.log(`FRANKENBEAST Build Runner
Usage: npx tsx plan-approach-c/build-runner.ts [options]
Options:
  --base-branch <name>  Base branch (REQUIRED)    --plan-dir <dir>  Chunk dir (default: script dir)
  --budget <usd>        Budget in USD (default: 10)  --mode <mode>  chunks|design-doc|interview
  --design-doc <file>   Design doc file (required for design-doc mode)
  --provider <name>     claude|codex (default: claude)
  --no-pr  Skip PR    --reset  Clear checkpoint    --verbose  Debug logs + trace viewer
  -h, --help  Show help`);
}

// ── Passthrough Stubs ──
const stubFirewall: IFirewallModule = { runPipeline: async (input) => ({ sanitizedText: input, violations: [], blocked: false }) };
const stubMemory: IMemoryModule = { frontload: async () => {}, getContext: async () => ({ adrs: [], knownErrors: [], rules: [] }), recordTrace: async () => {} };
const stubPlanner: IPlannerModule = { createPlan: async () => { throw new Error('Planner not available in CLI mode; use graphBuilder'); } };
const stubCritique: ICritiqueModule = { reviewPlan: async () => ({ verdict: 'pass', findings: [], score: 1.0 }) };
const stubGovernor: IGovernorModule = { requestApproval: async () => ({ decision: 'approved' }) };
const stubHeartbeat: IHeartbeatModule = { pulse: async () => ({ improvements: [], techDebt: [], summary: '' }) };
const stubSkills: ISkillsModule = { hasSkill: () => false, getAvailableSkills: () => [], execute: async () => { throw new Error('No skills in CLI mode'); } };

// ── Summary Display ──
function displaySummary(result: BeastResult, budget: number): void {
  const A = ANSI;
  console.log(logHeader('BUILD SUMMARY'));
  console.log(`  ${A.dim}Duration:${A.reset}  ${(result.durationMs / 1000 / 60).toFixed(1)} min`);
  console.log(`  ${A.dim}Budget:${A.reset}    ${budgetBar(result.tokenSpend.estimatedCostUsd, budget)}`);
  console.log(`  ${A.dim}Status:${A.reset}    ${statusBadge(result.status === 'completed')}`);
  if (result.taskResults?.length) {
    console.log(`\n  ${A.dim}Chunks:${A.reset}`);
    for (const t of result.taskResults) console.log(`    ${statusBadge(t.status === 'success')} ${A.bold}${t.taskId}${A.reset}`);
  }
  const passed = result.taskResults?.filter(t => t.status === 'success').length ?? 0;
  const failed = result.taskResults?.filter(t => t.status !== 'success').length ?? 0;
  console.log(`\n  ${failed === 0 ? A.green : A.red}${A.bold}Result: ${passed} passed, ${failed} failed${A.reset}\n`);
}

// ── Main ──
async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (args.help) { showHelp(); process.exit(0); }
  if (!args.baseBranch) { console.error('Error: --base-branch is required'); process.exit(1); }
  if (args.mode === 'design-doc') {
    if (!args.designDoc) { console.error('Error: --design-doc <file> is required for design-doc mode'); process.exit(1); }
    if (!existsSync(args.designDoc)) { console.error(`Error: design doc file not found: ${args.designDoc}`); process.exit(1); }
  }
  if (args.mode === 'interview' && !args.baseBranch) { console.error('Error: --base-branch is required'); process.exit(1); }

  console.log(BANNER);
  const buildDir = resolve(args.planDir, '.build');
  const cpFile = resolve(buildDir, '.checkpoint'), dbFile = resolve(buildDir, 'build-traces.db');
  const logFile = resolve(buildDir, 'build.log');
  mkdirSync(buildDir, { recursive: true });

  if (args.reset) {
    for (const f of [cpFile, dbFile]) { try { if (existsSync(f)) unlinkSync(f); } catch {} }
    console.log('Reset: cleared checkpoint and traces DB');
  }

  const logger = new BeastLogger({ verbose: args.verbose, captureForFile: true });
  logger.info(`Budget: $${args.budget} | Provider: ${ANSI.bold}${args.provider}${ANSI.reset} | Mode: ${args.mode}`);

  // Observer
  const counter = new TokenCounter(), costCalc = new CostCalculator(DEFAULT_PRICING);
  const breaker = new CircuitBreaker({ limitUsd: args.budget });
  const loopDet = new LoopDetector({ windowSize: 3, repeatThreshold: 3 });
  const sqlite = new SQLiteAdapter(dbFile), trace = TraceContext.createTrace('FRANKENBEAST Build');
  const observer: IObserverModule = {
    startTrace: () => {},
    startSpan: (name) => { const s = TraceContext.startSpan(trace, { name }); return { end: () => TraceContext.endSpan(s, { status: 'completed' }, loopDet) }; },
    getTokenSpend: async () => {
      const entries = counter.allModels().map(m => { const t = counter.totalsFor(m); return { model: m, promptTokens: t.promptTokens, completionTokens: t.completionTokens }; });
      const g = counter.grandTotal();
      return { inputTokens: g.promptTokens, outputTokens: g.completionTokens, totalTokens: g.totalTokens, estimatedCostUsd: costCalc.totalCost(entries) };
    },
  };

  let server: TraceServer | null = null;
  if (args.verbose) { server = new TraceServer({ adapter: sqlite, port: 4040 }); await server.start(); logger.info(`Trace viewer: ${ANSI.cyan}${ANSI.bold}${server.url}${ANSI.reset}`); }

  // Real deps
  const repoRoot = resolve(args.planDir, '..');
  const checkpoint = new FileCheckpointStore(cpFile);
  const prCreator = args.noPr ? undefined : new PrCreator({ targetBranch: 'main', disabled: false, remote: 'origin' });
  const ralph = new RalphLoop();
  const gitIso = new GitBranchIsolator({ baseBranch: args.baseBranch, branchPrefix: 'feat/', autoCommit: true, workingDir: repoRoot });
  const cliExecutor = new CliSkillExecutor(ralph, gitIso, {
    trace, counter, costCalc, breaker, loopDetector: loopDet,
    startSpan: TraceContext.startSpan, endSpan: TraceContext.endSpan,
    recordTokenUsage: SpanLifecycle.recordTokenUsage, setMetadata: SpanLifecycle.setMetadata,
  } as never);

  const finalize = async () => { TraceContext.endTrace(trace); await sqlite.flush(trace); if (server) await server.stop(); sqlite.close(); for (const e of logger.getLogEntries()) appendFileSync(logFile, e + '\n'); };

  // SIGINT handler
  let stopping = false;
  process.on('SIGINT', async () => { if (stopping) process.exit(1); stopping = true; logger.warn('SIGINT received. Finishing current iteration then stopping...'); await finalize(); process.exit(0); });

  // Select graph builder based on mode
  let graphBuilder;
  let userInput: string;
  if (args.mode === 'interview') {
    const adapterLlm = new AdapterLlmClient(cliExecutor as never);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const stdinIO: InterviewIO = {
      ask: (question: string) => new Promise<string>((resolve) => rl.question(`${question}\n> `, resolve)),
      display: (message: string) => console.log(`\n${message}\n`),
    };
    const llmGraphBuilder = new LlmGraphBuilder(adapterLlm);
    graphBuilder = new InterviewLoop(adapterLlm, stdinIO, llmGraphBuilder);
    userInput = 'Interactive interview session';
  } else if (args.mode === 'design-doc') {
    const docContent = readFileSync(args.designDoc, 'utf-8');
    const adapterLlm = new AdapterLlmClient(cliExecutor as never);
    graphBuilder = new LlmGraphBuilder(adapterLlm);
    userInput = docContent;
  } else {
    graphBuilder = new ChunkFileGraphBuilder(args.planDir);
    userInput = `Process chunks in ${args.planDir}`;
  }

  const deps: BeastLoopDeps = {
    firewall: stubFirewall, skills: stubSkills, memory: stubMemory, planner: stubPlanner,
    observer, critique: stubCritique, governor: stubGovernor, heartbeat: stubHeartbeat,
    logger, clock: () => new Date(), graphBuilder,
    prCreator, cliExecutor, checkpoint,
  };

  const projectId = repoRoot.split('/').pop() ?? 'unknown';
  const result = await new BeastLoop(deps).run({ projectId, userInput });
  await finalize();
  displaySummary(result, args.budget);
  process.exit(result.status !== 'completed' ? 1 : 0);
}

main().catch(err => { console.error(`Fatal: ${err}`); process.exit(1); });
