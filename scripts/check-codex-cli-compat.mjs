#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const codexBinary = process.env.CODEX_BINARY?.trim() || 'codex';
const requiredArgs = ['exec', '--sandbox', 'workspace-write', '--json', '--color', 'never', '--help'];
const result = spawnSync(codexBinary, requiredArgs, {
  encoding: 'utf8',
  stdio: 'pipe',
});

if (result.error) {
  console.error(`Codex CLI compatibility check could not start ${codexBinary}: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  const diagnostic = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  console.error(`Codex CLI rejected Frankenbeast's workspace-write arguments (exit ${result.status}).`);
  if (diagnostic) console.error(diagnostic);
  process.exit(result.status ?? 1);
}

const help = `${result.stdout}\n${result.stderr}`;
if (!help.includes('workspace-write')) {
  console.error('Codex CLI help did not advertise the required workspace-write sandbox mode.');
  process.exit(1);
}

const version = spawnSync(codexBinary, ['--version'], { encoding: 'utf8', stdio: 'pipe' });
const versionText = `${version.stdout}\n${version.stderr}`.trim() || 'unknown version';
console.log(`Codex CLI compatibility check passed: ${versionText}`);
