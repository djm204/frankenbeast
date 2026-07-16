#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function usage() {
  console.info(`Usage: npm run workspace:tour -- [--json] [--root <path>]

Prints a deterministic guided tour of the Frankenbeast workspace.
Human output is grouped for newcomers. JSON output exposes the same package map,
key docs, generated files, test commands, runtime state paths, safe first commands,
and docs-drift checks for agent prompts and PM handoffs.`);
}

function parseArgs(argv) {
  const options = { json: false, root: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--root') {
      const value = argv[i + 1];
      if (!value) throw new Error('--root requires a path');
      options.root = value;
      i += 1;
      continue;
    }
    if (arg?.startsWith('--root=')) {
      const value = arg.slice('--root='.length);
      if (!value) throw new Error('--root requires a path');
      options.root = value;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { ...options, root: resolve(options.root) };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function requireFrankenbeastRoot(root) {
  const manifest = readJson(resolve(root, 'package.json'));
  if (manifest?.name !== 'frankenbeast') {
    throw new Error(`${root} is not a Frankenbeast checkout; run from the repository root or pass --root <path>`);
  }
  return manifest;
}

function packageEntry(id, path, packageName, responsibility, commonTickets, testCommand, generatedFiles = [`${path}/dist/**`]) {
  return { id, path, packageName, responsibility, commonTickets, testCommand, generatedFiles };
}

function doc(id, path, purpose) {
  return { id, path, purpose };
}

function command(id, command, why) {
  return { id, command, why };
}

function stateDir(id, path, purpose, createdBy) {
  return { id, path, purpose, createdBy };
}

function afterDependencyBuild(packageName, command) {
  return `npx turbo run build --filter=${packageName}... && ${command}`;
}

function buildTour(root) {
  const manifest = requireFrankenbeastRoot(root);
  const packageManager = typeof manifest.packageManager === 'string' ? manifest.packageManager : 'npm from package.json';

  const packageMap = [
    packageEntry('types', 'packages/franken-types', '@franken/types', 'Shared TypeScript contracts, DTOs, schemas, and cross-package type exports.', ['contract drift', 'API envelope changes', 'shared schema updates'], 'npm run build --workspace @franken/types && npm run typecheck --workspace @franken/types'),
    packageEntry('orchestrator', 'packages/franken-orchestrator', '@franken/orchestrator', 'Beast Loop runtime, CLI/chat/dashboard backend, provider adapters, network config, approval and recovery flows.', ['runtime bugs', 'provider integration', 'chat/dashboard backend', 'network/security settings'], afterDependencyBuild('@franken/orchestrator', 'npm run build --workspace @franken/orchestrator && npm run typecheck --workspace @franken/orchestrator && npm test --workspace @franken/orchestrator')),
    packageEntry('mcp-suite', 'packages/franken-mcp-suite', '@franken/mcp-suite', 'fbeast CLI, MCP server registration, hooks, MCP adapters, and local client setup.', ['fbeast CLI', 'MCP install/uninstall', 'hook protocol', 'agent tool setup'], afterDependencyBuild('@franken/mcp-suite', 'npm run build --workspace @franken/mcp-suite && npm run test --workspace @franken/mcp-suite')),
    packageEntry('web', 'packages/franken-web', '@franken/web', 'Vite dashboard UI, chat/session hooks, browser API clients, and operator controls.', ['dashboard UX', 'chat UI', 'browser API proxy', 'accessibility'], afterDependencyBuild('@franken/web', 'npm run typecheck --workspace @franken/web && npm run test --workspace @franken/web && npm run build --workspace @franken/web')),
    packageEntry('planner', 'packages/franken-planner', '@franken/planner', 'Task graph planning, recovery ingestion, DAG/topological validation, and planner integration tests.', ['planning correctness', 'recovery tasks', 'DAG validation'], afterDependencyBuild('@franken/planner', 'npm run test --workspace @franken/planner && npm run test:integration --workspace @franken/planner')),
    packageEntry('brain', 'packages/franken-brain', '@franken/brain', 'SQLite-backed working memory, episodic event recall, recovery checkpoints, serialization, and hydration.', ['memory retrieval', 'context hydration', 'recovery checkpoints'], afterDependencyBuild('@franken/brain', 'npm run build --workspace @franken/brain && npm run test --workspace @franken/brain')),
    packageEntry('observer', 'packages/franken-observer', '@franken/observer', 'Tracing, cost accounting, token counting, exporters, metrics, and eval telemetry.', ['cost/token accounting', 'trace export', 'webhook/eval telemetry'], afterDependencyBuild('@franken/observer', 'npm run build --workspace @franken/observer && npm run typecheck --workspace @franken/observer && npm run test --workspace @franken/observer && npm run test:eval --workspace @franken/observer')),
    packageEntry('critique', 'packages/franken-critique', '@franken/critique', 'Critique/evaluation engines, scoring, and review feedback loops.', ['evaluation quality', 'review rubrics', 'critique scoring'], afterDependencyBuild('@franken/critique', 'npm run build --workspace @franken/critique && npm run test --workspace @franken/critique')),
    packageEntry('governor', 'packages/franken-governor', '@franken/governor', 'Policy checks, approval gates, command/tool risk controls, and signed approval endpoints.', ['approval policy', 'security gates', 'dangerous action detection'], afterDependencyBuild('@franken/governor', 'npm run build --workspace @franken/governor && npm run test --workspace @franken/governor')),
    packageEntry('live-bench', 'packages/live-bench', '@franken/live-bench', 'Live benchmark fixtures, scoring harnesses, and model/tool evaluation experiments.', ['benchmark scoring', 'eval fixtures', 'tool-call evidence'], afterDependencyBuild('@franken/live-bench', 'npm run test --workspace @franken/live-bench && npm run test:live:bench')),
  ];

  const keyDocs = [
    doc('onboarding', 'ONBOARDING.md', 'First-run setup, architecture reading path, worker preflight, local services, and dashboard bootstrap.'),
    doc('ramp-up', 'docs/RAMP_UP.md', 'Shortest current implementation map for agents; read before broad architecture or historical plans.'),
    doc('architecture', 'docs/ARCHITECTURE.md', 'Authoritative system overview, package table, Beast Loop, current CLI path, and dashboard/control-plane details.'),
    doc('contract-matrix', 'docs/CONTRACT_MATRIX.md', 'Cross-package interface boundaries and ports before changing shared contracts.'),
    doc('data-flow', 'docs/DATA_FLOW.md', 'Runtime handoff from input through planning, execution, observer records, and closure artifacts.'),
    doc('quickstart', 'docs/guides/quickstart.md', 'Copyable contributor bootstrap path.'),
    doc('test-decision-tree', 'docs/onboarding/test-command-decision-tree.md', 'Narrowest safe verification command selector.'),
    doc('repository-ownership', 'docs/onboarding/repository-ownership.md', 'Ownership and routing manifest guide for package/docs/workflow surfaces.'),
    doc('pr-etiquette', 'docs/onboarding/coding-agent-pr-etiquette.md', 'One-issue/one-PR etiquette, CI/Codex evidence, and handoff requirements.'),
  ];

  const safeFirstCommands = [
    command('tour-json', 'npm --silent run workspace:tour -- --json', 'Capture this same workspace tour without npm banners for agent prompts.'),
    command('worker-preflight', 'npm --silent run new-worker:preflight -- --json', 'Verify Node/npm/git/gh/jq, GitHub auth, git identity, root, and worktree cleanliness.'),
    command('checklist', 'npm --silent run first-run:checklist -- --persona coding-agent --json', 'Generate deterministic persona-specific first-run next steps.'),
    command('bootstrap-dry-run', './scripts/bootstrap.sh --dry-run', 'Preview setup checks without installing dependencies or mutating files.'),
    command('test-decision-tree', 'sed -n \'1,120p\' docs/onboarding/test-command-decision-tree.md', 'Pick the narrowest relevant verification gate before broad package or CI runs.'),
  ];

  const testCommands = [
    command('root-docs-and-script-tests', 'npm run test:root -- tests/local-setup-scripts.test.ts', 'Covers onboarding scripts, docs links, and root setup regressions.'),
    command('types-first', 'npm run build --workspace @franken/types', 'Build shared declarations before packages that import @franken/types/dist exports.'),
    command('all-typecheck', 'npm run typecheck', 'Run workspace typechecking through Turbo.'),
    command('all-build', 'npm run build', 'Build all workspace packages through Turbo.'),
    command('all-tests', 'npm test', 'Run all package test scripts through Turbo when a broad regression gate is required.'),
  ];

  const generatedFiles = [
    { path: 'packages/*/dist/**', producer: 'npm run build', note: 'Package build outputs; do not edit by hand.' },
    { path: 'coverage/**', producer: 'npm run test:coverage', note: 'Coverage artifacts generated by Vitest.' },
    { path: 'docs/onboarding/*.manifest.json', producer: 'Maintained structured docs manifests', note: 'Update together with matching Markdown guides when their source data changes.' },
    { path: '.turbo/**', producer: 'Turbo task cache', note: 'Local cache only; not source of truth.' },
  ];

  const runtimeStatePaths = [
    stateDir('beast-project-db', '.fbeast/beast.db', 'Per-project Beast runtime SQLite state shared by MCP and Beast modes.', 'runtime init / local CLI use'),
    stateDir('encrypted-secrets', '.fbeast/config.json + .fbeast/secrets.enc + .fbeast/secrets.meta.json', 'Default local encrypted secret-store config, encrypted vault, and key-derivation metadata; persist all three for CI/headless handoffs.', 'frankenbeast init / secret storage commands'),
    stateDir('env-file', '.env', 'Local runtime environment values copied from .env.example during bootstrap.', 'scripts/bootstrap.sh'),
    stateDir('compose-volumes', 'docker-compose volumes for chroma/grafana/tempo', 'Optional local service persistence.', 'docker compose up via bootstrap --services'),
    stateDir('test-temp', 'system temp directories', 'Transient test fixtures and runtime scratch data.', 'Vitest and integration tests'),
  ];

  const expectedPaths = [
    'package.json',
    'README.md',
    'ONBOARDING.md',
    'scripts/bootstrap.sh',
    'scripts/new-worker-preflight.mjs',
    'scripts/first-run-checklist.mjs',
    'scripts/workspace-tour.mjs',
    'tests/local-setup-scripts.test.ts',
    ...packageMap.map((entry) => entry.path),
    ...keyDocs.map((entry) => entry.path),
  ];

  const docsDrift = expectedPaths.map((path) => ({
    path,
    status: existsSync(resolve(root, path)) ? 'ok' : 'missing',
  }));

  return {
    root,
    packageManager,
    packageMap,
    keyDocs,
    generatedFiles,
    testCommands,
    runtimeStatePaths,
    safeFirstCommands,
    docsDrift,
    ok: docsDrift.every((entry) => entry.status === 'ok'),
  };
}

function renderHuman(tour) {
  const lines = [
    '# Frankenbeast workspace tour',
    '',
    `Repository root: ${tour.root}`,
    `Package manager: ${tour.packageManager}`,
    '',
    '## Package map',
  ];

  for (const entry of tour.packageMap) {
    lines.push(`- ${entry.packageName} (${entry.path})`);
    lines.push(`  - Owns: ${entry.responsibility}`);
    lines.push(`  - Ticket fit: ${entry.commonTickets.join('; ')}`);
    lines.push(`  - Focused test command: ${entry.testCommand}`);
  }

  lines.push('', '## Key docs');
  for (const entry of tour.keyDocs) lines.push(`- ${entry.path}: ${entry.purpose}`);

  lines.push('', '## Generated files');
  for (const entry of tour.generatedFiles) lines.push(`- ${entry.path}: produced by ${entry.producer}. ${entry.note}`);

  lines.push('', '## Runtime state paths');
  for (const entry of tour.runtimeStatePaths) lines.push(`- ${entry.path}: ${entry.purpose} Created by: ${entry.createdBy}.`);

  lines.push('', '## Safe first commands');
  for (const entry of tour.safeFirstCommands) lines.push(`- ${entry.command}: ${entry.why}`);

  lines.push('', '## Test commands');
  for (const entry of tour.testCommands) lines.push(`- ${entry.command}: ${entry.why}`);

  const missing = tour.docsDrift.filter((entry) => entry.status !== 'ok');
  lines.push('', '## Docs drift checks');
  if (missing.length === 0) {
    lines.push('- ok: all expected package/doc/script/test paths exist.');
  } else {
    for (const entry of missing) lines.push(`- missing: ${entry.path}`);
  }

  return lines.join('\n');
}

try {
  const options = parseArgs(process.argv.slice(2));
  const tour = buildTour(options.root);
  console.info(options.json ? JSON.stringify(tour, null, 2) : renderHuman(tour));
  process.exit(tour.ok ? 0 : 1);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`workspace tour failed: ${message}`);
  process.exit(2);
}
