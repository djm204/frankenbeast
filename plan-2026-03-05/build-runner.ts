#!/usr/bin/env npx tsx
/**
 * Frankenbeast RALPH Loop — Observer-Powered Build Runner
 *
 * Processes chunk files 01-12 via Ralph loops (same prompt repeated until
 * <promise>TAG</promise> detected). Uses @frankenbeast/observer for token
 * tracking, budget enforcement, loop detection, and trace persistence.
 */

import { spawn, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';

import {
  TraceContext,
  SpanLifecycle,
  TokenCounter,
  CostCalculator,
  CircuitBreaker,
  SQLiteAdapter,
  TraceServer,
  LoopDetector,
  DEFAULT_PRICING,
} from '../franken-observer/src/index.js';

// ── Types ──

interface CliArgs {
  reset: boolean;
  budget: number;
  port: number;
  noViewer: boolean;
  maxIterations: number;
  provider: 'claude' | 'codex';
  claudeCmd: string;
  codexCmd: string;
  codexArgs: string[];
  verbose: boolean;
  help: boolean;
  planDir: string;
  baseBranch: string;
}

interface RalphLoopResult {
  completed: boolean;
  iterations: number;
  output: string;
}

interface ChunkResult {
  chunkId: string;
  implResult: RalphLoopResult;
  hardenResult: RalphLoopResult;
  merged: boolean;
  tokens: { prompt: number; completion: number };
  cost: number;
  durationMs: number;
  rateLimitHits: number;
}

// ── Constants ──

const SELF_DIR = resolve(import.meta.dirname || __dirname, '.');

let PLAN_DIR = SELF_DIR;
let BUILD_DIR = resolve(PLAN_DIR, '.build');
let CHECKPOINT_FILE = resolve(BUILD_DIR, '.checkpoint');
let LOG_FILE = resolve(BUILD_DIR, 'build.log');
let DB_FILE = resolve(BUILD_DIR, 'build-traces.db');
let BASE_BRANCH = 'feat/close-execution-gap';
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6';
const DEFAULT_CODEX_MODEL = 'codex';
const ITERATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_CODEX_CMD = 'codex';
const DEFAULT_CODEX_ARGS: string[] = ['exec', '--full-auto', '--json', '--color', 'never'];

// ── CLI Arg Parsing ──

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    reset: false,
    budget: 10,
    port: 4040,
    noViewer: false,
    maxIterations: 10,
    provider: 'claude',
    claudeCmd: 'claude',
    codexCmd: DEFAULT_CODEX_CMD,
    codexArgs: [...DEFAULT_CODEX_ARGS],
    verbose: false,
    help: false,
    planDir: SELF_DIR,
    baseBranch: '',
  };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--plan-dir': args.planDir = resolve(argv[++i]); break;
      case '--base-branch': args.baseBranch = argv[++i]; break;
      case '--reset': args.reset = true; break;
      case '--budget': args.budget = parseFloat(argv[++i]); break;
      case '--port': args.port = parseInt(argv[++i], 10); break;
      case '--no-viewer': args.noViewer = true; break;
      case '--max-iterations': args.maxIterations = parseInt(argv[++i], 10); break;
      case '--provider': {
        const value = (argv[++i] ?? '').toLowerCase();
        if (value === 'claude' || value === 'codex') {
          args.provider = value;
        }
        break;
      }
      case '--claude-cmd': args.claudeCmd = argv[++i]; break;
      case '--codex-cmd': args.codexCmd = argv[++i]; break;
      case '--codex-args': {
        const raw = argv[++i] ?? '';
        args.codexArgs = raw.split(' ').filter(Boolean);
        break;
      }
      case '--verbose': args.verbose = true; break;
      case '--help': case '-h': args.help = true; break;
    }
  }
  return args;
}

function showHelp(): void {
  console.log(`
Frankenbeast RALPH Build Runner — Observer-Powered

Usage: npx tsx plan-2026-03-05/build-runner.ts [options]

Options:
  --reset              Clear checkpoint, traces DB, and start fresh
  --budget <usd>       Budget limit in USD (default: 10)
  --port <n>           Trace viewer port (default: 4040)
  --no-viewer          Skip starting the trace viewer server
  --max-iterations <n> Max iterations per Ralph loop (default: 10)
  --provider <name>    LLM provider: claude | codex (default: claude)
  --claude-cmd <cmd>   Claude CLI command (default: claude)
  --codex-cmd <cmd>    Codex CLI command (default: codex)
  --codex-args "<args>" Extra codex args (default: "exec --full-auto --json --color never")
  --plan-dir <dir>     Directory containing chunk .md files (default: script dir)
  --base-branch <name> Git base branch name (REQUIRED). Chunk branches derive as feat/<chunkId>
  --verbose            Show debug-level logs (per-iteration tokens, cost, git ops)
  -h, --help           Show this help message

The runner processes numbered chunk .md files from the plan directory using
Ralph loops: same prompt fed to 'claude --print' repeatedly until a
<promise>TAG</promise> is detected in stdout.

Each chunk gets two loops:
  1. Implementation: build the feature described in the chunk
  2. Hardening: review, test, fix issues

Observer tracks tokens, cost, and provides a live trace viewer at
http://localhost:<port> (default 4040).
`);
}

// ── Logging ──

let verboseMode = false;

function log(level: 'info' | 'debug' | 'warn' | 'error', msg: string): void {
  if (level === 'debug' && !verboseMode) return;

  const prefix = level === 'info' ? '[beast]' : `[beast:${level}]`;
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${timestamp}] ${prefix} ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

// ── Rate Limit Detection ──

const RATE_LIMIT_PATTERNS = /rate.?limit|429|too many requests|retry.?after|overloaded|capacity|temporarily unavailable|out of extra usage|usage limit|resets?\s+\d/i;

function isRateLimited(stderr: string, stdout: string, exitCode: number): boolean {
  if (exitCode !== 0 && RATE_LIMIT_PATTERNS.test(stderr)) return true;
  return RATE_LIMIT_PATTERNS.test(stderr) || RATE_LIMIT_PATTERNS.test(stdout);
}

function parseResetSeconds(stderr: string): number {
  // Look for "Retry-After: <N>" or "retry after <N> seconds"
  const retryAfterMatch = stderr.match(/retry.?after:?\s*(\d+)/i);
  if (retryAfterMatch) return parseInt(retryAfterMatch[1], 10);

  // Look for "try again in <N> minutes"
  const minutesMatch = stderr.match(/try again in (\d+) minute/i);
  if (minutesMatch) return parseInt(minutesMatch[1], 10) * 60;

  return 60; // default fallback
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── Checkpoint ──

function readCheckpoint(): Set<string> {
  if (!existsSync(CHECKPOINT_FILE)) return new Set();
  return new Set(
    readFileSync(CHECKPOINT_FILE, 'utf-8')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
  );
}

function writeCheckpoint(entry: string): void {
  appendFileSync(CHECKPOINT_FILE, entry + '\n');
  log('debug', `Checkpoint saved: ${entry}`);
}

function isChunkDone(checkpoint: Set<string>, chunkId: string): boolean {
  return checkpoint.has(`${chunkId}:merged`);
}

// ── Chunk Discovery ──

function discoverChunks(): string[] {
  const files = readdirSync(PLAN_DIR)
    .filter(f => f.endsWith('.md') && !f.startsWith('00_') && /^\d{2}/.test(f))
    .sort();
  return files;
}

// ── Git Operations ──

function git(cmd: string): string {
  log('debug', `git ${cmd}`);
  return execSync(`git ${cmd}`, { encoding: 'utf-8', cwd: PLAN_DIR + '/..' }).trim();
}

// ── Spawn Claude (stream-json for real-time visibility) ──

function spawnClaude(prompt: string, maxTurns: number, cmd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    // Strip CLAUDECODE env var to prevent nested-session detection
    const env = { ...process.env };
    delete env['CLAUDECODE'];

    const child = spawn(cmd, [
      '--print', '--dangerously-skip-permissions',
      '--output-format', 'stream-json',
      '--verbose',
      prompt,
      '--max-turns', String(maxTurns),
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: PLAN_DIR + '/..',
      env,
    });

    let fullText = '';  // accumulated text for promise detection
    let stderr = '';
    let lineBuffer = '';

    child.stdout.on('data', (chunk: Buffer) => {
      const raw = chunk.toString();
      lineBuffer += raw;

      // Process complete JSON lines
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';  // keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const event = JSON.parse(line);
          // Extract text content from assistant messages
          if (event.type === 'assistant' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'text' && block.text) {
                fullText += block.text;
                if (verboseMode) {
                  log('debug', `[claude] ${block.text.slice(0, 200)}${block.text.length > 200 ? '...' : ''}`);
                }
              }
              if (block.type === 'tool_use') {
                const name = block.name ?? 'tool';
                const inputPreview = JSON.stringify(block.input ?? {}).slice(0, 120);
                log('debug', `  → ${name}: ${inputPreview}`);
              }
            }
          }
          // Content block deltas (streaming text)
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            fullText += event.delta.text;
          }
          // Tool use events at top level
          if (event.type === 'tool_use') {
            const name = event.tool_use?.name ?? event.name ?? 'tool';
            const inputPreview = JSON.stringify(event.tool_use?.input ?? event.input ?? {}).slice(0, 120);
            log('debug', `  → ${name}: ${inputPreview}`);
          }
          // Result event
          if (event.type === 'result') {
            const resultText = event.result?.text ?? event.text ?? '';
            if (resultText) fullText += resultText;
            log('debug', `  ← result: ${resultText.slice(0, 200)}`);
          }
        } catch {
          // Not valid JSON — treat as plain text
          fullText += line + '\n';
          if (verboseMode) process.stdout.write(line + '\n');
        }
      }

      try { appendFileSync(LOG_FILE, raw); } catch {}
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      if (verboseMode) process.stderr.write(text);
    });

    // Timeout
    const timer = setTimeout(() => {
      log('warn', `Iteration timed out after ${ITERATION_TIMEOUT_MS / 1000}s. Killing...`);
      child.kill('SIGTERM');
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 5000);
    }, ITERATION_TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timer);
      // Process any remaining buffer
      if (lineBuffer.trim()) {
        try {
          const event = JSON.parse(lineBuffer);
          if (event.type === 'result' && (event.result?.text ?? event.text)) {
            fullText += event.result?.text ?? event.text;
          }
        } catch {
          fullText += lineBuffer;
        }
      }
      // Always log stderr on failure for debugging
      if (code !== 0 && stderr.trim()) {
        log('error', `Claude stderr: ${stderr.trim().slice(0, 500)}`);
      }
      resolve({ stdout: fullText, stderr, exitCode: code ?? 1 });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function spawnCodexOnce(
  prompt: string,
  cmd: string,
  args: string[],
  usePty: boolean,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const shellQuote = (value: string): string => {
      if (value.length === 0) return "''";
      return `'${value.replace(/'/g, `'\"'\"'`)}'`;
    };

    const spawnCmd = usePty ? 'script' : cmd;
    const spawnArgs = usePty
      ? ['-q', '-e', '-c', [cmd, ...args, prompt].map(shellQuote).join(' '), '/dev/null']
      : [...args, prompt];
    const env = {
      ...process.env,
      TERM: process.env.TERM ?? 'dumb',
      CI: process.env.CI ?? '1',
      COLUMNS: process.env.COLUMNS ?? '120',
      LINES: process.env.LINES ?? '40',
    };

    const child = spawn(spawnCmd, spawnArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: PLAN_DIR + '/..',
      env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      if (verboseMode) process.stdout.write(text);
      try { appendFileSync(LOG_FILE, text); } catch {}
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      if (verboseMode) process.stderr.write(text);
    });

    const timer = setTimeout(() => {
      log('warn', `Iteration timed out after ${ITERATION_TIMEOUT_MS / 1000}s. Killing...`);
      child.kill('SIGTERM');
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 5000);
    }, ITERATION_TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && stderr.trim()) {
        log('error', `Codex stderr: ${stderr.trim().slice(0, 500)}`);
      }
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function spawnCodex(
  prompt: string,
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const first = await spawnCodexOnce(prompt, cmd, args, false);
  if (/stdin is not a terminal/i.test(first.stderr)) {
    log('warn', 'Codex requires a TTY; retrying with PTY wrapper.');
    return spawnCodexOnce(prompt, cmd, args, true);
  }
  return first;
}

function hasMeaningfulChange(previousHead: string): boolean {
  const status = git('status --porcelain');
  if (status.length > 0) return true;
  const head = git('rev-parse HEAD');
  return head !== previousHead;
}

function autoCommitIfDirty(chunkId: string, stage: string, iteration: number): boolean {
  const status = git('status --porcelain');
  if (status.length === 0) return false;
  try {
    git('add -A');
    git(`commit -m "auto: ${stage} ${chunkId} iter ${iteration}"`);
    log('info', `Auto-committed dirty files for ${stage}:${chunkId} iter ${iteration}`);
    return true;
  } catch (err) {
    log('warn', `Auto-commit failed: ${err}`);
    return false;
  }
}

// ── Ralph Loop ──

async function runRalphLoop(
  prompt: string,
  promiseTag: string,
  maxIterations: number,
  maxTurns: number,
  trace: ReturnType<typeof TraceContext.createTrace>,
  parentSpan: ReturnType<typeof TraceContext.startSpan>,
  stage: string,
  chunkId: string,
  provider: 'claude' | 'codex',
  claudeCmd: string,
  codexCmd: string,
  codexArgs: string[],
  counter: TokenCounter,
  costCalc: CostCalculator,
  breaker: CircuitBreaker,
  loopDetector: LoopDetector,
): Promise<RalphLoopResult & { rateLimitHits: number }> {
  let iteration = 0;
  let lastOutput = '';
  let rateLimitHits = 0;
  let budgetExceeded = false;
  const availableProviders: Array<'claude' | 'codex'> = ['claude', 'codex'];
  const rateLimitedProviders = new Set<'claude' | 'codex'>();
  let activeProvider: 'claude' | 'codex' = provider;

  breaker.on('limit-reached', () => { budgetExceeded = true; });

  while (iteration < maxIterations) {
    if (budgetExceeded) {
      log('error', 'Budget exceeded! Stopping build gracefully.');
      break;
    }

    iteration++;

    // Pre-check budget before spawning provider
    {
      const preEntries = counter.allModels().map(m => {
        const t = counter.totalsFor(m);
        return { model: m, promptTokens: t.promptTokens, completionTokens: t.completionTokens };
      });
      const preCost = costCalc.totalCost(preEntries);
      const preCheck = breaker.check(preCost);
      if (preCheck.tripped) {
        log('error', `Budget exceeded before iteration ($${preCost.toFixed(2)} / $${preCheck.limitUsd})! Stopping.`);
        break;
      }
    }

    const spanName = `${stage}:${chunkId}:iter-${iteration}`;
    log('info', `${stage}:${chunkId} iter ${iteration}/${maxIterations} starting... (${activeProvider})`);

    const iterSpan = TraceContext.startSpan(trace, { name: spanName, parentSpanId: parentSpan.id });
    const startTime = Date.now();

    let result: { stdout: string; stderr: string; exitCode: number };
    const headBefore = git('rev-parse HEAD');

    try {
      if (activeProvider === 'claude') {
        result = await spawnClaude(prompt, maxTurns, claudeCmd);
      } else {
        result = await spawnCodex(prompt, codexCmd, codexArgs);
      }
    } catch (err) {
      log('error', `Provider process error: ${err}`);
      SpanLifecycle.setMetadata(iterSpan, { error: String(err) });
      TraceContext.endSpan(iterSpan, { status: 'error', errorMessage: String(err) }, loopDetector);
      continue;
    }

    const durationS = ((Date.now() - startTime) / 1000).toFixed(1);
    lastOutput = result.stdout;

    // Auto-commit dirty files (codex doesn't commit on its own)
    if (activeProvider === 'codex' && result.exitCode === 0) {
      autoCommitIfDirty(chunkId, stage, iteration);
    }

    // Estimate tokens — codex --json output inflates estimates (~75% metadata)
    const tokenDivisor = activeProvider === 'codex' ? 16 : 4;
    const estCompletionTokens = Math.ceil(result.stdout.length / tokenDivisor);
    const estPromptTokens = Math.ceil(prompt.length / 4);
    const modelName = activeProvider === 'claude' ? DEFAULT_CLAUDE_MODEL : DEFAULT_CODEX_MODEL;
    SpanLifecycle.recordTokenUsage(iterSpan, {
      promptTokens: estPromptTokens,
      completionTokens: estCompletionTokens,
      model: modelName,
    }, counter);

    // Cost check
    const totals = counter.grandTotal();
    const costEntries = counter.allModels().map(m => {
      const t = counter.totalsFor(m);
      return { model: m, promptTokens: t.promptTokens, completionTokens: t.completionTokens };
    });
    const runningCost = costCalc.totalCost(costEntries);

    log('debug', `${stage}:${chunkId} iter ${iteration}/${maxIterations} — exit code ${result.exitCode}, duration: ${durationS}s`);
    log('debug', `tokens this iter: ~${estPromptTokens} prompt, ~${estCompletionTokens} completion`);
    log('debug', `running cost: $${runningCost.toFixed(2)} / $${breaker.check(0).limitUsd}`);

    // Check for promise
    const promiseRegex = new RegExp(`<promise>${promiseTag}</promise>`);
    if (promiseRegex.test(result.stdout)) {
      if (!hasMeaningfulChange(headBefore)) {
        log('error', `${stage}:${chunkId} iter ${iteration}/${maxIterations} — promise detected but no code changes; stopping.`);
        SpanLifecycle.setMetadata(iterSpan, { noChanges: true });
        TraceContext.endSpan(iterSpan, { status: 'error', errorMessage: 'promise-without-changes' }, loopDetector);
        return { completed: false, iterations: iteration, output: lastOutput, rateLimitHits };
      }

      log('info', `${stage}:${chunkId} iter ${iteration}/${maxIterations} — promise detected!`);
      TraceContext.endSpan(iterSpan, { status: 'completed' }, loopDetector);
      return { completed: true, iterations: iteration, output: lastOutput, rateLimitHits };
    }

    // Check for rate limit
    if (isRateLimited(result.stderr, result.stdout, result.exitCode)) {
      rateLimitHits++;
      const resetSeconds = parseResetSeconds(result.stderr);
      const sleepMs = (resetSeconds + 180) * 1000;
      const resumeAt = new Date(Date.now() + sleepMs).toISOString();

      log('warn', `Rate limited. Reset in ${resetSeconds}s. Sleeping until ${resumeAt} (reset + 3min buffer)...`);

      // Record rate limit span
      SpanLifecycle.setMetadata(iterSpan, {
        rateLimit: true,
        resetAfterMs: resetSeconds * 1000,
        sleepUntil: resumeAt,
        chunkId,
        provider: activeProvider,
      });
      TraceContext.endSpan(iterSpan, { status: 'completed' }, loopDetector);

      rateLimitedProviders.add(activeProvider);
      const otherProvider = activeProvider === 'claude' ? 'codex' : 'claude';
      const canSwitch = availableProviders.includes(otherProvider);

      if (canSwitch && !rateLimitedProviders.has(otherProvider)) {
        log('warn', `Switching provider to ${otherProvider} after rate limit.`);
        activeProvider = otherProvider;
        iteration--; // Don't count rate-limited iterations
        continue;
      }

      await sleep(sleepMs);
      log('info', 'Rate limit cooldown complete. Resuming...');
      rateLimitedProviders.clear();
      activeProvider = provider;
      iteration--; // Don't count rate-limited iterations
      continue;
    }

    // Hard stop on non-zero exit (after rate limit handling)
    if (result.exitCode !== 0) {
      const errLabel = result.exitCode === 1 ? 'catastrophic' : 'non-zero';
      log('error', `${stage}:${chunkId} iter ${iteration}/${maxIterations} — ${errLabel} exit ${result.exitCode}, stopping.`);
      SpanLifecycle.setMetadata(iterSpan, { exitCode: result.exitCode, fatal: true });
      TraceContext.endSpan(iterSpan, { status: 'error', errorMessage: `exit ${result.exitCode}` }, loopDetector);
      return { completed: false, iterations: iteration, output: lastOutput, rateLimitHits };
    }

    // No promise, no rate limit
    TraceContext.endSpan(iterSpan, { status: 'completed' }, loopDetector);

    if (!hasMeaningfulChange(headBefore)) {
      log('error', `${stage}:${chunkId} iter ${iteration}/${maxIterations} — no code changes detected; stopping.`);
      return { completed: false, iterations: iteration, output: lastOutput, rateLimitHits };
    }

    log('info', `${stage}:${chunkId} iter ${iteration}/${maxIterations} — no promise yet, iterating...`);

    // Budget check
    const budgetResult = breaker.check(runningCost);
    if (budgetResult.tripped) {
      log('error', `Budget exceeded ($${runningCost.toFixed(2)} / $${budgetResult.limitUsd})! Stopping.`);
      break;
    }

    // Budget warnings
    const pct = runningCost / budgetResult.limitUsd;
    if (pct >= 0.9) log('warn', `Budget 90% consumed ($${runningCost.toFixed(2)} / $${budgetResult.limitUsd})`);
    else if (pct >= 0.75) log('warn', `Budget 75% consumed ($${runningCost.toFixed(2)} / $${budgetResult.limitUsd})`);
    else if (pct >= 0.5) log('warn', `Budget 50% consumed ($${runningCost.toFixed(2)} / $${budgetResult.limitUsd})`);
  }

  if (iteration >= maxIterations) {
    log('error', `Max iterations (${maxIterations}) reached without promise for ${stage}:${chunkId}`);
  }
  return { completed: false, iterations: iteration, output: lastOutput, rateLimitHits };
}

// ── Main ──

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  verboseMode = args.verbose;

  // Validate required args
  if (!args.baseBranch) {
    console.error('Error: --base-branch is required (e.g. --base-branch feat/beast-runner)');
    process.exit(1);
  }

  // Apply --plan-dir and --base-branch overrides
  PLAN_DIR = args.planDir;
  BUILD_DIR = resolve(PLAN_DIR, '.build');
  CHECKPOINT_FILE = resolve(BUILD_DIR, '.checkpoint');
  LOG_FILE = resolve(BUILD_DIR, 'build.log');
  DB_FILE = resolve(BUILD_DIR, 'build-traces.db');
  BASE_BRANCH = args.baseBranch;

  // Ensure build artifact directory exists (gitignored to prevent codex from reading logs)
  mkdirSync(BUILD_DIR, { recursive: true });

  // Reset
  if (args.reset) {
    for (const f of [CHECKPOINT_FILE, DB_FILE]) {
      try { execSync(`rm -f ${f}`); } catch {}
    }
    try { writeFileSync(LOG_FILE, ''); } catch {}
    log('info', 'Reset: cleared checkpoint, traces DB, and log');
  }

  log('info', 'RALPH Build Runner starting...');
  log('info', `Budget: $${args.budget} | Max iterations: ${args.maxIterations} | Provider: ${args.provider} | Verbose: ${args.verbose}`);
  log('debug', `Plan dir: ${PLAN_DIR}`);
  log('info', 'Note: token counts are estimated (~4 chars/token), not exact');

  // Observer setup
  const counter = new TokenCounter();
  const costCalc = new CostCalculator(DEFAULT_PRICING);
  const breaker = new CircuitBreaker({ limitUsd: args.budget });
  const loopDetector = new LoopDetector({ windowSize: 3, repeatThreshold: 3 });
  const sqliteAdapter = new SQLiteAdapter(DB_FILE);
  const trace = TraceContext.createTrace('RALPH Build: close-execution-gap');

  // Trace server
  let server: TraceServer | null = null;
  if (!args.noViewer) {
    server = new TraceServer({ adapter: sqliteAdapter, port: args.port });
    await server.start();
    log('info', `Trace viewer: ${server.url}`);
  }

  // SIGINT handler
  let stopping = false;
  process.on('SIGINT', async () => {
    if (stopping) process.exit(1);
    stopping = true;
    log('warn', 'SIGINT received. Finishing current iteration then stopping...');
    TraceContext.endTrace(trace);
    await sqliteAdapter.flush(trace);
    if (server) await server.stop();
    sqliteAdapter.close();
    process.exit(0);
  });

  // Discover chunks
  const chunkFiles = discoverChunks();
  log('info', `Found ${chunkFiles.length} chunks: ${chunkFiles.map(f => f.replace('.md', '')).join(', ')}`);

  // Checkpoint
  const checkpoint = readCheckpoint();
  const results: ChunkResult[] = [];
  const buildStart = Date.now();
  let totalRateLimitHits = 0;

  // Process each chunk
  for (const chunkFile of chunkFiles) {
    if (stopping) break;

    const chunkId = chunkFile.replace('.md', '');
    const chunkPath = resolve(PLAN_DIR, chunkFile);

    if (isChunkDone(checkpoint, chunkId)) {
      log('info', `Skipping ${chunkId} (already merged)`);
      continue;
    }

    log('info', `\n${'='.repeat(60)}`);
    log('info', `Processing chunk: ${chunkId}`);
    log('info', `${'='.repeat(60)}`);

    const chunkStart = Date.now();
    const chunkSpan = TraceContext.startSpan(trace, { name: `chunk:${chunkId}` });
    const branch = `feat/${chunkId}`;
    const baseHead = git(`rev-parse ${BASE_BRANCH}`);
    let chunkRateLimitHits = 0;

    // Snapshot token state for per-chunk cost tracking
    const preChunkTokens = counter.grandTotal();
    const preChunkCost = (() => {
      const entries = counter.allModels().map(m => {
        const t = counter.totalsFor(m);
        return { model: m, promptTokens: t.promptTokens, completionTokens: t.completionTokens };
      });
      return costCalc.totalCost(entries);
    })();

    // Git: create branch
    try {
      git(`checkout ${BASE_BRANCH}`);
      try { git(`checkout -b ${branch}`); } catch { git(`checkout ${branch}`); }
    } catch (err) {
      log('error', `Git error for ${chunkId}: ${err}`);
      TraceContext.endSpan(chunkSpan, { status: 'error', errorMessage: String(err) });
      continue;
    }

    // Implementation loop
    let implResult: RalphLoopResult & { rateLimitHits: number } = { completed: false, iterations: 0, output: '', rateLimitHits: 0 };
    if (!checkpoint.has(`${chunkId}:impl_done`)) {
      log('info', `${chunkId}: starting impl loop (max ${args.maxIterations} iters)`);
      const implPrompt = `Read ${chunkPath}. Implement ALL features described. Use TDD: write failing tests first, then implement, then commit atomically. Run the verification command. Output <promise>IMPL_${chunkId}_DONE</promise> when all success criteria are met and verification passes.`;

      implResult = await runRalphLoop(
        implPrompt, `IMPL_${chunkId}_DONE`, args.maxIterations, 30,
        trace, chunkSpan, 'impl', chunkId,
        args.provider, args.claudeCmd, args.codexCmd, args.codexArgs,
        counter, costCalc, breaker, loopDetector,
      );
      chunkRateLimitHits += implResult.rateLimitHits;

      if (implResult.completed) {
        const implCommits = parseInt(git(`rev-list --count ${BASE_BRANCH}..HEAD`), 10) || 0;
        if (implCommits === 0) {
          log('error', `${chunkId}: impl "completed" but 0 commits on branch; not checkpointing`);
          stopping = true;
          break;
        }
        writeCheckpoint(`${chunkId}:impl_done`);
        log('info', `${chunkId}: impl PASSED in ${implResult.iterations} iterations (${implCommits} commits)`);
      } else {
        log('error', `${chunkId}: impl FAILED after ${implResult.iterations} iterations`);
        stopping = true;
        break;
      }
    } else {
      log('info', `${chunkId}: impl already done (checkpoint), skipping`);
      implResult = { completed: true, iterations: 0, output: '', rateLimitHits: 0 };
    }

    if (stopping) {
      TraceContext.endSpan(chunkSpan, { status: 'error', errorMessage: 'impl failed' });
      await sqliteAdapter.flush(trace);
      break;
    }

    // Hardening loop
    let hardenResult: RalphLoopResult & { rateLimitHits: number } = { completed: false, iterations: 0, output: '', rateLimitHits: 0 };
    if (implResult.completed && !checkpoint.has(`${chunkId}:harden_done`)) {
      log('info', `${chunkId}: starting harden loop (max ${args.maxIterations} iters)`);
      const hardenPrompt = `Review work on branch '${branch}' for chunk '${chunkPath}'. Read the chunk file first. Check ALL success criteria checkboxes and hardening requirements. Fix any issues found. Add missing tests. Commit fixes. Run the full test suite: cd franken-orchestrator && npx vitest run && npx tsc --noEmit. Output <promise>HARDEN_${chunkId}_DONE</promise> when everything is stable and all criteria are met.`;

      hardenResult = await runRalphLoop(
        hardenPrompt, `HARDEN_${chunkId}_DONE`, args.maxIterations, 10,
        trace, chunkSpan, 'harden', chunkId,
        args.provider, args.claudeCmd, args.codexCmd, args.codexArgs,
        counter, costCalc, breaker, loopDetector,
      );
      chunkRateLimitHits += hardenResult.rateLimitHits;

      if (hardenResult.completed) {
        const hardenCommits = parseInt(git(`rev-list --count ${BASE_BRANCH}..HEAD`), 10) || 0;
        if (hardenCommits === 0) {
          log('error', `${chunkId}: harden "completed" but 0 commits on branch; not checkpointing`);
          stopping = true;
          break;
        }
        writeCheckpoint(`${chunkId}:harden_done`);
        log('info', `${chunkId}: harden PASSED in ${hardenResult.iterations} iterations`);
      } else {
        log('warn', `${chunkId}: harden didn't complete promise; not marking harden_done`);
        stopping = true;
        break;
      }
    } else if (checkpoint.has(`${chunkId}:harden_done`)) {
      log('info', `${chunkId}: harden already done (checkpoint), skipping`);
      hardenResult = { completed: true, iterations: 0, output: '', rateLimitHits: 0 };
    }

    if (stopping) {
      TraceContext.endSpan(chunkSpan, { status: 'error', errorMessage: 'harden failed' });
      await sqliteAdapter.flush(trace);
      break;
    }

    // Merge back
    let merged = false;
    const branchDelta = parseInt(git(`rev-list --count ${BASE_BRANCH}..${branch}`), 10) || 0;
    const hasBranchChanges = branchDelta > 0;
    if (!checkpoint.has(`${chunkId}:merged`) && implResult.completed && hardenResult.completed && hasBranchChanges) {
      try {
        git(`checkout ${BASE_BRANCH}`);
        git(`merge ${branch} --no-edit`);
        writeCheckpoint(`${chunkId}:merged`);
        merged = true;
        log('info', `${chunkId}: merged to ${BASE_BRANCH}`);
      } catch (err) {
        log('error', `${chunkId}: merge conflict — ${err}`);
        try { git('merge --abort'); } catch {}
        log('warn', `${chunkId}: merge aborted, continuing to next chunk`);
      }
    } else if (checkpoint.has(`${chunkId}:merged`)) {
      merged = true;
    } else if (!hasBranchChanges) {
      log('warn', `${chunkId}: no commits on ${branch} vs ${BASE_BRANCH}; skipping merge + checkpoint`);
    } else if (!implResult.completed) {
      log('warn', `${chunkId}: impl not completed; skipping merge + checkpoint`);
    } else if (!hardenResult.completed) {
      log('warn', `${chunkId}: harden not completed; skipping merge + checkpoint`);
    }

    // Finalize chunk span — compute per-chunk costs by diffing snapshots
    const chunkDurationMs = Date.now() - chunkStart;
    const postChunkTokens = counter.grandTotal();
    const postChunkCostEntries = counter.allModels().map(m => {
      const t = counter.totalsFor(m);
      return { model: m, promptTokens: t.promptTokens, completionTokens: t.completionTokens };
    });
    const postChunkCost = costCalc.totalCost(postChunkCostEntries);
    const chunkTokens = {
      promptTokens: postChunkTokens.promptTokens - preChunkTokens.promptTokens,
      completionTokens: postChunkTokens.completionTokens - preChunkTokens.completionTokens,
      totalTokens: postChunkTokens.totalTokens - preChunkTokens.totalTokens,
    };
    const chunkCost = postChunkCost - preChunkCost;

    SpanLifecycle.setMetadata(chunkSpan, {
      implIterations: implResult.iterations,
      hardenIterations: hardenResult.iterations,
      implCompleted: implResult.completed,
      hardenCompleted: hardenResult.completed,
      merged,
      rateLimitHits: chunkRateLimitHits,
    });
    TraceContext.endSpan(chunkSpan, { status: merged ? 'completed' : 'error' });

    // Flush to SQLite
    await sqliteAdapter.flush(trace);

    const totalIters = implResult.iterations + hardenResult.iterations;
    const durationStr = (chunkDurationMs / 1000).toFixed(0);
    const status = merged ? 'PASS' : 'FAIL';
    totalRateLimitHits += chunkRateLimitHits;

    log('info', `${chunkId}: ${status} — ${totalIters} iters, ~${chunkTokens.totalTokens} tokens, $${chunkCost.toFixed(2)}, ${durationStr}s`);

    results.push({
      chunkId,
      implResult,
      hardenResult,
      merged,
      tokens: { prompt: chunkTokens.promptTokens, completion: chunkTokens.completionTokens },
      cost: chunkCost,
      durationMs: chunkDurationMs,
      rateLimitHits: chunkRateLimitHits,
    });
  }

  // ── Final Summary ──
  TraceContext.endTrace(trace);
  await sqliteAdapter.flush(trace);

  const totalDurationMs = Date.now() - buildStart;
  const grandTotals = counter.grandTotal();
  const finalCostEntries = counter.allModels().map(m => {
    const t = counter.totalsFor(m);
    return { model: m, promptTokens: t.promptTokens, completionTokens: t.completionTokens };
  });
  const totalCost = costCalc.totalCost(finalCostEntries);

  log('info', '\n' + '='.repeat(60));
  log('info', 'BUILD SUMMARY');
  log('info', '='.repeat(60));
  log('info', '');
  log('info', `Duration: ${(totalDurationMs / 1000 / 60).toFixed(1)} minutes`);
  log('info', `Total tokens: ~${grandTotals.totalTokens} (prompt: ~${grandTotals.promptTokens}, completion: ~${grandTotals.completionTokens})`);
  log('info', `Total cost: $${totalCost.toFixed(2)} / $${args.budget}`);
  log('info', `Rate limit hits: ${totalRateLimitHits}`);
  log('info', '');

  // Per-model breakdown
  for (const model of counter.allModels()) {
    const t = counter.totalsFor(model);
    const c = costCalc.totalCost([{ model, promptTokens: t.promptTokens, completionTokens: t.completionTokens }]);
    log('info', `  ${model}: ~${t.totalTokens} tokens, $${c.toFixed(2)}`);
  }

  log('info', '');
  log('info', 'Per-chunk results:');
  for (const r of results) {
    const status = r.merged ? 'PASS' : 'FAIL';
    const iters = r.implResult.iterations + r.hardenResult.iterations;
    log('info', `  ${r.chunkId}: ${status} | ${iters} iters | $${r.cost.toFixed(2)} | ${(r.durationMs / 1000).toFixed(0)}s`);
  }

  log('info', '');
  const passed = results.filter(r => r.merged).length;
  const failed = results.filter(r => !r.merged).length;
  log('info', `Result: ${passed} passed, ${failed} failed out of ${results.length} chunks`);

  // Cleanup
  if (server) await server.stop();
  sqliteAdapter.close();

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  log('error', `Fatal: ${err}`);
  process.exit(1);
});
