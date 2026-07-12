#!/usr/bin/env npx tsx

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

function printLine(...args: unknown[]): void {
  console.info(...args);
}

/**
 * Verify local development setup.
 * Checks that all required services and configs are available.
 *
 * Usage: npm run local:verify-setup
 * Usage: npx tsx scripts/verify-setup.ts [--dry-run] [--env-file <path>]
 */

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

interface Options {
  dryRun: boolean;
  envFile: string;
}

export {};

const REQUIRED_BOOTSTRAP_ENV_VARS = [
  'CHROMA_URL',
  'FRANKEN_MAX_TOTAL_TOKENS',
  'FRANKEN_MAX_DURATION_MS',
  'FRANKEN_MAX_CRITIQUE_ITERATIONS',
  'FRANKEN_ENABLE_HEARTBEAT',
  'FRANKEN_ENABLE_TRACING',
  'FRANKEN_ENABLE_REFLECTION',
  'FRANKEN_MIN_CRITIQUE_SCORE',
] as const;

const results: CheckResult[] = [];

function parseOptions(argv: string[]): Options {
  const options: Options = { dryRun: false, envFile: '.env' };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--env-file') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--env-file requires a path');
      }
      options.envFile = value;
      i += 1;
      continue;
    }

    if (arg.startsWith('--env-file=')) {
      const value = arg.slice('--env-file='.length);
      if (!value) {
        throw new Error('--env-file requires a path');
      }
      options.envFile = value;
      continue;
    }

    if (arg === '-h' || arg === '--help') {
      printLine('Usage: npx tsx scripts/verify-setup.ts [--dry-run] [--env-file <path>]');
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
}

function parseEnvFile(path: string): Map<string, string> {
  const env = new Map<string, string>();

  if (!existsSync(path)) {
    return env;
  }

  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim().replace(/^(?:"|')|(?:"|')$/gu, '');
    env.set(key, value);
  }

  return env;
}

function checkNpmPackageManager(): void {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as { packageManager?: string };
  const expected = manifest.packageManager?.match(/^npm@(\d+\.\d+\.\d+)$/u)?.[1];

  if (!expected) {
    check('packageManager declares npm', false, manifest.packageManager ?? 'missing');
    return;
  }

  try {
    const actual = execSync('npm --version', {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    }).trim();
    check('npm matches packageManager', actual === expected, `expected ${expected}, found ${actual}`);
  } catch (error) {
    check('npm matches packageManager', false, error instanceof Error ? error.message : String(error));
  }
}

function checkRequiredBootstrapEnv(path: string, parsed: ReadonlyMap<string, string>): void {
  const missing = REQUIRED_BOOTSTRAP_ENV_VARS.filter((key) => {
    const value = process.env[key] ?? parsed.get(key);
    return value === undefined || value === '';
  });

  check(
    'Required bootstrap env vars',
    missing.length === 0,
    missing.length === 0 ? `Found in ${path} or process.env` : `Missing: ${missing.join(', ')}`,
  );
}

async function checkHttp(name: string, url: string): Promise<void> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    check(name, res.ok, `${res.status} ${res.statusText}`);
  } catch (error) {
    check(name, false, error instanceof Error ? error.message : String(error));
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  printLine(`Verifying Frankenbeast local setup${options.dryRun ? ' (dry-run)' : ''}...\n`);

  // Node version
  const [major, minor, patch] = process.versions.node.split('.').map(Number);
  const meetsMinimumNode =
    (major === 22 && (minor! > 13 || (minor === 13 && patch! >= 0))) ||
    (major! >= 24 && major! < 26);
  check('Node.js >=22.13.0 <23 || >=24.0.0 <26', meetsMinimumNode, `v${process.versions.node}`);

  checkNpmPackageManager();

  // Environment file
  const envFileExists = existsSync(options.envFile);
  const envFile = parseEnvFile(options.envFile);
  check('Environment file exists', envFileExists, envFileExists ? options.envFile : `Missing — copy .env.example to ${options.envFile}`);
  if (options.dryRun) {
    checkRequiredBootstrapEnv(options.envFile, envFile);
  }

  // Config example
  check('Config example', existsSync('frankenbeast.config.example.json'), 'frankenbeast.config.example.json');

  if (options.dryRun) {
    check('Live service probes', true, 'Skipping live service probes in dry-run mode');
  } else {
    // ChromaDB
    const chromaUrl = process.env['CHROMA_URL'] ?? envFile.get('CHROMA_URL') ?? 'http://localhost:8000';
    await checkHttp('ChromaDB', `${chromaUrl}/api/v2/heartbeat`);

    // Grafana
    await checkHttp('Grafana', 'http://localhost:3000/api/health');

    // Tempo
    await checkHttp('Tempo', 'http://localhost:3200/ready');
  }

  // Print results
  printLine('Results:\n');
  let allOk = true;
  for (const r of results) {
    const icon = r.ok ? '\u2713' : '\u2717';
    printLine(`  ${icon} ${r.name}: ${r.detail}`);
    if (!r.ok) allOk = false;
  }

  printLine();
  if (allOk) {
    printLine(options.dryRun ? 'Dry-run checks passed. Bootstrap prerequisites are valid.' : 'All checks passed! Ready to develop.');
  } else {
    printLine(options.dryRun ? 'Dry-run checks failed. Fix bootstrap prerequisites before installing.' : 'Some checks failed. Run "docker compose up -d" to start services.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Verify failed:', err);
  process.exit(1);
});
