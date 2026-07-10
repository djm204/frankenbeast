#!/usr/bin/env npx tsx

function printLine(...args: unknown[]): void {
  console.info(...args);
}

/**
 * Verify local development setup.
 * Checks that all required services and configs are available.
 *
 * Usage: npm run local:verify-setup
 */

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

export {};

const results: CheckResult[] = [];

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
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
  printLine('Verifying Frankenbeast local setup...\n');

  // Node version
  const [major, minor, patch] = process.versions.node.split('.').map(Number);
  const meetsMinimumNode =
    (major === 22 && (minor! > 13 || (minor === 13 && patch! >= 0))) ||
    (major! >= 24 && major! < 26);
  check('Node.js >=22.13.0 <23 || >=24.0.0 <26', meetsMinimumNode, `v${process.versions.node}`);

  // Environment file
  const { existsSync } = await import('node:fs');
  check('.env file exists', existsSync('.env'), existsSync('.env') ? 'Found' : 'Missing — copy .env.example to .env');

  // Config example
  check('Config example', existsSync('frankenbeast.config.example.json'), 'frankenbeast.config.example.json');

  // ChromaDB
  const chromaUrl = process.env['CHROMA_URL'] ?? 'http://localhost:8000';
  await checkHttp('ChromaDB', `${chromaUrl}/api/v2/heartbeat`);

  // Grafana
  await checkHttp('Grafana', 'http://localhost:3000/api/health');

  // Tempo
  await checkHttp('Tempo', 'http://localhost:3200/ready');

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
    printLine('All checks passed! Ready to develop.');
  } else {
    printLine('Some checks failed. Run "docker compose up -d" to start services.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Verify failed:', err);
  process.exit(1);
});
