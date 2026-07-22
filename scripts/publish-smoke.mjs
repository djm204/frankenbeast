#!/usr/bin/env node
/**
 * Publish smoke test — proves the packages install and run the way a real
 * `npm install` off the registry would, catching the class of bug that the
 * in-monorepo test suite hides via workspace hoisting:
 *   - packages that ship no `dist` because they lack a `files` allowlist,
 *   - published `bin` targets missing from the tarball,
 *   - a CLI that crashes at startup (e.g. a missing optionalDependency).
 *
 * Undeclared/phantom *dependencies* are caught separately and more precisely by
 * scripts/check-phantom-deps.mjs (static AST scan); this script complements it
 * with a real pack + install + execute.
 *
 * It does NOT publish anything. It:
 *   1. builds the workspace,
 *   2. `npm pack`s every publishable package into a staging dir (asserting each
 *      ships dist/ files),
 *   3. installs the packages that carry bins + their workspace deps into a
 *      clean temp project OUTSIDE the monorepo, with optional deps omitted (so
 *      a missing optionalDependency must degrade, not crash),
 *   4. verifies the clean consumer resolves a patched Hono node server,
 *   5. audits that dependency tree for high/critical advisories,
 *   6. asserts every declared bin file exists, and runs each executable CLI's
 *      `--help`, asserting a clean exit and non-empty output.
 *
 * Run: node scripts/publish-smoke.mjs
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', ...opts });
const log = (msg) => console.log(`[publish-smoke] ${msg}`);

export function cleanupTempDirs(dirs) {
  for (const d of dirs.filter(Boolean)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore cleanup failures */
    }
  }
}

export function runWithTempCleanup(getDirs, action) {
  try {
    return action();
  } finally {
    cleanupTempDirs(getDirs());
  }
}

export function isDirectRun(metaUrl, argvPath = process.argv[1], realpath = realpathSync) {
  if (!argvPath) return false;
  return fileURLToPath(metaUrl) === realpath(argvPath);
}

const MINIMUM_HONO_NODE_SERVER = [2, 0, 10];

export function assertPatchedHonoTree(tree) {
  const versions = [];
  const visit = (node) => {
    for (const [name, dependency] of Object.entries(node?.dependencies ?? {})) {
      if (name === '@hono/node-server' && dependency?.version) versions.push(dependency.version);
      visit(dependency);
    }
  };
  visit(tree);
  if (versions.length === 0) {
    throw new Error('@hono/node-server is missing from the packed consumer dependency tree');
  }

  for (const version of versions) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
    if (!match) throw new Error(`invalid @hono/node-server version: ${version}`);
    const resolved = match.slice(1).map(Number);
    for (let index = 0; index < MINIMUM_HONO_NODE_SERVER.length; index += 1) {
      if (resolved[index] > MINIMUM_HONO_NODE_SERVER[index]) break;
      if (resolved[index] < MINIMUM_HONO_NODE_SERVER[index]) {
        throw new Error(`@hono/node-server ${version} is below required 2.0.10`);
      }
    }
  }
  return [...new Set(versions)].join(', ');
}

// Packages we install + run. web is a browser SPA (no runtime bin) so it is
// packed/dist-checked but not installed for execution here.
const RUNTIME_DIRS = [
  'franken-types',
  'franken-observer',
  'franken-brain',
  'franken-planner',
  'franken-critique',
  'franken-governor',
  'franken-orchestrator',
  'franken-mcp-suite',
  'live-bench',
];

// Executable CLIs whose `--help` must run cleanly. Stdio-server bins
// (e.g. fbeast-mcp) are asserted to exist but not executed.
const EXECUTABLE_BINS = [
  { bin: 'frankenbeast', mustMatch: /Usage: frankenbeast/ },
  { bin: 'fbeast' },
  { bin: 'fbeast-live-bench' },
];

function publishablePackages() {
  const dir = join(repoRoot, 'packages');
  const out = [];
  for (const name of readdirSync(dir)) {
    let pj;
    try {
      pj = JSON.parse(readFileSync(join(dir, name, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    if (!pj.private) out.push({ name, dir: join(dir, name), pkg: pj });
  }
  return out;
}

export function main() {
  let failures = 0;
  const fail = (msg) => {
    console.error(`[publish-smoke] FAIL: ${msg}`);
    failures += 1;
  };
  let stage;
  let proj;

  runWithTempCleanup(() => [stage, proj], () => {
    // 1. Build
    log('building workspace…');
    run('npx', ['turbo', 'run', 'build'], { cwd: repoRoot, stdio: 'inherit' });

    // 2. Pack + assert dist ships
    stage = mkdtempSync(join(tmpdir(), 'fbeast-pack-'));
    const pkgs = publishablePackages();
    log(`packing ${pkgs.length} publishable packages → ${stage}`);
    for (const p of pkgs) {
      run('npm', ['pack', '--pack-destination', stage], { cwd: p.dir });
      const dry = run('npm', ['pack', '--dry-run', '--json'], { cwd: p.dir });
      const distCount = JSON.parse(dry)[0].files.filter((f) => f.path.startsWith('dist/')).length;
      if (distCount === 0) fail(`${p.name} packs 0 dist files — did you forget "files": ["dist"]?`);
      else log(`  ${p.name}: ${distCount} dist files`);
    }

    const tarballFor = (dirName) => {
      const pj = JSON.parse(readFileSync(join(repoRoot, 'packages', dirName, 'package.json'), 'utf8'));
      const base = pj.name.replace('@', '').replace('/', '-');
      const hit = readdirSync(stage).find((f) => f.startsWith(`${base}-`) && f.endsWith('.tgz'));
      if (!hit) throw new Error(`no tarball for ${pj.name} (${base})`);
      return join(stage, hit);
    };

    // 3. Install into a clean project outside the monorepo, optional deps omitted.
    proj = mkdtempSync(join(tmpdir(), 'fbeast-install-'));
    writeFileSync(join(proj, 'package.json'), JSON.stringify({ name: 'smoke', private: true }, null, 2));
    log('installing packed packages (optional omitted) into a clean project…');
    run('npm', ['install', '--no-audit', '--no-fund', '--omit=optional', ...RUNTIME_DIRS.map(tarballFor)], {
      cwd: proj,
      stdio: 'inherit',
    });

    // Root-workspace overrides are not inherited by consumers. Verify the
    // published manifest resolves the patched Hono line in this external tree.
    const honoTree = JSON.parse(run('npm', ['ls', '--json', '--all'], { cwd: proj }));
    const honoVersion = assertPatchedHonoTree(honoTree);
    log(`  packed consumer resolves @hono/node-server@${honoVersion} ✓`);

    // Audit the clean
    // packed install so a remediation cannot pass only because the monorepo's
    // root dependency policy masked a vulnerable published dependency tree.
    log('auditing the clean packed consumer dependency tree…');
    run('npm', ['audit', '--omit=dev', '--audit-level=high'], { cwd: proj, stdio: 'inherit' });
    log('  packed consumer audit has no high/critical advisories ✓');

    // 6a. Every declared bin file must exist in the installed package.
    for (const dirName of RUNTIME_DIRS) {
      const pj = JSON.parse(readFileSync(join(repoRoot, 'packages', dirName, 'package.json'), 'utf8'));
      for (const [binName, binPath] of Object.entries(pj.bin ?? {})) {
        const installed = join(proj, 'node_modules', pj.name, binPath);
        if (!existsSync(installed)) fail(`${pj.name} bin "${binName}" → ${binPath} missing from the installed package`);
      }
    }

    // 6b. Each executable CLI's --help must exit cleanly with non-empty output.
    // Put the project's node_modules/.bin on PATH so a bin that shells out to a
    // sibling bin (e.g. `fbeast` forwards non-mcp commands to `frankenbeast`)
    // resolves it — exactly as a real co-install does, where every package bin
    // lands in the same PATH-visible directory.
    const binDir = join(proj, 'node_modules', '.bin');
    const childEnv = { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` };
    for (const { bin, mustMatch } of EXECUTABLE_BINS) {
      const binFile = join(binDir, bin);
      if (!existsSync(binFile)) {
        fail(`bin "${bin}" was not linked into node_modules/.bin`);
        continue;
      }
      const res = spawnSync(binFile, ['--help'], { cwd: proj, env: childEnv, encoding: 'utf8', timeout: 30_000 });
      if (res.error) fail(`${bin} --help failed to run: ${res.error.message}`);
      else if (res.status !== 0) fail(`${bin} --help exited ${res.status}\n${(res.stderr || '').slice(0, 500)}`);
      else if (!(res.stdout || '').trim()) fail(`${bin} --help produced no stdout`);
      else if (mustMatch && !mustMatch.test(res.stdout)) fail(`${bin} --help output did not match ${mustMatch}`);
      else log(`  ${bin} --help ran and printed output ✓`);
    }
  });

  if (failures > 0) {
    console.error(`[publish-smoke] ${failures} failure(s)`);
    process.exit(1);
  }
  log('all publish smoke checks passed ✓');
}

if (isDirectRun(import.meta.url)) {
  main();
}
