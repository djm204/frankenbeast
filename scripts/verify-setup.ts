#!/usr/bin/env npx tsx
/**
 * Verify local development setup.
 * Checks that all required services and configs are available.
 *
 * Usage: npx tsx scripts/verify-setup.ts
 */

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

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
  console.log('Verifying Frankenbeast local setup...\n');

  // Node version
  const [major] = process.versions.node.split('.').map(Number);
  check('Node.js >= 22', major! >= 22, `v${process.versions.node}`);

  // Environment file
  const { existsSync } = await import('node:fs');
  check('.env file exists', existsSync('.env'), existsSync('.env') ? 'Found' : 'Missing — copy .env.example to .env');

  // Config example
  check('Config example', existsSync('frankenbeast.config.example.json'), 'frankenbeast.config.example.json');

  // ChromaDB
  const chromaUrl = process.env['CHROMA_URL'] ?? 'http://localhost:8000';
  await checkHttp('ChromaDB', `${chromaUrl}/api/v1/heartbeat`);

  // Grafana
  await checkHttp('Grafana', 'http://localhost:3000/api/health');

  // Tempo
  await checkHttp('Tempo', 'http://localhost:3200/ready');

  // Firewall
  await checkHttp('Firewall server', 'http://localhost:9090/health');

  // Print results
  console.log('Results:\n');
  let allOk = true;
  for (const r of results) {
    const icon = r.ok ? '\u2713' : '\u2717';
    console.log(`  ${icon} ${r.name}: ${r.detail}`);
    if (!r.ok) allOk = false;
  }

  console.log();
  if (allOk) {
    console.log('All checks passed! Ready to develop.');
  } else {
    console.log('Some checks failed. Run "docker compose up -d" to start services.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Verify failed:', err);
  process.exit(1);
});
