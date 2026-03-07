#!/usr/bin/env npx tsx
/**
 * Build Runner for CLI Gaps Marathon
 *
 * Feature-level branching: chunks are grouped into features, each gets its own
 * branch off main, merged back as a reviewable unit.
 *
 * Provider fallback: claude -> codex on rate limit. If both rate limited, sleeps
 * until reset time.
 *
 * Clean CLI logging: colored service badges, debug/info levels, no garbled JSON.
 */

import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { readdirSync, readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';

// ── ANSI Colors ──

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
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
} as const;

// ── Service Labels ──

type Service = 'runner' | 'claude' | 'git' | 'feature' | 'chunk' | 'budget' | 'error';

const SERVICE_COLORS: Record<Service, string> = {
  runner: ANSI.blue,
  claude: ANSI.cyan,
  git: ANSI.yellow,
  feature: ANSI.magenta,
  chunk: ANSI.green,
  budget: ANSI.red,
  error: ANSI.red,
};

function badge(service: Service): string {
  const color = SERVICE_COLORS[service];
  const padded = service.padEnd(8);
  return `${color}[${padded}]${ANSI.reset}`;
}

// ── Logger ──

let VERBOSE = false;

function info(service: Service, msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`${ANSI.dim}${ts}${ANSI.reset} ${badge(service)} ${msg}`);
}

function debug(service: Service, msg: string): void {
  if (!VERBOSE) return;
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`${ANSI.dim}${ts}${ANSI.reset} ${badge(service)} ${ANSI.dim}${msg}${ANSI.reset}`);
}

function error(service: Service, msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.error(`${ANSI.dim}${ts}${ANSI.reset} ${badge(service)} ${ANSI.red}${msg}${ANSI.reset}`);
}

function header(text: string): void {
  const line = '─'.repeat(60);
  console.log(`\n${ANSI.bold}${line}${ANSI.reset}`);
  console.log(`${ANSI.bold}  ${text}${ANSI.reset}`);
  console.log(`${ANSI.bold}${line}${ANSI.reset}\n`);
}

function statusBadge(passed: boolean): string {
  return passed
    ? `${ANSI.bgGreen}${ANSI.bold} PASS ${ANSI.reset}`
    : `${ANSI.bgRed}${ANSI.bold} FAIL ${ANSI.reset}`;
}

// ── Log File ──

let LOG_FILE = '';

function logToFile(line: string): void {
  if (!LOG_FILE) return;
  // Strip ANSI codes for file output
  const clean = line.replace(/\x1b\[[0-9;]*m/g, '');
  appendFileSync(LOG_FILE, clean + '\n');
}

// Monkey-patch console to also write to log file
const origLog = console.log;
const origError = console.error;
console.log = (...args: unknown[]) => {
  origLog(...args);
  logToFile(args.map(String).join(' '));
};
console.error = (...args: unknown[]) => {
  origError(...args);
  logToFile(args.map(String).join(' '));
};

// ── CLI Args ──

interface RunnerArgs {
  baseBranch: string;
  planDir: string;
  budget: number;
  provider: 'claude' | 'codex';
  noPr: boolean;
  verbose: boolean;
  reset: boolean;
}

function parseArgs(): RunnerArgs {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };
  const has = (flag: string): boolean => args.includes(flag);

  return {
    baseBranch: get('--base-branch') ?? 'main',
    planDir: get('--plan-dir') ?? dirname(new URL(import.meta.url).pathname),
    budget: Number(get('--budget') ?? '10'),
    provider: (get('--provider') ?? 'claude') as 'claude' | 'codex',
    noPr: has('--no-pr'),
    verbose: has('--verbose'),
    reset: has('--reset'),
  };
}

// ── Feature Map ──

interface Feature {
  name: string;
  branch: string;
  chunks: string[];
}

const FEATURES: Feature[] = [
  {
    name: 'CLI LLM Adapter',
    branch: 'feat/cli-llm-adapter',
    chunks: ['01_llm-adapter-types', '02_llm-adapter-impl', '03_llm-adapter-wiring'],
  },
  {
    name: 'Observer Integration',
    branch: 'feat/cli-observer',
    chunks: ['04_observer-bridge-types', '05_observer-deps-factory', '06_observer-budget-enforcement'],
  },
  {
    name: 'CLI Output Polish',
    branch: 'feat/cli-output-polish',
    chunks: ['07_cli-output-service-labels', '08_cli-output-clean-json'],
  },
  {
    name: 'Config File Loading',
    branch: 'feat/cli-config-loading',
    chunks: ['09_config-file-loading'],
  },
  {
    name: 'Trace Viewer',
    branch: 'feat/cli-trace-viewer',
    chunks: ['10_trace-viewer-wiring'],
  },
  {
    name: 'E2E Proof + Docs',
    branch: 'feat/cli-e2e-proof',
    chunks: ['11_e2e-proof', '12_doc-update'],
  },
];

// ── Checkpoint ──

interface Checkpoint {
  completedChunks: Set<string>;
  failedChunks: Set<string>;
}

function loadCheckpoint(planDir: string): Checkpoint {
  const file = join(planDir, '.checkpoint');
  const completed = new Set<string>();
  const failed = new Set<string>();

  if (existsSync(file)) {
    const lines = readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const [status, chunkId] = line.split(':');
      if (status === 'PASS') completed.add(chunkId!);
      if (status === 'FAIL') failed.add(chunkId!);
    }
  }

  return { completedChunks: completed, failedChunks: failed };
}

function recordCheckpoint(planDir: string, chunkId: string, passed: boolean): void {
  const file = join(planDir, '.checkpoint');
  appendFileSync(file, `${passed ? 'PASS' : 'FAIL'}:${chunkId}\n`);
}

function clearCheckpoint(planDir: string): void {
  const file = join(planDir, '.checkpoint');
  if (existsSync(file)) {
    execSync(`rm "${file}"`);
  }
}

// ── Git Helpers ──

function git(cmd: string, cwd?: string): string {
  const opts = cwd ? { encoding: 'utf-8' as const, stdio: 'pipe' as const, cwd } : { encoding: 'utf-8' as const, stdio: 'pipe' as const };
  try {
    return execSync(`git ${cmd}`, opts).trim();
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(`git ${cmd} failed: ${err.stderr ?? err.message}`);
  }
}

function branchExists(branch: string): boolean {
  try {
    git(`rev-parse --verify ${branch}`);
    return true;
  } catch {
    return false;
  }
}

function currentBranch(): string {
  return git('branch --show-current');
}

function ensureBranch(branch: string, baseBranch: string): void {
  if (branchExists(branch)) {
    debug('git', `Checking out existing branch ${branch}`);
    git(`checkout ${branch}`);
  } else {
    info('git', `Creating branch ${ANSI.bold}${branch}${ANSI.reset} from ${baseBranch}`);
    git(`checkout -b ${branch} ${baseBranch}`);
  }
}

function mergeBranch(source: string, target: string): void {
  info('git', `Merging ${ANSI.bold}${source}${ANSI.reset} -> ${ANSI.bold}${target}${ANSI.reset}`);
  git(`checkout ${target}`);
  git(`merge ${source} --no-edit`);
}

// ── Rate Limit + Provider Fallback ──

function parseResetTime(stderr: string, stdout: string): number | null {
  const combined = stderr + stdout;

  // "rate limit resets at 2026-03-05T20:15:00Z"
  const isoMatch = combined.match(/resets?\s+at\s+(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/i);
  if (isoMatch) {
    const resetAt = new Date(isoMatch[1]!).getTime();
    const sleepMs = Math.max(0, resetAt - Date.now());
    return sleepMs;
  }

  // "retry after N seconds"
  const retryMatch = combined.match(/retry\s+after\s+(\d+)/i);
  if (retryMatch) {
    return Number(retryMatch[1]) * 1000;
  }

  // "overloaded" or "rate limit" without reset time — default 2 min
  if (/rate.?limit|overloaded|429/i.test(combined)) {
    return 120_000;
  }

  return null;
}

function isRateLimited(stderr: string, stdout: string, exitCode: number): boolean {
  if (exitCode === 0) return false;
  const combined = stderr + stdout;
  return /rate.?limit|overloaded|429|too many requests/i.test(combined);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Subprocess Spawning ──

interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  // Clear ALL CLAUDE* env vars to prevent freeze bug
  for (const key of Object.keys(env)) {
    if (key.startsWith('CLAUDE')) {
      delete env[key];
    }
  }
  return env;
}

function buildArgs(prompt: string, maxTurns: number): string[] {
  return [
    '--print',
    '--dangerously-skip-permissions',
    '--output-format', 'stream-json',
    '--verbose',
    '--plugin-dir', '/dev/null',
    '--no-session-persistence',
    '--max-turns', String(maxTurns),
    prompt,
  ];
}

function extractTextFromStreamJson(raw: string): string {
  const lines = raw.split('\n');
  const textParts: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed);
      // Handle stream-json events
      if (typeof parsed === 'object' && parsed !== null) {
        // Direct text field
        if (typeof parsed.text === 'string') {
          textParts.push(parsed.text);
          continue;
        }
        // Nested in content_block
        if (parsed.content_block?.text) {
          textParts.push(parsed.content_block.text);
          continue;
        }
        // Nested in delta
        if (parsed.delta?.text) {
          textParts.push(parsed.delta.text);
          continue;
        }
        // Nested in message.content
        if (parsed.message?.content) {
          for (const block of Array.isArray(parsed.message.content) ? parsed.message.content : [parsed.message.content]) {
            if (typeof block === 'string') textParts.push(block);
            else if (block?.text) textParts.push(block.text);
          }
          continue;
        }
        // Result event with text
        if (parsed.result?.text) {
          textParts.push(parsed.result.text);
          continue;
        }
      }
    } catch {
      // Not JSON — treat as plain text
      if (trimmed.length > 0) {
        textParts.push(trimmed);
      }
    }
  }

  return textParts.join('');
}

async function spawnProvider(
  provider: 'claude' | 'codex',
  prompt: string,
  maxTurns: number,
  cwd: string,
  timeoutMs: number = 600_000,
): Promise<SpawnResult> {
  const cmd = provider === 'claude' ? 'claude' : 'codex';
  const args = provider === 'claude' ? buildArgs(prompt, maxTurns) : ['exec', prompt];
  const env = cleanEnv();
  const start = Date.now();

  return new Promise((resolve) => {
    const proc: ChildProcess = spawn(cmd, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      // Stream clean text to terminal
      const text = chunk.toString();
      const lines = text.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          // Only display text content, not JSON frames
          const extracted = parsed.delta?.text ?? parsed.text ?? parsed.content_block?.text ?? null;
          if (extracted) {
            process.stdout.write(extracted);
          }
        } catch {
          // Plain text — display as-is
          if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
            process.stdout.write(trimmed + '\n');
          }
        }
      }
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
      const text = chunk.toString().trim();
      if (text && VERBOSE) {
        debug('claude', text);
      }
    });

    const timer = setTimeout(() => {
      error('runner', `Timeout after ${timeoutMs / 1000}s — killing process`);
      proc.kill('SIGTERM');
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString(),
        stderr: Buffer.concat(stderrChunks).toString(),
        durationMs: Date.now() - start,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: 1,
        stdout: '',
        stderr: err.message,
        durationMs: Date.now() - start,
      });
    });
  });
}

// ── Run Chunk with Provider Fallback ──

async function runChunkWithFallback(
  prompt: string,
  maxTurns: number,
  primaryProvider: 'claude' | 'codex',
  cwd: string,
): Promise<SpawnResult> {
  const providers: ('claude' | 'codex')[] = primaryProvider === 'claude'
    ? ['claude', 'codex']
    : ['codex', 'claude'];

  for (const provider of providers) {
    info('claude', `Trying provider: ${ANSI.bold}${provider}${ANSI.reset}`);
    const result = await spawnProvider(provider, prompt, maxTurns, cwd);

    if (result.exitCode === 0) {
      return result;
    }

    if (isRateLimited(result.stderr, result.stdout, result.exitCode)) {
      const nextProvider = providers.find((p) => p !== provider);
      info('claude', `${ANSI.yellow}Rate limited by ${provider}${ANSI.reset}`);

      if (nextProvider) {
        info('claude', `Falling back to ${ANSI.bold}${nextProvider}${ANSI.reset}`);
        const fallbackResult = await spawnProvider(nextProvider, prompt, maxTurns, cwd);

        if (fallbackResult.exitCode === 0) {
          return fallbackResult;
        }

        if (isRateLimited(fallbackResult.stderr, fallbackResult.stdout, fallbackResult.exitCode)) {
          // Both providers rate limited — sleep until reset
          const sleepMs1 = parseResetTime(result.stderr, result.stdout) ?? 120_000;
          const sleepMs2 = parseResetTime(fallbackResult.stderr, fallbackResult.stdout) ?? 120_000;
          const sleepMs = Math.min(sleepMs1, sleepMs2);
          const sleepMin = (sleepMs / 60_000).toFixed(1);

          info('budget', `${ANSI.yellow}Both providers rate limited. Sleeping ${sleepMin} min...${ANSI.reset}`);
          await sleep(sleepMs);

          // Retry primary after sleep
          info('claude', `Retrying ${ANSI.bold}${primaryProvider}${ANSI.reset} after sleep`);
          return spawnProvider(primaryProvider, prompt, maxTurns, cwd);
        }

        return fallbackResult;
      }

      // No fallback provider — sleep and retry
      const sleepMs = parseResetTime(result.stderr, result.stdout) ?? 120_000;
      const sleepMin = (sleepMs / 60_000).toFixed(1);
      info('budget', `${ANSI.yellow}Rate limited. Sleeping ${sleepMin} min...${ANSI.reset}`);
      await sleep(sleepMs);
      return spawnProvider(provider, prompt, maxTurns, cwd);
    }

    // Non-rate-limit failure — return as-is
    return result;
  }

  // Should never reach here
  return { exitCode: 1, stdout: '', stderr: 'No providers available', durationMs: 0 };
}

// ── Promise Detection ──

function detectPromise(output: string, tag: string): boolean {
  return output.includes(`<promise>${tag}</promise>`);
}

// ── Run Single Chunk ──

interface ChunkResult {
  chunkId: string;
  phase: 'impl' | 'harden';
  passed: boolean;
  durationMs: number;
  iterations: number;
}

async function runChunk(
  planDir: string,
  chunkId: string,
  phase: 'impl' | 'harden',
  provider: 'claude' | 'codex',
  featureBranch: string,
  cwd: string,
): Promise<ChunkResult> {
  const chunkFile = join(planDir, `${chunkId}.md`);
  const maxTurns = phase === 'impl' ? 30 : 15;
  const promiseTag = phase === 'impl'
    ? `IMPL_${chunkId}_DONE`
    : `HARDEN_${chunkId}_DONE`;
  const chunkBranch = `feat/${chunkId}`;
  const maxIterations = 3;
  const start = Date.now();

  // Create chunk branch off feature branch
  ensureBranch(chunkBranch, featureBranch);

  const prompt = phase === 'impl'
    ? `Read ${chunkFile}. Implement ALL features described. Use TDD: write failing tests first, then implement, then commit atomically. Run the verification command. Output <promise>${promiseTag}</promise> when done.`
    : `Review work on branch '${chunkBranch}' for chunk '${chunkFile}'. Check all success criteria and hardening requirements. Fix issues, add tests, commit. Run full test suite. Output <promise>${promiseTag}</promise> when stable.`;

  let totalIterations = 0;

  for (let iter = 1; iter <= maxIterations; iter++) {
    totalIterations = iter;
    info('chunk', `${ANSI.bold}${chunkId}${ANSI.reset} ${phase} iteration ${iter}/${maxIterations}`);

    const result = await runChunkWithFallback(prompt, maxTurns, provider, cwd);
    const cleanOutput = extractTextFromStreamJson(result.stdout);
    const allOutput = cleanOutput + result.stdout;

    debug('chunk', `Exit code: ${result.exitCode} | Duration: ${(result.durationMs / 1000).toFixed(0)}s`);

    if (detectPromise(allOutput, promiseTag)) {
      info('chunk', `${statusBadge(true)} ${chunkId} ${phase} complete`);

      // Auto-commit any uncommitted changes
      try {
        const status = git('status --porcelain');
        if (status) {
          git('add -A');
          git(`commit -m "feat(${chunkId}): ${phase} complete"`);
          debug('git', 'Auto-committed remaining changes');
        }
      } catch {
        debug('git', 'Nothing to commit');
      }

      // Merge chunk branch back to feature branch
      mergeBranch(chunkBranch, featureBranch);

      return {
        chunkId,
        phase,
        passed: true,
        durationMs: Date.now() - start,
        iterations: totalIterations,
      };
    }

    if (result.exitCode !== 0) {
      error('chunk', `Non-zero exit (${result.exitCode}). Retrying...`);
    } else {
      info('chunk', `Promise tag not detected. Retrying...`);
    }
  }

  // Failed after all iterations
  error('chunk', `${statusBadge(false)} ${chunkId} ${phase} failed after ${maxIterations} iterations`);

  // Still merge what we have (partial progress) back to feature
  try {
    const status = git('status --porcelain');
    if (status) {
      git('add -A');
      git(`commit -m "wip(${chunkId}): ${phase} incomplete"`);
    }
    mergeBranch(chunkBranch, featureBranch);
  } catch (e) {
    error('git', `Failed to merge partial progress: ${e}`);
    git(`checkout ${featureBranch}`);
  }

  return {
    chunkId,
    phase,
    passed: false,
    durationMs: Date.now() - start,
    iterations: totalIterations,
  };
}

// ── Summary Display ──

function displaySummary(results: ChunkResult[], startTime: number, budget: number): void {
  header('BUILD SUMMARY');

  const durationMin = ((Date.now() - startTime) / 60_000).toFixed(1);
  info('runner', `Duration: ${durationMin} min`);
  info('runner', `Budget: $${budget}`);

  console.log('');
  for (const r of results) {
    const dur = (r.durationMs / 1000).toFixed(0);
    console.log(`  ${statusBadge(r.passed)} ${ANSI.bold}${r.chunkId}${ANSI.reset} ${r.phase} (${r.iterations} iter, ${dur}s)`);
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('');
  const color = failed === 0 ? ANSI.green : ANSI.red;
  info('runner', `${color}${ANSI.bold}Result: ${passed} passed, ${failed} failed${ANSI.reset}`);
  console.log('');
}

// ── Main ──

async function main(): Promise<void> {
  const args = parseArgs();
  VERBOSE = args.verbose;

  const planDir = args.planDir;
  const cwd = process.cwd();

  // Setup log file
  const buildDir = join(planDir, '.build');
  if (!existsSync(buildDir)) mkdirSync(buildDir, { recursive: true });
  LOG_FILE = join(buildDir, `run-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`);

  header('FRANKENBEAST CLI GAPS MARATHON');
  info('runner', `Plan dir: ${planDir}`);
  info('runner', `Base branch: ${ANSI.bold}${args.baseBranch}${ANSI.reset}`);
  info('runner', `Provider: ${ANSI.bold}${args.provider}${ANSI.reset} (fallback: ${args.provider === 'claude' ? 'codex' : 'claude'})`);
  info('runner', `Budget: $${args.budget}`);
  info('runner', `Verbose: ${args.verbose}`);
  info('runner', `Log: ${LOG_FILE}`);

  if (args.reset) {
    info('runner', 'Clearing checkpoint...');
    clearCheckpoint(planDir);
  }

  const checkpoint = loadCheckpoint(planDir);
  if (checkpoint.completedChunks.size > 0) {
    info('runner', `Resuming: ${checkpoint.completedChunks.size} chunks already completed`);
  }

  // Verify on base branch
  const current = currentBranch();
  if (current !== args.baseBranch) {
    info('git', `Switching to base branch ${args.baseBranch}`);
    git(`checkout ${args.baseBranch}`);
  }

  const allResults: ChunkResult[] = [];
  const startTime = Date.now();
  let aborted = false;

  // SIGINT handler
  process.on('SIGINT', () => {
    if (aborted) process.exit(1);
    aborted = true;
    error('runner', 'SIGINT received. Finishing current chunk then stopping...');
  });

  for (const feature of FEATURES) {
    if (aborted) break;

    header(`Feature: ${feature.name}`);
    info('feature', `Branch: ${ANSI.bold}${feature.branch}${ANSI.reset}`);
    info('feature', `Chunks: ${feature.chunks.join(', ')}`);

    // Check if all chunks in this feature are already done
    const allDone = feature.chunks.every(
      (c) => checkpoint.completedChunks.has(`impl:${c}`) && checkpoint.completedChunks.has(`harden:${c}`),
    );
    if (allDone) {
      info('feature', `${ANSI.green}All chunks already completed. Skipping.${ANSI.reset}`);
      continue;
    }

    // Create feature branch off base
    git(`checkout ${args.baseBranch}`);
    ensureBranch(feature.branch, args.baseBranch);

    for (const chunkId of feature.chunks) {
      if (aborted) break;

      // ── Implementation Loop ──
      const implKey = `impl:${chunkId}`;
      if (checkpoint.completedChunks.has(implKey)) {
        info('chunk', `${ANSI.dim}Skipping ${chunkId} impl (already passed)${ANSI.reset}`);
      } else {
        console.log('');
        info('chunk', `${'━'.repeat(40)}`);
        info('chunk', `${ANSI.bold}${chunkId}${ANSI.reset} — Implementation`);
        info('chunk', `${'━'.repeat(40)}`);

        // Ensure we're on the feature branch before creating chunk branch
        git(`checkout ${feature.branch}`);

        const implResult = await runChunk(planDir, chunkId, 'impl', args.provider, feature.branch, cwd);
        allResults.push(implResult);
        recordCheckpoint(planDir, implKey, implResult.passed);

        if (!implResult.passed) {
          error('chunk', `Implementation failed for ${chunkId}. Continuing to next chunk...`);
          // Record harden as failed too
          recordCheckpoint(planDir, `harden:${chunkId}`, false);
          allResults.push({
            chunkId,
            phase: 'harden',
            passed: false,
            durationMs: 0,
            iterations: 0,
          });
          continue;
        }
      }

      // ── Hardening Loop ──
      const hardenKey = `harden:${chunkId}`;
      if (checkpoint.completedChunks.has(hardenKey)) {
        info('chunk', `${ANSI.dim}Skipping ${chunkId} harden (already passed)${ANSI.reset}`);
      } else {
        console.log('');
        info('chunk', `${'━'.repeat(40)}`);
        info('chunk', `${ANSI.bold}${chunkId}${ANSI.reset} — Hardening`);
        info('chunk', `${'━'.repeat(40)}`);

        // Ensure we're on the feature branch
        git(`checkout ${feature.branch}`);

        const hardenResult = await runChunk(planDir, chunkId, 'harden', args.provider, feature.branch, cwd);
        allResults.push(hardenResult);
        recordCheckpoint(planDir, hardenKey, hardenResult.passed);

        if (!hardenResult.passed) {
          error('chunk', `Hardening failed for ${chunkId}. Continuing...`);
        }
      }
    }

    // Merge feature branch back to base
    if (!aborted) {
      const featureChunksPassed = feature.chunks.every((c) => {
        const implPassed = checkpoint.completedChunks.has(`impl:${c}`) ||
          allResults.some((r) => r.chunkId === c && r.phase === 'impl' && r.passed);
        const hardenPassed = checkpoint.completedChunks.has(`harden:${c}`) ||
          allResults.some((r) => r.chunkId === c && r.phase === 'harden' && r.passed);
        return implPassed && hardenPassed;
      });

      if (featureChunksPassed) {
        header(`Merging Feature: ${feature.name}`);
        try {
          mergeBranch(feature.branch, args.baseBranch);
          info('feature', `${statusBadge(true)} ${feature.name} merged to ${args.baseBranch}`);
        } catch (e) {
          error('git', `Merge failed: ${e}`);
        }
      } else {
        error('feature', `${statusBadge(false)} ${feature.name} — not all chunks passed, skipping merge`);
        git(`checkout ${args.baseBranch}`);
      }
    }
  }

  // Return to base branch
  try {
    git(`checkout ${args.baseBranch}`);
  } catch {}

  displaySummary(allResults, startTime, args.budget);

  const anyFailed = allResults.some((r) => !r.passed);
  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  error('runner', `Fatal: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
