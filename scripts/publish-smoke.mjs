#!/usr/bin/env node
/**
 * Publish smoke test — proves the packages install and run the way a real
 * `npm install` off the registry would, catching the class of bug that the
 * in-monorepo test suite hides via workspace hoisting:
 *   - phantom/undeclared runtime dependencies (import X without depending on X)
 *   - packages that ship no `dist` because they lack a `files` allowlist
 *   - broken/ missing bin targets
 *
 * It does NOT publish anything. It:
 *   1. builds the workspace,
 *   2. `npm pack`s every publishable package into a staging dir,
 *   3. installs the CLI + its workspace deps into a clean temp project
 *      OUTSIDE the monorepo, with optional deps omitted (so a missing
 *      optionalDependency like sharp must degrade gracefully, not crash),
 *   4. runs `frankenbeast --help` and asserts a clean exit + expected output.
 *
 * Run: node scripts/publish-smoke.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', ...opts });

function log(msg) {
  console.log(`[publish-smoke] ${msg}`);
}

// Packages whose install+run we assert. The orchestrator ships the
// `frankenbeast` CLI; its workspace deps must all resolve from local tarballs.
const CLI_DEP_DIRS = [
  'franken-types',
  'franken-observer',
  'franken-brain',
  'franken-planner',
  'franken-critique',
  'franken-governor',
  'franken-orchestrator',
];

function publishablePackages() {
  const dir = join(repoRoot, 'packages');
  const out = [];
  for (const name of readdirSync(dir)) {
    const pjPath = join(dir, name, 'package.json');
    let pj;
    try {
      pj = JSON.parse(readFileSync(pjPath, 'utf8'));
    } catch {
      continue;
    }
    if (pj.private) continue;
    out.push({ name, dir: join(dir, name), pkg: pj });
  }
  return out;
}

let failures = 0;
const fail = (msg) => {
  console.error(`[publish-smoke] FAIL: ${msg}`);
  failures += 1;
};

// 1. Build
log('building workspace…');
run('npx', ['turbo', 'run', 'build'], { cwd: repoRoot, stdio: 'inherit' });

// 2. Pack every publishable package into a staging dir
const stage = mkdtempSync(join(tmpdir(), 'fbeast-pack-'));
const pkgs = publishablePackages();
log(`packing ${pkgs.length} publishable packages → ${stage}`);
for (const p of pkgs) {
  run('npm', ['pack', '--pack-destination', stage], { cwd: p.dir });
  // Assert the tarball actually contains dist/ files (catches missing `files`
  // allowlist shipping an empty package).
  const dry = run('npm', ['pack', '--dry-run', '--json'], { cwd: p.dir });
  const files = JSON.parse(dry)[0].files.map((f) => f.path);
  const distCount = files.filter((f) => f.startsWith('dist/')).length;
  if (distCount === 0) {
    fail(`${p.name} packs 0 dist files — did you forget "files": ["dist"]?`);
  } else {
    log(`  ${p.name}: ${distCount} dist files`);
  }
}

// 3. Install the CLI + workspace deps into a clean temp project (no monorepo),
//    omitting optional deps so a missing optionalDependency must degrade.
const tarballFor = (dirName) => {
  const pj = JSON.parse(readFileSync(join(repoRoot, 'packages', dirName, 'package.json'), 'utf8'));
  const base = pj.name.replace('@', '').replace('/', '-');
  const hit = readdirSync(stage).find((f) => f.startsWith(`${base}-`) && f.endsWith('.tgz'));
  if (!hit) throw new Error(`no tarball for ${pj.name} (${base})`);
  return join(stage, hit);
};

const proj = mkdtempSync(join(tmpdir(), 'fbeast-install-'));
writeFileSync(join(proj, 'package.json'), JSON.stringify({ name: 'smoke', private: true }, null, 2));
const tarballs = CLI_DEP_DIRS.map(tarballFor);
log('installing packed CLI + deps (optional omitted) into a clean project…');
run('npm', ['install', '--no-audit', '--no-fund', '--omit=optional', ...tarballs], { cwd: proj, stdio: 'inherit' });

// 4. Run the installed CLI
log('running `frankenbeast --help` from the installed artifact…');
let help = '';
try {
  help = run(join(proj, 'node_modules', '.bin', 'frankenbeast'), ['--help'], { cwd: proj });
} catch (err) {
  fail(`frankenbeast --help crashed: ${err.stderr || err.message}`);
}
if (help && !/Usage: frankenbeast/.test(help)) {
  fail('frankenbeast --help did not print the expected usage banner');
} else if (help) {
  log('  CLI ran and printed usage ✓');
}

// Cleanup best-effort
for (const d of [stage, proj]) {
  try {
    rmSync(d, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

if (failures > 0) {
  console.error(`[publish-smoke] ${failures} failure(s)`);
  process.exit(1);
}
log('all publish smoke checks passed ✓');
