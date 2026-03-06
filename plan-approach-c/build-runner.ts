#!/usr/bin/env npx tsx
/**
 * Approach C Build Runner — RALPH Loop Autonomous Execution
 *
 * Processes chunk files via Ralph loops (same prompt repeated until
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
  noPr: boolean;
  prBase: string;
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

let PLAN_DIR = resolve(import.meta.dirname || __dirname, '.');
let BUILD_DIR = resolve(PLAN_DIR, '.build');
let CHECKPOINT_FILE = resolve(BUILD_DIR, '.checkpoint');
let LOG_FILE = resolve(BUILD_DIR, 'build.log');
let DB_FILE = resolve(BUILD_DIR, 'build-traces.db');
let BASE_BRANCH = 'feat/approach-c-pipeline';
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6';
const DEFAULT_CODEX_MODEL = 'codex';
const ITERATION_TIMEOUT_MS = 15 * 60 * 1000;
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
    planDir: PLAN_DIR,
    baseBranch: '',
    noPr: false,
    prBase: 'main',
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
      case '--no-pr': args.noPr = true; break;
      case '--pr-base': args.prBase = argv[++i]; break;
      case '--help': case '-h': args.help = true; break;
    }
  }
  return args;
}

function showHelp(): void {
  console.log(`
Approach C Build Runner — Observer-Powered RALPH Loop

Usage: npx tsx plan-approach-c/build-runner.ts [options]

Options:
  --plan-dir <dir>     Directory containing chunk .md files (default: script dir)
  --base-branch <name> Git base branch name (REQUIRED)
  --reset              Clear checkpoint, traces DB, and start fresh
  --budget <usd>       Budget limit in USD (default: 10)
  --port <n>           Trace viewer port (default: 4040)
  --no-viewer          Skip starting the trace viewer server
  --max-iterations <n> Max iterations per Ralph loop (default: 10)
  --provider <name>    LLM provider: claude | codex (default: claude)
  --claude-cmd <cmd>   Claude CLI command (default: claude)
  --codex-cmd <cmd>    Codex CLI command (default: codex)
  --codex-args "<args>" Extra codex args (default: "exec --full-auto --json --color never")
  --no-pr              Skip PR creation after build
  --pr-base <branch>   PR target branch (default: main)
  --verbose            Show debug-level logs
  -h, --help           Show this help message
`);
}

// ── ANSI Helpers ──

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
} as const;

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// ── Logging ──

let verboseMode = false;
type LogLevel = 'info' | 'debug' | 'warn' | 'error';

function log(level: LogLevel, msg: string): void {
  if (level === 'debug' && !verboseMode) return;
  const now = new Date();
  const ts = `${ANSI.gray}${now.toTimeString().slice(0, 8)}${ANSI.reset}`;
  const badge: Record<LogLevel, string> = {
    debug: `${ANSI.gray}DEBUG${ANSI.reset}`,
    info:  `${ANSI.cyan}${ANSI.bold} INFO${ANSI.reset}`,
    warn:  `${ANSI.yellow}${ANSI.bold} WARN${ANSI.reset}`,
    error: `${ANSI.red}${ANSI.bold}ERROR${ANSI.reset}`,
  };
  let colored = msg;
  if (level === 'debug') colored = `${ANSI.gray}${msg}${ANSI.reset}`;
  else if (level === 'warn') colored = `${ANSI.yellow}${msg}${ANSI.reset}`;
  else if (level === 'error') colored = `${ANSI.red}${msg}${ANSI.reset}`;
  console.log(`${ts} ${badge[level]} ${colored}`);
  const plain = `[${now.toISOString().replace('T', ' ').slice(0, 19)}] [${level.toUpperCase().padStart(5)}] ${msg}`;
  try { appendFileSync(LOG_FILE, plain + '\n'); } catch {}
}

function logHeader(title: string): void {
  const w = 60;
  const pad = Math.max(0, w - title.length - 4);
  const left = Math.floor(pad / 2);
  const right = pad - left;
  const line = `${ANSI.cyan}${'─'.repeat(w)}${ANSI.reset}`;
  const mid = `${ANSI.cyan}│${ANSI.reset} ${' '.repeat(left)}${ANSI.bold}${ANSI.white}${title}${ANSI.reset}${' '.repeat(right)} ${ANSI.cyan}│${ANSI.reset}`;
  console.log(`\n${line}\n${mid}\n${line}`);
  try { appendFileSync(LOG_FILE, `\n${'─'.repeat(w)}\n│ ${' '.repeat(left)}${title}${' '.repeat(right)} │\n${'─'.repeat(w)}\n`); } catch {}
}

function budgetBar(spent: number, limit: number): string {
  const pct = Math.min(spent / limit, 1);
  const width = 20;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  let barColor = ANSI.green;
  if (pct >= 0.75) barColor = ANSI.yellow;
  if (pct >= 0.9) barColor = ANSI.red;
  return `${barColor}[${'█'.repeat(filled)}${ANSI.gray}${'░'.repeat(empty)}${barColor}]${ANSI.reset} ${Math.round(pct * 100)}% ($${spent.toFixed(2)}/$${limit.toFixed(0)})`;
}

function statusBadge(pass: boolean): string {
  return pass
    ? `${ANSI.bgGreen}${ANSI.bold} PASS ${ANSI.reset}`
    : `${ANSI.bgRed}${ANSI.bold} FAIL ${ANSI.reset}`;
}

// ── Rate Limit Detection ──

const RATE_LIMIT_PATTERNS = /rate.?limit|429|too many requests|retry.?after|overloaded|capacity|temporarily unavailable|out of extra usage|usage limit|resets?\s+\d/i;

function isRateLimited(stderr: string, stdout: string, exitCode: number): boolean {
  if (exitCode !== 0 && RATE_LIMIT_PATTERNS.test(stderr)) return true;
  return RATE_LIMIT_PATTERNS.test(stderr) || RATE_LIMIT_PATTERNS.test(stdout);
}

function parseResetSeconds(stderr: string): number {
  const retryAfterMatch = stderr.match(/retry.?after:?\s*(\d+)/i);
  if (retryAfterMatch) return parseInt(retryAfterMatch[1], 10);
  const minutesMatch = stderr.match(/try again in (\d+) minute/i);
  if (minutesMatch) return parseInt(minutesMatch[1], 10) * 60;
  return 60;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── Checkpoint ──

function readCheckpoint(): Set<string> {
  if (!existsSync(CHECKPOINT_FILE)) return new Set();
  return new Set(
    readFileSync(CHECKPOINT_FILE, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean)
  );
}

function writeCheckpoint(entry: string): void {
  appendFileSync(CHECKPOINT_FILE, entry + '\n');
  log('debug', `Checkpoint saved: ${entry}`);
}

function recordCommitCheckpoint(chunkId: string, stage: string, iteration: number, commitHash: string): void {
  writeCheckpoint(`${chunkId}:${stage}:iter_${iteration}:commit_${commitHash}`);
}

function isChunkDone(checkpoint: Set<string>, chunkId: string): boolean {
  return checkpoint.has(`${chunkId}:merged`);
}

// ── Chunk Discovery ──

function discoverChunks(): string[] {
  return readdirSync(PLAN_DIR)
    .filter(f => f.endsWith('.md') && !f.startsWith('00_') && /^\d{2}/.test(f))
    .sort();
}

// ── Git Operations ──

function git(cmd: string): string {
  log('debug', `git ${cmd}`);
  return execSync(`git ${cmd}`, { encoding: 'utf-8', cwd: PLAN_DIR + '/..' }).trim();
}

// ── Spawn Claude ──

function spawnClaude(prompt: string, maxTurns: number, cmd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
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

    let fullText = '';
    let stderr = '';
    let lineBuffer = '';

    child.stdout.on('data', (chunk: Buffer) => {
      const raw = chunk.toString();
      lineBuffer += raw;
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === 'assistant' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'text' && block.text) {
                fullText += block.text;
                if (verboseMode) log('debug', `[claude] ${block.text.slice(0, 200)}${block.text.length > 200 ? '...' : ''}`);
              }
              if (block.type === 'tool_use') {
                log('debug', `  → ${block.name ?? 'tool'}: ${JSON.stringify(block.input ?? {}).slice(0, 120)}`);
              }
            }
          }
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            fullText += event.delta.text;
          }
          if (event.type === 'result') {
            const resultText = event.result?.text ?? event.text ?? '';
            if (resultText) fullText += resultText;
            log('debug', `  ← result: ${resultText.slice(0, 200)}`);
          }
        } catch {
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

    const timer = setTimeout(() => {
      log('warn', `Iteration timed out after ${ITERATION_TIMEOUT_MS / 1000}s. Killing...`);
      child.kill('SIGTERM');
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 5000);
    }, ITERATION_TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timer);
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

// ── Spawn Codex ──

function spawnCodexOnce(
  prompt: string, cmd: string, args: string[], usePty: boolean,
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
    const child = spawn(spawnCmd, spawnArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: PLAN_DIR + '/..',
      env: { ...process.env, TERM: process.env.TERM ?? 'dumb', CI: process.env.CI ?? '1', COLUMNS: process.env.COLUMNS ?? '120', LINES: process.env.LINES ?? '40' },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { const t = chunk.toString(); stdout += t; if (verboseMode) process.stdout.write(t); try { appendFileSync(LOG_FILE, t); } catch {} });
    child.stderr.on('data', (chunk: Buffer) => { const t = chunk.toString(); stderr += t; if (verboseMode) process.stderr.write(t); });

    const timer = setTimeout(() => { child.kill('SIGTERM'); setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 5000); }, ITERATION_TIMEOUT_MS);
    child.on('close', (code) => { clearTimeout(timer); resolve({ stdout, stderr, exitCode: code ?? 1 }); });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

async function spawnCodex(prompt: string, cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const first = await spawnCodexOnce(prompt, cmd, args, false);
  if (/stdin is not a terminal/i.test(first.stderr)) {
    log('warn', 'Codex requires a TTY; retrying with PTY wrapper.');
    return spawnCodexOnce(prompt, cmd, args, true);
  }
  return first;
}

// ── Change Detection ──

function hasMeaningfulChange(previousHead: string): boolean {
  const status = git('status --porcelain');
  if (status.length > 0) return true;
  return git('rev-parse HEAD') !== previousHead;
}

function hasBranchProgress(): boolean {
  try {
    return (parseInt(git(`rev-list --count ${BASE_BRANCH}..HEAD`), 10) || 0) > 0;
  } catch { return false; }
}

function autoCommitIfDirty(chunkId: string, stage: string, iteration: number): boolean {
  const status = git('status --porcelain');
  if (status.length === 0) return false;
  try {
    git('add -A');
    git(`commit -m "auto: ${stage} ${chunkId} iter ${iteration}"`);
    const commitHash = git('rev-parse --short HEAD');
    log('info', `Auto-committed dirty files for ${stage}:${chunkId} iter ${iteration}`);
    recordCommitCheckpoint(chunkId, stage, iteration, commitHash);
    return true;
  } catch (err) {
    log('warn', `Auto-commit failed: ${err}`);
    return false;
  }
}

// ── PR Creation ──

function createPr(args: CliArgs, results: ChunkResult[]): void {
  if (args.noPr) {
    log('info', 'Skipping PR creation (--no-pr)');
    return;
  }

  const allPassed = results.every(r => r.merged);
  if (!allPassed) {
    log('warn', 'Skipping PR creation — not all chunks passed');
    return;
  }

  try {
    execSync('which gh', { stdio: 'ignore' });
  } catch {
    log('warn', 'gh CLI not found — skipping PR creation');
    return;
  }

  const currentBranch = git('branch --show-current');

  // Check if PR already exists
  try {
    const existing = execSync(`gh pr list --head ${currentBranch} --json number --jq length`, { encoding: 'utf-8', cwd: PLAN_DIR + '/..' }).trim();
    if (existing !== '0') {
      log('info', `PR already exists for branch ${currentBranch}`);
      return;
    }
  } catch {
    log('warn', 'Could not check for existing PR');
  }

  // Push branch
  try {
    git(`push -u origin ${currentBranch}`);
  } catch (err) {
    log('error', `Failed to push branch: ${err}`);
    return;
  }

  // Build PR body
  const passed = results.filter(r => r.merged).length;
  const totalCost = results.reduce((s, r) => s + r.cost, 0);
  const body = [
    '## Summary',
    '',
    `${passed} chunks completed successfully.`,
    '',
    '## Chunks',
    '',
    '| Chunk | Status | Iterations | Cost |',
    '|-------|--------|-----------|------|',
    ...results.map(r => {
      const iters = r.implResult.iterations + r.hardenResult.iterations;
      return `| ${r.chunkId} | ${r.merged ? 'PASS' : 'FAIL'} | ${iters} | $${r.cost.toFixed(2)} |`;
    }),
    '',
    `Total cost: $${totalCost.toFixed(2)}`,
    '',
    '---',
    'Generated by RALPH Build Runner',
  ].join('\n');

  const title = `feat: ${currentBranch} — ${passed} chunks completed`;
  try {
    const prUrl = execSync(
      `gh pr create --base "${args.prBase}" --title "${title.slice(0, 70)}" --body "$(cat <<'PREOF'\n${body}\nPREOF\n)"`,
      { encoding: 'utf-8', cwd: PLAN_DIR + '/..' },
    ).trim();
    log('info', `PR created: ${prUrl}`);
  } catch (err) {
    log('error', `Failed to create PR: ${err}`);
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
  const rateLimitedProviders = new Set<'claude' | 'codex'>();
  let activeProvider: 'claude' | 'codex' = provider;

  breaker.on('limit-reached', () => { budgetExceeded = true; });

  while (iteration < maxIterations) {
    if (budgetExceeded) {
      log('error', 'Budget exceeded! Stopping build gracefully.');
      break;
    }

    iteration++;

    // Pre-check budget
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

    const providerColor = activeProvider === 'claude' ? ANSI.magenta : ANSI.blue;
    log('info', `${ANSI.bold}${stage}:${chunkId}${ANSI.reset} iter ${ANSI.bold}${iteration}/${maxIterations}${ANSI.reset} starting... (${providerColor}${ANSI.bold}${activeProvider}${ANSI.reset})`);

    const iterSpan = TraceContext.startSpan(trace, { name: `${stage}:${chunkId}:iter-${iteration}`, parentSpanId: parentSpan.id });
    const startTime = Date.now();
    const headBefore = git('rev-parse HEAD');

    let result: { stdout: string; stderr: string; exitCode: number };
    try {
      if (activeProvider === 'claude') {
        result = await spawnClaude(prompt, maxTurns, claudeCmd);
      } else {
        result = await spawnCodex(prompt, codexCmd, codexArgs);
      }
    } catch (err) {
      log('error', `Provider process error: ${err}`);
      TraceContext.endSpan(iterSpan, { status: 'error', errorMessage: String(err) }, loopDetector);
      continue;
    }

    const durationS = ((Date.now() - startTime) / 1000).toFixed(1);
    lastOutput = result.stdout;

    // Auto-commit dirty files (codex doesn't commit on its own)
    if (activeProvider === 'codex' && result.exitCode === 0) {
      autoCommitIfDirty(chunkId, stage, iteration);
    }

    // Estimate tokens
    const tokenDivisor = activeProvider === 'codex' ? 16 : 4;
    const estCompletionTokens = Math.ceil(result.stdout.length / tokenDivisor);
    const estPromptTokens = Math.ceil(prompt.length / 4);
    const modelName = activeProvider === 'claude' ? DEFAULT_CLAUDE_MODEL : DEFAULT_CODEX_MODEL;
    SpanLifecycle.recordTokenUsage(iterSpan, { promptTokens: estPromptTokens, completionTokens: estCompletionTokens, model: modelName }, counter);

    const costEntries = counter.allModels().map(m => {
      const t = counter.totalsFor(m);
      return { model: m, promptTokens: t.promptTokens, completionTokens: t.completionTokens };
    });
    const runningCost = costCalc.totalCost(costEntries);

    log('debug', `${stage}:${chunkId} iter ${iteration}/${maxIterations} — exit ${result.exitCode}, ${durationS}s, ~${estPromptTokens}+${estCompletionTokens} tokens`);
    log('debug', `budget: ${stripAnsi(budgetBar(runningCost, breaker.check(0).limitUsd))}`);

    // Check for promise
    const promiseRegex = new RegExp(`<promise>${promiseTag}</promise>`);
    if (promiseRegex.test(result.stdout)) {
      // Auto-commit any dirty files the provider left uncommitted
      autoCommitIfDirty(chunkId, stage, iteration);

      const iterChanged = hasMeaningfulChange(headBefore);
      const branchHasCommits = hasBranchProgress();

      if (!iterChanged && !branchHasCommits) {
        log('error', `${stage}:${chunkId} iter ${iteration}/${maxIterations} — promise detected but no code changes on branch; stopping.`);
        SpanLifecycle.setMetadata(iterSpan, { noChanges: true });
        TraceContext.endSpan(iterSpan, { status: 'error', errorMessage: 'promise-without-changes' }, loopDetector);
        return { completed: false, iterations: iteration, output: lastOutput, rateLimitHits };
      }

      if (!iterChanged && branchHasCommits) {
        log('info', `${stage}:${chunkId} iter ${iteration}/${maxIterations} — ${ANSI.green}${ANSI.bold}promise detected${ANSI.reset} ${ANSI.dim}(no new changes this iter, branch has prior commits)${ANSI.reset}`);
      } else {
        log('info', `${stage}:${chunkId} iter ${iteration}/${maxIterations} — ${ANSI.green}${ANSI.bold}promise detected!${ANSI.reset}`);
      }
      TraceContext.endSpan(iterSpan, { status: 'completed' }, loopDetector);
      return { completed: true, iterations: iteration, output: lastOutput, rateLimitHits };
    }

    // Check for rate limit
    if (isRateLimited(result.stderr, result.stdout, result.exitCode)) {
      rateLimitHits++;
      const resetSeconds = parseResetSeconds(result.stderr);
      const sleepMs = (resetSeconds + 180) * 1000;
      log('warn', `Rate limited. Sleeping ${resetSeconds + 180}s...`);

      SpanLifecycle.setMetadata(iterSpan, { rateLimit: true, provider: activeProvider });
      TraceContext.endSpan(iterSpan, { status: 'completed' }, loopDetector);

      rateLimitedProviders.add(activeProvider);
      const otherProvider = activeProvider === 'claude' ? 'codex' : 'claude';
      if (!rateLimitedProviders.has(otherProvider)) {
        log('warn', `Switching to ${otherProvider} after rate limit`);
        activeProvider = otherProvider;
        iteration--;
        continue;
      }

      await sleep(sleepMs);
      rateLimitedProviders.clear();
      activeProvider = provider;
      iteration--;
      continue;
    }

    // Hard stop on non-zero exit
    if (result.exitCode !== 0) {
      log('error', `${stage}:${chunkId} iter ${iteration}/${maxIterations} — exit ${result.exitCode}, stopping.`);
      TraceContext.endSpan(iterSpan, { status: 'error', errorMessage: `exit ${result.exitCode}` }, loopDetector);
      return { completed: false, iterations: iteration, output: lastOutput, rateLimitHits };
    }

    TraceContext.endSpan(iterSpan, { status: 'completed' }, loopDetector);

    if (!hasMeaningfulChange(headBefore)) {
      log('error', `${stage}:${chunkId} iter ${iteration}/${maxIterations} — no code changes detected; stopping.`);
      return { completed: false, iterations: iteration, output: lastOutput, rateLimitHits };
    }

    log('info', `${stage}:${chunkId} iter ${iteration}/${maxIterations} — ${ANSI.yellow}no promise yet${ANSI.reset}, iterating...`);

    const budgetResult = breaker.check(runningCost);
    if (budgetResult.tripped) {
      log('error', `Budget exceeded ($${runningCost.toFixed(2)} / $${budgetResult.limitUsd})! Stopping.`);
      break;
    }
  }

  if (iteration >= maxIterations) {
    log('error', `Max iterations (${maxIterations}) reached without promise for ${stage}:${chunkId}`);
  }
  return { completed: false, iterations: iteration, output: lastOutput, rateLimitHits };
}

// ── Main ──

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) { showHelp(); process.exit(0); }
  verboseMode = args.verbose;

  if (!args.baseBranch) {
    console.error('Error: --base-branch is required');
    process.exit(1);
  }

  PLAN_DIR = args.planDir;
  BUILD_DIR = resolve(PLAN_DIR, '.build');
  CHECKPOINT_FILE = resolve(BUILD_DIR, '.checkpoint');
  LOG_FILE = resolve(BUILD_DIR, 'build.log');
  DB_FILE = resolve(BUILD_DIR, 'build-traces.db');
  BASE_BRANCH = args.baseBranch;

  mkdirSync(BUILD_DIR, { recursive: true });

  if (args.reset) {
    for (const f of [CHECKPOINT_FILE, DB_FILE]) { try { execSync(`rm -f ${f}`); } catch {} }
    try { writeFileSync(LOG_FILE, ''); } catch {}
    log('info', 'Reset: cleared checkpoint, traces DB, and log');
  }

  console.log(`\n${ANSI.bold}${ANSI.magenta}  ⚡ RALPH Build Runner${ANSI.reset} ${ANSI.dim}— Approach C${ANSI.reset}\n`);
  log('info', `Budget: $${args.budget} | Max iters: ${args.maxIterations} | Provider: ${ANSI.bold}${args.provider}${ANSI.reset}`);

  const counter = new TokenCounter();
  const costCalc = new CostCalculator(DEFAULT_PRICING);
  const breaker = new CircuitBreaker({ limitUsd: args.budget });
  const loopDetector = new LoopDetector({ windowSize: 3, repeatThreshold: 3 });
  const sqliteAdapter = new SQLiteAdapter(DB_FILE);
  const trace = TraceContext.createTrace('RALPH Build: Approach C');

  let server: TraceServer | null = null;
  if (!args.noViewer) {
    server = new TraceServer({ adapter: sqliteAdapter, port: args.port });
    await server.start();
    log('info', `Trace viewer: ${ANSI.cyan}${ANSI.bold}${server.url}${ANSI.reset}`);
  }

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

  const chunkFiles = discoverChunks();
  log('info', `Found ${ANSI.bold}${chunkFiles.length}${ANSI.reset} chunks: ${ANSI.dim}${chunkFiles.map(f => f.replace('.md', '')).join(', ')}${ANSI.reset}`);

  const checkpoint = readCheckpoint();
  const results: ChunkResult[] = [];
  const buildStart = Date.now();
  let totalRateLimitHits = 0;

  for (const chunkFile of chunkFiles) {
    if (stopping) break;

    const chunkId = chunkFile.replace('.md', '');
    const chunkPath = resolve(PLAN_DIR, chunkFile);

    if (isChunkDone(checkpoint, chunkId)) {
      log('info', `${ANSI.dim}Skipping ${chunkId} (already merged)${ANSI.reset}`);
      continue;
    }

    logHeader(`chunk: ${chunkId}`);

    const chunkStart = Date.now();
    const chunkSpan = TraceContext.startSpan(trace, { name: `chunk:${chunkId}` });
    const branch = `feat/${chunkId}`;
    let chunkRateLimitHits = 0;

    const preChunkTokens = counter.grandTotal();
    const preChunkCost = (() => {
      const entries = counter.allModels().map(m => { const t = counter.totalsFor(m); return { model: m, promptTokens: t.promptTokens, completionTokens: t.completionTokens }; });
      return costCalc.totalCost(entries);
    })();

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
        autoCommitIfDirty(chunkId, 'impl-final', implResult.iterations);
        const implCommits = parseInt(git(`rev-list --count ${BASE_BRANCH}..HEAD`), 10) || 0;
        if (implCommits === 0) {
          log('error', `${chunkId}: impl "completed" but 0 commits on branch; not checkpointing`);
          stopping = true;
        } else {
          writeCheckpoint(`${chunkId}:impl_done`);
          log('info', `${chunkId}: impl ${ANSI.green}${ANSI.bold}PASSED${ANSI.reset} in ${implResult.iterations} iterations (${implCommits} commits)`);
        }
      } else {
        log('error', `${chunkId}: impl ${ANSI.red}${ANSI.bold}FAILED${ANSI.reset} after ${implResult.iterations} iterations`);
        stopping = true;
      }
    } else {
      log('info', `${chunkId}: impl already done (checkpoint), skipping`);
      implResult = { completed: true, iterations: 0, output: '', rateLimitHits: 0 };
    }

    // Hardening loop
    let hardenResult: RalphLoopResult & { rateLimitHits: number } = { completed: false, iterations: 0, output: '', rateLimitHits: 0 };
    if (!stopping && implResult.completed && !checkpoint.has(`${chunkId}:harden_done`)) {
      log('info', `${chunkId}: starting harden loop (max ${args.maxIterations} iters)`);
      const hardenPrompt = `You are hardening chunk '${chunkPath}' on branch '${branch}'. Do NOT invoke any skills or do code reviews. Follow these steps exactly:

1. Read '${chunkPath}' to get the success criteria and verification command
2. Run the verification command from the chunk file (usually: cd franken-orchestrator && npx vitest run && npx tsc --noEmit)
3. If tests fail or typecheck errors exist, fix them and commit
4. Check each success criterion from the chunk file — fix and commit anything missing
5. Check each hardening requirement — fix and commit anything missing
6. When ALL criteria pass and verification succeeds, output <promise>HARDEN_${chunkId}_DONE</promise>`;

      hardenResult = await runRalphLoop(
        hardenPrompt, `HARDEN_${chunkId}_DONE`, args.maxIterations, 25,
        trace, chunkSpan, 'harden', chunkId,
        args.provider, args.claudeCmd, args.codexCmd, args.codexArgs,
        counter, costCalc, breaker, loopDetector,
      );
      chunkRateLimitHits += hardenResult.rateLimitHits;

      if (hardenResult.completed) {
        autoCommitIfDirty(chunkId, 'harden-final', hardenResult.iterations);
        const hardenCommits = parseInt(git(`rev-list --count ${BASE_BRANCH}..HEAD`), 10) || 0;
        if (hardenCommits === 0) {
          log('error', `${chunkId}: harden "completed" but 0 commits on branch; not checkpointing`);
          stopping = true;
        } else {
          writeCheckpoint(`${chunkId}:harden_done`);
          log('info', `${chunkId}: harden ${ANSI.green}${ANSI.bold}PASSED${ANSI.reset} in ${hardenResult.iterations} iterations`);
        }
      } else {
        log('warn', `${chunkId}: harden didn't complete promise`);
        stopping = true;
      }
    } else if (checkpoint.has(`${chunkId}:harden_done`)) {
      log('info', `${chunkId}: harden already done (checkpoint), skipping`);
      hardenResult = { completed: true, iterations: 0, output: '', rateLimitHits: 0 };
    }

    // Merge back
    let merged = false;
    const branchDelta = parseInt(git(`rev-list --count ${BASE_BRANCH}..${branch}`), 10) || 0;
    if (!checkpoint.has(`${chunkId}:merged`) && implResult.completed && hardenResult.completed && branchDelta > 0) {
      try {
        git(`checkout ${BASE_BRANCH}`);
        git(`merge ${branch} --no-edit`);
        writeCheckpoint(`${chunkId}:merged`);
        merged = true;
        log('info', `${chunkId}: ${ANSI.green}merged${ANSI.reset} to ${ANSI.bold}${BASE_BRANCH}${ANSI.reset}`);
      } catch (err) {
        log('error', `${chunkId}: merge conflict — ${err}`);
        try { git('merge --abort'); } catch {}
      }
    } else if (checkpoint.has(`${chunkId}:merged`)) {
      merged = true;
    } else if (branchDelta === 0) {
      log('warn', `${chunkId}: no commits on ${branch} vs ${BASE_BRANCH}; skipping merge`);
    }

    const chunkDurationMs = Date.now() - chunkStart;
    const postChunkTokens = counter.grandTotal();
    const postChunkCostEntries = counter.allModels().map(m => { const t = counter.totalsFor(m); return { model: m, promptTokens: t.promptTokens, completionTokens: t.completionTokens }; });
    const chunkCost = costCalc.totalCost(postChunkCostEntries) - preChunkCost;

    TraceContext.endSpan(chunkSpan, { status: merged ? 'completed' : 'error' });
    await sqliteAdapter.flush(trace);
    totalRateLimitHits += chunkRateLimitHits;

    log('info', `${chunkId}: ${statusBadge(merged)} ${implResult.iterations + hardenResult.iterations} iters | $${chunkCost.toFixed(2)} | ${(chunkDurationMs / 1000).toFixed(0)}s`);

    results.push({
      chunkId, implResult, hardenResult, merged,
      tokens: { prompt: postChunkTokens.promptTokens - preChunkTokens.promptTokens, completion: postChunkTokens.completionTokens - preChunkTokens.completionTokens },
      cost: chunkCost, durationMs: chunkDurationMs, rateLimitHits: chunkRateLimitHits,
    });

    if (stopping) break;
  }

  // ── Final Summary ──
  TraceContext.endTrace(trace);
  await sqliteAdapter.flush(trace);

  const totalDurationMs = Date.now() - buildStart;
  const grandTotals = counter.grandTotal();
  const finalCostEntries = counter.allModels().map(m => { const t = counter.totalsFor(m); return { model: m, promptTokens: t.promptTokens, completionTokens: t.completionTokens }; });
  const totalCost = costCalc.totalCost(finalCostEntries);

  logHeader('BUILD SUMMARY');
  console.log(`  ${ANSI.dim}Duration:${ANSI.reset}     ${(totalDurationMs / 1000 / 60).toFixed(1)} minutes`);
  console.log(`  ${ANSI.dim}Budget:${ANSI.reset}       ${budgetBar(totalCost, args.budget)}`);
  if (totalRateLimitHits > 0) console.log(`  ${ANSI.dim}Rate limits:${ANSI.reset}  ${ANSI.yellow}${totalRateLimitHits}${ANSI.reset}`);
  console.log('');

  if (results.length > 0) {
    console.log(`  ${ANSI.dim}Chunks:${ANSI.reset}`);
    for (const r of results) {
      console.log(`    ${statusBadge(r.merged)} ${ANSI.bold}${r.chunkId}${ANSI.reset} ${ANSI.dim}|${ANSI.reset} ${r.implResult.iterations + r.hardenResult.iterations} iters ${ANSI.dim}|${ANSI.reset} $${r.cost.toFixed(2)} ${ANSI.dim}|${ANSI.reset} ${(r.durationMs / 1000).toFixed(0)}s`);
    }
    console.log('');
  }

  const passed = results.filter(r => r.merged).length;
  const failed = results.filter(r => !r.merged).length;
  const resultColor = failed === 0 ? ANSI.green : ANSI.red;
  console.log(`  ${resultColor}${ANSI.bold}Result: ${passed} passed, ${failed} failed${ANSI.reset} out of ${results.length} chunks\n`);

  // PR creation
  createPr(args, results);

  if (server) await server.stop();
  sqliteAdapter.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  log('error', `Fatal: ${err}`);
  process.exit(1);
});
