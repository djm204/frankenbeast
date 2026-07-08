#!/usr/bin/env node
/**
 * Workspace dependency hygiene guard.
 *
 * Fails if any publishable package declares an internal `@franken/*` dependency
 * with a `"*"` specifier. `*` only resolves via local workspace linking; once
 * published it means "latest of whatever exists", giving no version coherence
 * and breaking off-registry installs. release-please rewrites pinned versions,
 * so `*` must never reappear.
 *
 * Run: node scripts/check-workspace-deps.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgsDir = join(repoRoot, 'packages');

let failures = 0;
for (const name of readdirSync(pkgsDir)) {
  let pj;
  try {
    pj = JSON.parse(readFileSync(join(pkgsDir, name, 'package.json'), 'utf8'));
  } catch {
    continue;
  }
  const groups = ['dependencies', 'optionalDependencies', 'peerDependencies'];
  for (const g of groups) {
    for (const [dep, spec] of Object.entries(pj[g] ?? {})) {
      if (dep.startsWith('@franken/') && spec === '*') {
        console.error(`FAIL: ${pj.name} → ${g}.${dep} is "*" (must be a pinned version, not a wildcard)`);
        failures += 1;
      }
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} wildcard internal-dependency specifier(s) found.`);
  process.exit(1);
}
console.log('workspace dependency hygiene OK — no "*" internal specifiers');
