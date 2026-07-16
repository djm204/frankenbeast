import { describe, expect, it } from 'vitest';
import { existsSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = join(import.meta.dirname, '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

function composeServices(): string[] {
  const services = new Set<string>();
  let inServices = false;
  for (const line of read('docker-compose.yml').split(/\r?\n/u)) {
    if (line === 'services:') {
      inServices = true;
      continue;
    }
    if (inServices && /^\S/u.test(line)) {
      break;
    }
    const match = inServices ? /^  ([a-z][\w-]*):$/u.exec(line) : null;
    if (match) {
      services.add(match[1]!);
    }
  }
  return [...services].sort();
}

function writeExecutable(path: string, body: string): void {
  writeFileSync(path, `#!/usr/bin/env bash\n${body}`);
  chmodSync(path, 0o755);
}

function makePreflightFixture(options: { includeJq?: boolean; npmVersion?: string; gitStatusFails?: boolean } = {}): { dir: string; root: string; bin: string } {
  const dir = mkdtempSync(join(tmpdir(), 'frankenbeast-new-worker-preflight-'));
  const root = join(dir, 'repo');
  const bin = join(dir, 'bin');
  mkdirSync(root, { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'frankenbeast', packageManager: 'npm@11.5.1' }));
  writeExecutable(join(bin, 'npm'), `printf '%s\\n' '${options.npmVersion ?? '11.5.1'}'\n`);
  writeExecutable(join(bin, 'gh'), `if [ \"$1\" = '--version' ]; then printf 'gh version 2.0.0\\n'; exit 0; fi\nif [ \"$1\" = 'auth' ] && [ \"$2\" = 'status' ] && [ \"$3\" = '--hostname' ] && [ \"$4\" = 'github.com' ]; then printf 'Logged in to github.com\\n'; exit 0; fi\nprintf 'unexpected gh args: %s %s %s %s\\n' \"$1\" \"$2\" \"$3\" \"$4\" >&2\nexit 1\n`);
  const statusBranch = options.gitStatusFails ? `printf 'index is unreadable\\n' >&2; exit 2` : 'exit 0';
  writeExecutable(join(bin, 'git'), `case \"$1\" in\n  --version) printf 'git version 2.53.0\\n' ;;\n  rev-parse) printf '%s\\n' '${root}' ;;\n  config) if [ \"$2\" = 'user.name' ]; then printf 'David Mendez\\n'; else printf 'me@davidmendez.dev\\n'; fi ;;\n  status) ${statusBranch} ;;\n  *) printf 'unexpected git args: %s %s\\n' \"$1\" \"$2\" >&2; exit 1 ;;\nesac\n`);
  if (options.includeJq !== false) {
    writeExecutable(join(bin, 'jq'), `printf 'jq-1.8.1\\n'\n`);
  }
  return { dir, root, bin };
}

describe('local setup scripts', () => {
  it('enforces a coherent Node.js minimum across workspace packages and local tooling', () => {
    const packagePaths = [
      'package.json',
      ...readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `packages/${entry.name}/package.json`)
        .filter((rel) => existsSync(join(ROOT, rel))),
    ];

    expect(read('.nvmrc').trim()).toBe('22.13.0');
    expect(read('.npmrc')).toContain('engine-strict=true');
    expect(read('README.md')).toContain('Node.js** `>=22.13.0 <23 || >=24.0.0 <26`');
    expect(read('README.md')).toContain('local default is pinned in [.nvmrc](.nvmrc)');
    expect(read('README.md')).toContain('**npm** 11.5.1 via the root `packageManager` pin');
    expect(read('docs/guides/run-cli-beast.md')).toContain('Corepack-enabled npm matching the root `packageManager` pin (`npm@11.5.1`)');
    expect(read('docs/guides/run-dashboard-chat.md')).toContain('Corepack-enabled npm matching the root `packageManager` pin (`npm@11.5.1`)');
    expect(read('docs/guides/deploy-beasts.md')).toContain('Corepack-enabled npm matching the root `packageManager` pin (`npm@11.5.1`)');
    expect(read('packages/franken-brain/README.md')).toContain('npm 11.5.1 via the repository `packageManager` setting');
    expect(read('docs/guides/quickstart.md')).toContain('npm run bootstrap -- --no-docker');
    expect(read('docs/guides/quickstart.md')).toContain('npm install -g corepack');
    expect(read('scripts/bootstrap.sh')).toContain('command -v corepack');
    expect(read('scripts/bootstrap.sh')).toContain('corepack enable npm');
    expect(read('scripts/bootstrap.sh')).toContain('corepack prepare "$expected_pm" --activate');

    for (const packagePath of packagePaths) {
      const manifest = JSON.parse(read(packagePath)) as { engines?: { node?: string } };
      expect(manifest.engines?.node).toBe('>=22.13.0 <23 || >=24.0.0 <26');
    }

    expect(read('scripts/verify-setup.ts')).toContain("check('Node.js >=22.13.0 <23 || >=24.0.0 <26'");
  });

  it('keeps root env example aligned with orchestrator runtime config overrides', () => {
    const envExample = read('.env.example');
    const readme = read('README.md');

    expect(envExample).toContain('CLI flags > FRANKEN_* env vars > config file > built-in defaults');
    expect(envExample).toContain('FRANKEN_ENABLE_REFLECTION         -> enableReflection');
    expect(envExample).toContain('boolean string; only "true" enables it; default false');
    expect(envExample).toMatch(/^FRANKEN_ENABLE_REFLECTION=false$/m);

    for (const frankenOverride of [
      'FRANKEN_MAX_TOTAL_TOKENS',
      'FRANKEN_MAX_DURATION_MS',
      'FRANKEN_MAX_CRITIQUE_ITERATIONS',
      'FRANKEN_ENABLE_HEARTBEAT',
      'FRANKEN_ENABLE_TRACING',
      'FRANKEN_ENABLE_REFLECTION',
      'FRANKEN_MIN_CRITIQUE_SCORE',
    ]) {
      expect(envExample).toContain(frankenOverride);
      expect(readme).toContain(frankenOverride);
    }
  });

  it('verify-setup checks the live Chroma v2 heartbeat and no removed firewall service', () => {
    const source = read('scripts/verify-setup.ts');

    expect(source).toContain('/api/v2/heartbeat');
    expect(source).not.toContain('/api/v1/heartbeat');
    expect(source).not.toContain('localhost:9090');
    expect(source).not.toContain('Firewall server');
  });

  it('keeps verify-setup aligned with the quickstart compose service contract', () => {
    const source = read('scripts/verify-setup.ts');
    const quickstart = read('docs/guides/quickstart.md');

    expect(composeServices()).toEqual(['chromadb', 'grafana', 'tempo']);
    expect(quickstart).toContain('This starts the services defined in `docker-compose.yml`');
    expect(quickstart).toContain('**ChromaDB** (port 8000)');
    expect(quickstart).toContain('**Grafana** (port 3000)');
    expect(quickstart).toContain('**Tempo** (ports 3200, 4317, 4318)');
    expect(quickstart).toContain('There is no `firewall` Docker service in the current compose file.');
    expect(read('README.md')).toContain('fixed compose defaults for Grafana (http://localhost:3000/api/health)');
    expect(read('README.md')).toContain('Tempo readiness (http://localhost:3200/ready)');
    expect(read('README.md')).toContain('.env.example intentionally does not define a TEMPO_ENDPOINT override');
    expect(source).toContain("await checkHttp('ChromaDB', `${chromaUrl}/api/v2/heartbeat`)");
    expect(source).toContain("await checkHttp('Grafana', 'http://localhost:3000/api/health')");
    expect(source).toContain("await checkHttp('Tempo', 'http://localhost:3200/ready')");
    expect(source).toContain('Some checks failed: ${failedChecks}');
    expect(source).toContain('for ChromaDB, Grafana, and Tempo');
    expect(source).not.toMatch(/localhost:9090|Firewall server/u);
  });

  it('verify-setup supports a dry-run that validates bootstrap prerequisites without probing services', () => {
    const source = read('scripts/verify-setup.ts');
    const packageJson = JSON.parse(read('package.json')) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.['bootstrap:dry-run']).toBe('tsx scripts/verify-setup.ts --dry-run --env-file .env.example');
    expect(source).toContain('--dry-run');
    expect(source).toContain('--env-file');
    expect(source).toContain('Required bootstrap env vars');
    expect(source).toContain('if (options.dryRun)');
    expect(source).toContain("envFile.get('CHROMA_URL')");
    expect(source).toContain("shell: process.platform === 'win32'");
    expect(source).toContain('Skipping live service probes in dry-run mode');
  });

  it('bootstrap dry-run succeeds against .env.example and fails when required env vars are missing', () => {
    const ok = spawnSync('npx', ['tsx', 'scripts/verify-setup.ts', '--dry-run', '--env-file', '.env.example'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(ok.status).toBe(0);
    expect(`${ok.stdout}\n${ok.stderr}`).toContain('Skipping live service probes in dry-run mode');

    const dir = mkdtempSync(join(tmpdir(), 'frankenbeast-verify-setup-'));
    try {
      const envPath = join(dir, '.env.missing');
      writeFileSync(envPath, 'CHROMA_URL=http://localhost:8000\n');
      const scrubbedEnv = { ...process.env };
      for (const key of [
        'CHROMA_URL',
        'FRANKEN_MAX_TOTAL_TOKENS',
        'FRANKEN_MAX_DURATION_MS',
        'FRANKEN_MAX_CRITIQUE_ITERATIONS',
        'FRANKEN_ENABLE_HEARTBEAT',
        'FRANKEN_ENABLE_TRACING',
        'FRANKEN_ENABLE_REFLECTION',
        'FRANKEN_MIN_CRITIQUE_SCORE',
      ]) {
        delete scrubbedEnv[key];
      }
      const missing = spawnSync('npx', ['tsx', 'scripts/verify-setup.ts', '--dry-run', '--env-file', envPath], {
        cwd: ROOT,
        encoding: 'utf8',
        env: scrubbedEnv,
      });

      expect(missing.status).not.toBe(0);
      expect(`${missing.stdout}\n${missing.stderr}`).toContain('Required bootstrap env vars');
      expect(`${missing.stdout}\n${missing.stderr}`).toContain('FRANKEN_MAX_TOTAL_TOKENS');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('seed script uses the Chroma v2 tenant/database collection API', () => {
    const source = read('scripts/seed.ts');

    expect(source).toContain('/api/v2/heartbeat');
    expect(source).toContain('/api/v2/tenants/${tenant}/databases/${database}/collections');
    expect(source).toContain("envFile.get('CHROMA_URL')");
    expect(source).toContain("default_tenant");
    expect(source).toContain("default_database");
    expect(source).not.toContain('/api/v1/collections');
    expect(source).not.toContain('/api/v1/heartbeat');
  });

  it('exposes discoverable npm scripts for local seed and setup verification', () => {
    const manifest = JSON.parse(read('package.json')) as { scripts?: Record<string, string> };
    const readme = read('README.md');
    const onboarding = read('ONBOARDING.md');
    const seedScript = read('scripts/seed.ts');
    const verifyScript = read('scripts/verify-setup.ts');

    expect(manifest.scripts?.['local:seed']).toBe('tsx scripts/seed.ts');
    expect(manifest.scripts?.['local:verify-setup']).toBe('tsx scripts/verify-setup.ts');
    expect(manifest.scripts?.['new-worker:preflight']).toBe('node scripts/new-worker-preflight.mjs');
    expect(manifest.scripts?.['first-run:checklist']).toBe('node scripts/first-run-checklist.mjs');
    expect(manifest.scripts?.['workspace:tour']).toBe('node scripts/workspace-tour.mjs');
    expect(readme).toContain('npm run local:seed');
    expect(readme).toContain('npm run local:verify-setup');
    expect(readme).toContain('npm --silent run new-worker:preflight -- --json');
    expect(readme).toContain('npm --silent run workspace:tour -- --json');
    expect(readme).toContain('npm run first-run:checklist -- --persona operator');
    expect(onboarding).toContain('npm run local:seed');
    expect(onboarding).toContain('npm run local:verify-setup');
    expect(onboarding).toContain('npm --silent run new-worker:preflight -- --json');
    expect(onboarding).toContain('npm --silent run first-run:checklist -- --persona coding-agent --json');
    expect(onboarding).toContain('npm run workspace:tour');
    expect(onboarding).toContain('docs-drift section reports missing expected package, doc, script, or test paths');
    expect(onboarding).toContain('Valid personas are `operator`, `coding-agent`, and `contributor`');
    expect(onboarding).toContain('[new-worker-preflight:<check>] ok|warn|fail');
    expect(read('docs/guides/quickstart.md')).toContain('npm run first-run:checklist -- --persona contributor');
    expect(read('docs/guides/quickstart.md')).toContain('npm --silent run workspace:tour -- --json');
    expect(seedScript).toContain('Usage: npm run local:seed');
    expect(verifyScript).toContain('Usage: npm run local:verify-setup');
  });

  it('workspace tour emits structured package map and docs-drift output', () => {
    const result = spawnSync(process.execPath, ['scripts/workspace-tour.mjs', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    const tour = JSON.parse(result.stdout) as {
      ok: boolean;
      packageMap: Array<{ id: string; path: string; packageName: string; responsibility: string; testCommand: string }>;
      keyDocs: Array<{ path: string; purpose: string }>;
      generatedFiles: Array<{ path: string; producer: string }>;
      runtimeStatePaths: Array<{ path: string; purpose: string }>;
      safeFirstCommands: Array<{ command: string; why: string }>;
      testCommands: Array<{ command: string; why: string }>;
      docsDrift: Array<{ path: string; status: string }>;
    };

    expect(tour.ok).toBe(true);
    expect(tour.packageMap).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'orchestrator',
        path: 'packages/franken-orchestrator',
        packageName: '@franken/orchestrator',
        testCommand: expect.stringContaining('npx turbo run build --filter=...@franken/orchestrator && npm run build --workspace @franken/orchestrator && npm run typecheck --workspace @franken/orchestrator && npm test --workspace @franken/orchestrator'),
      }),
      expect.objectContaining({ id: 'mcp-suite', packageName: '@franken/mcp-suite' }),
      expect.objectContaining({ id: 'web', packageName: '@franken/web' }),
    ]));
    expect(tour.keyDocs).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'ONBOARDING.md' }),
      expect.objectContaining({ path: 'docs/ARCHITECTURE.md' }),
      expect.objectContaining({ path: 'docs/onboarding/test-command-decision-tree.md' }),
    ]));
    expect(tour.generatedFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'packages/*/dist/**', producer: 'npm run build' }),
    ]));
    expect(tour.runtimeStatePaths).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '.fbeast/beast.db' }),
      expect.objectContaining({ path: '.fbeast/config.json + .fbeast/secrets.enc + .fbeast/secrets.meta.json' }),
    ]));
    expect(tour.safeFirstCommands).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: 'npm --silent run workspace:tour -- --json' }),
      expect.objectContaining({ command: 'npm --silent run new-worker:preflight -- --json' }),
      expect.objectContaining({ command: "sed -n '1,120p' docs/onboarding/test-command-decision-tree.md" }),
    ]));
    expect(tour.safeFirstCommands.some((entry) => entry.command.startsWith('open '))).toBe(false);
    expect(tour.testCommands).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: 'npm run test:root -- tests/local-setup-scripts.test.ts' }),
    ]));
    expect(tour.docsDrift.every((entry) => entry.status === 'ok')).toBe(true);
  });

  it('workspace tour renders human output and reports missing expected paths as docs drift', () => {
    const human = spawnSync(process.execPath, ['scripts/workspace-tour.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    expect(human.status, human.stderr).toBe(0);
    expect(human.stdout).toContain('# Frankenbeast workspace tour');
    expect(human.stdout).toContain('## Package map');
    expect(human.stdout).toContain('@franken/orchestrator (packages/franken-orchestrator)');
    expect(human.stdout).toContain('## Runtime state paths');
    expect(human.stdout).toContain('## Docs drift checks');
    expect(human.stdout).toContain('ok: all expected package/doc/script/test paths exist');

    const fixture = mkdtempSync(join(tmpdir(), 'frankenbeast-workspace-tour-drift-'));
    try {
      writeFileSync(join(fixture, 'package.json'), JSON.stringify({ name: 'frankenbeast', packageManager: 'npm@11.5.1' }));
      const drift = spawnSync(process.execPath, [join(ROOT, 'scripts/workspace-tour.mjs'), '--json', '--root', fixture], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      expect(drift.status).toBe(1);
      const report = JSON.parse(drift.stdout) as { ok: boolean; docsDrift: Array<{ path: string; status: string }> };
      expect(report.ok).toBe(false);
      expect(report.docsDrift).toContainEqual(expect.objectContaining({ path: 'ONBOARDING.md', status: 'missing' }));
      expect(report.docsDrift).toContainEqual(expect.objectContaining({ path: 'packages/franken-orchestrator', status: 'missing' }));
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('first-run checklist generator emits persona-specific structured output', () => {
    const result = spawnSync(process.execPath, ['scripts/first-run-checklist.mjs', '--json', '--persona', 'coding-agent'], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    const checklist = JSON.parse(result.stdout) as {
      persona: string;
      items: Array<{ id: string; phase: string; command?: string; docs: string[]; required: boolean }>;
      nextAction: string;
    };
    expect(checklist.persona).toBe('coding-agent');
    expect(checklist.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'worker-preflight', command: 'npm --silent run new-worker:preflight -- --json' }),
      expect.objectContaining({ id: 'architecture-reading-path', phase: 'Orientation' }),
      expect.objectContaining({ id: 'pr-etiquette', required: true }),
    ]));
    expect(checklist.items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'optional-services' }),
      expect.objectContaining({ id: 'operator-secrets' }),
    ]));
    expect(checklist.nextAction).toContain('worker preflight JSON command');
  });

  it('first-run checklist generator renders human Markdown for operators', () => {
    const result = spawnSync(process.execPath, ['scripts/first-run-checklist.mjs', '--persona=operator'], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('# Frankenbeast first-run checklist (operator)');
    expect(result.stdout).toContain('- [ ] **Start optional local infrastructure only when needed** (optional-services, optional)');
    expect(result.stdout).toContain('Command: `npm run bootstrap -- --services`');
    expect(result.stdout).not.toContain('coding-agent PR etiquette');
  });

  it('first-run checklist generator fails closed for unknown personas', () => {
    const result = spawnSync(process.execPath, ['scripts/first-run-checklist.mjs', '--persona', 'wizard'], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Unknown persona: wizard');
    expect(result.stdout).toBe('');
  });

  it('new-worker preflight emits structured success output for a ready worker environment', () => {
    const fixture = makePreflightFixture();
    try {
      const result = spawnSync(process.execPath, ['scripts/new-worker-preflight.mjs', '--json', '--root', fixture.root], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${fixture.bin}:${process.env.PATH ?? ''}` },
      });
      expect(result.status, result.stderr).toBe(0);
      const report = JSON.parse(result.stdout) as { ok: boolean; checks: Array<{ id: string; status: string; detail: string }> };
      expect(report.ok).toBe(true);
      expect(report.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'npm-package-manager', status: 'ok' }),
        expect.objectContaining({ id: 'git-identity', status: 'ok' }),
        expect.objectContaining({ id: 'github-auth', status: 'ok' }),
        expect.objectContaining({ id: 'jq-command', status: 'ok' }),
      ]));
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  it('new-worker preflight fails with actionable structured output when a required worker tool is missing', () => {
    const fixture = makePreflightFixture({ includeJq: false });
    try {
      const result = spawnSync(process.execPath, ['scripts/new-worker-preflight.mjs', '--json', '--root', fixture.root], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, PATH: fixture.bin },
      });
      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout) as { ok: boolean; checks: Array<{ id: string; status: string; action?: string }> };
      expect(report.ok).toBe(false);
      expect(report.checks).toContainEqual(expect.objectContaining({
        id: 'jq-command',
        status: 'fail',
        action: expect.stringContaining('Install jq'),
      }));
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  it('new-worker preflight rejects npm-managed repositories that are not Frankenbeast', () => {
    const fixture = makePreflightFixture();
    try {
      writeFileSync(join(fixture.root, 'package.json'), JSON.stringify({ name: 'not-frankenbeast', packageManager: 'npm@11.5.1' }));
      const result = spawnSync(process.execPath, ['scripts/new-worker-preflight.mjs', '--json', '--root', fixture.root], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${fixture.bin}:${process.env.PATH ?? ''}` },
      });
      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout) as { ok: boolean; checks: Array<{ id: string; status: string; detail: string }> };
      expect(report.ok).toBe(false);
      expect(report.checks).toContainEqual(expect.objectContaining({
        id: 'repository-root',
        status: 'fail',
        detail: expect.stringContaining('is not the Frankenbeast repository root'),
      }));
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  it('new-worker preflight fails when git worktree status cannot be read', () => {
    const fixture = makePreflightFixture({ gitStatusFails: true });
    try {
      const result = spawnSync(process.execPath, ['scripts/new-worker-preflight.mjs', '--json', '--root', fixture.root], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${fixture.bin}:${process.env.PATH ?? ''}` },
      });
      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout) as { ok: boolean; checks: Array<{ id: string; status: string; detail: string; action?: string }> };
      expect(report.ok).toBe(false);
      expect(report.checks).toContainEqual(expect.objectContaining({
        id: 'worktree-clean',
        status: 'fail',
        detail: 'unable to read git worktree status',
        action: expect.stringContaining('Repair the git checkout'),
      }));
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  it('provides a one-click bootstrap script and CI dry-run gate', () => {
    const manifest = JSON.parse(read('package.json')) as { scripts?: Record<string, string> };
    const scriptPath = join(ROOT, 'scripts/bootstrap.sh');
    const script = read('scripts/bootstrap.sh');
    const readme = read('README.md');
    const onboarding = read('ONBOARDING.md');
    const quickstart = read('docs/guides/quickstart.md');
    const ci = read('.github/workflows/ci.yml');

    expect(manifest.scripts?.bootstrap).toBe('bash scripts/bootstrap.sh');
    expect(statSync(scriptPath).mode & 0o111).not.toBe(0);
    expect(script).toContain('--dry-run');
    expect(script).toContain('--services');
    expect(script).toContain('Node.js >=22.13.0 <23 or >=24.0.0 <26');
    expect(script).toContain('cp .env.example .env');
    expect(script).toContain('default_keys');
    expect(script).toContain('GRAFANA_USER=admin');
    expect(script).toContain('npm ci');
    expect(script).toContain('docker compose up -d');
    expect(script).toContain('[onboarding:%s/%s:%s] %s');
    expect(script).toContain('status complete done');
    expect(readme).toContain('## 🚀 One-click onboarding');
    expect(readme).toContain('[Frankenbeast onboarding checklist](ONBOARDING.md)');
    expect(readme).toContain('[`scripts/bootstrap.sh`](scripts/bootstrap.sh)');
    expect(readme).toContain('npm run bootstrap -- --no-docker');
    expect(readme).toContain('./scripts/bootstrap.sh --dry-run');
    expect(onboarding).toMatch(/^---\ntitle: Frankenbeast Onboarding Checklist\ndescription: /);
    expect(onboarding).toContain('./scripts/bootstrap.sh --dry-run');
    expect(quickstart).toContain('./scripts/bootstrap.sh --dry-run');
    expect(ci).toContain('Validate bootstrap dry-run');
    expect(ci).toContain('./scripts/bootstrap.sh --dry-run');
    expect(ci.indexOf('./scripts/bootstrap.sh --dry-run')).toBeLessThan(ci.indexOf('npm ci'));

    const dryRun = spawnSync('bash', [scriptPath, '--dry-run'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 60_000,
    });
    expect(dryRun.status, dryRun.stderr || dryRun.stdout).toBe(0);
    expect(dryRun.stdout).toMatch(/dry-run: would copy \.env\.example to \.env|\.env already exists; leaving it unchanged\./);
    expect(dryRun.stdout).toContain('dry-run: npm ci');
    expect(dryRun.stdout).toContain('[onboarding:1/6:prerequisites] start - checking Node.js, npm, and Corepack');
    expect(dryRun.stdout).toContain('[onboarding:6/6:services] ok - optional services intentionally skipped');
    expect(dryRun.stdout).toContain('[onboarding:6/6:done] complete - onboarding bootstrap reached 6/6 steps');

    const invalidArgument = spawnSync('bash', [scriptPath, '--definitely-not-a-real-option'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 60_000,
    });
    expect(invalidArgument.status).not.toBe(0);
    expect(invalidArgument.stderr).toContain('[onboarding:0/6:args] error - Unknown argument: --definitely-not-a-real-option');

    const mismatchRoot = mkdtempSync(join(tmpdir(), 'franken-bootstrap-npm-mismatch-'));
    try {
      const binDir = join(mismatchRoot, 'bin');
      mkdirSync(join(mismatchRoot, 'scripts'));
      mkdirSync(binDir);
      writeFileSync(join(mismatchRoot, 'scripts/bootstrap.sh'), script);
      writeFileSync(join(mismatchRoot, 'package.json'), JSON.stringify({ packageManager: 'npm@11.5.1' }));
      writeFileSync(join(mismatchRoot, '.env.example'), 'CHROMA_URL=http://localhost:8000\n');
      writeFileSync(join(binDir, 'npm'), '#!/usr/bin/env bash\nprintf "10.0.0\\n"\n', { mode: 0o755 });
      writeFileSync(join(binDir, 'corepack'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });

      const mismatchDryRun = spawnSync('bash', [join(mismatchRoot, 'scripts/bootstrap.sh'), '--dry-run', '--no-docker'], {
        cwd: mismatchRoot,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` },
        timeout: 60_000,
      });
      expect(mismatchDryRun.status, mismatchDryRun.stderr || mismatchDryRun.stdout).toBe(0);
      expect(mismatchDryRun.stdout).toContain('[onboarding:2/6:package-manager] ok - npm 10.0.0 would be changed to npm@11.5.1 by Corepack');
      expect(mismatchDryRun.stdout).not.toContain('[onboarding:2/6:package-manager] ok - npm 10.0.0 matches npm@11.5.1');
    } finally {
      rmSync(mismatchRoot, { recursive: true, force: true });
    }

    const corepackFailureRoot = mkdtempSync(join(tmpdir(), 'franken-bootstrap-corepack-failure-'));
    try {
      const binDir = join(corepackFailureRoot, 'bin');
      mkdirSync(join(corepackFailureRoot, 'scripts'));
      mkdirSync(binDir);
      writeFileSync(join(corepackFailureRoot, 'scripts/bootstrap.sh'), script);
      writeFileSync(join(corepackFailureRoot, 'package.json'), JSON.stringify({ packageManager: 'npm@11.5.1' }));
      writeFileSync(join(corepackFailureRoot, '.env.example'), 'CHROMA_URL=http://localhost:8000\n');
      writeFileSync(join(binDir, 'npm'), '#!/usr/bin/env bash\nprintf "10.0.0\\n"\n', { mode: 0o755 });
      writeFileSync(join(binDir, 'corepack'), '#!/usr/bin/env bash\nexit 42\n', { mode: 0o755 });

      const corepackFailure = spawnSync('bash', [join(corepackFailureRoot, 'scripts/bootstrap.sh'), '--no-docker'], {
        cwd: corepackFailureRoot,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` },
        timeout: 60_000,
      });
      expect(corepackFailure.status).toBe(1);
      expect(corepackFailure.stderr).toContain('[onboarding:2/6:package-manager] error - Command failed: corepack prepare npm@11.5.1 --activate');
    } finally {
      rmSync(corepackFailureRoot, { recursive: true, force: true });
    }

    const dependencyFailureRoot = mkdtempSync(join(tmpdir(), 'franken-bootstrap-dependency-failure-'));
    try {
      const binDir = join(dependencyFailureRoot, 'bin');
      mkdirSync(join(dependencyFailureRoot, 'scripts'));
      mkdirSync(binDir);
      writeFileSync(join(dependencyFailureRoot, 'scripts/bootstrap.sh'), script);
      writeFileSync(join(dependencyFailureRoot, 'package.json'), JSON.stringify({ packageManager: 'npm@11.5.1' }));
      writeFileSync(join(dependencyFailureRoot, '.env.example'), 'CHROMA_URL=http://localhost:8000\n');
      writeFileSync(
        join(binDir, 'npm'),
        '#!/usr/bin/env bash\nif [[ "$1" == "--version" ]]; then printf "11.5.1\\n"; exit 0; fi\nexit 42\n',
        { mode: 0o755 },
      );
      writeFileSync(join(binDir, 'corepack'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });

      const dependencyFailure = spawnSync('bash', [join(dependencyFailureRoot, 'scripts/bootstrap.sh'), '--no-docker'], {
        cwd: dependencyFailureRoot,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` },
        timeout: 60_000,
      });
      expect(dependencyFailure.status).toBe(1);
      expect(dependencyFailure.stderr).toContain('[onboarding:5/6:dependencies] error - Command failed: npm ci');
    } finally {
      rmSync(dependencyFailureRoot, { recursive: true, force: true });
    }

    const servicesDryRun = spawnSync('bash', [scriptPath, '--dry-run', '--services'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 60_000,
    });
    expect(servicesDryRun.status, servicesDryRun.stderr || servicesDryRun.stdout).toBe(0);
    expect(servicesDryRun.stdout).toContain('dry-run: docker compose up -d');

    const invalidEnvRoot = mkdtempSync(join(tmpdir(), 'franken-bootstrap-invalid-env-'));
    try {
      mkdirSync(join(invalidEnvRoot, 'scripts'));
      writeFileSync(join(invalidEnvRoot, 'scripts/bootstrap.sh'), script);
      writeFileSync(join(invalidEnvRoot, 'package.json'), JSON.stringify({ packageManager: 'npm@11.5.1' }));
      writeFileSync(join(invalidEnvRoot, '.env.example'), 'GRAFANA_USER=admin\nGRAFANA_PASSWORD=change-me-random-grafana-password\n');
      writeFileSync(join(invalidEnvRoot, '.env'), 'GRAFANA_USER=admin\nGRAFANA_PASSWORD=admin\n');

      const invalidServicesDryRun = spawnSync('bash', [join(invalidEnvRoot, 'scripts/bootstrap.sh'), '--dry-run', '--services'], {
        cwd: invalidEnvRoot,
        encoding: 'utf8',
        timeout: 60_000,
      });
      expect(invalidServicesDryRun.status).not.toBe(0);
      expect(invalidServicesDryRun.stderr).toContain('requires GRAFANA_USER=admin and a unique non-default GRAFANA_PASSWORD');
      expect(invalidServicesDryRun.stdout).not.toContain('dry-run: npm ci');
    } finally {
      rmSync(invalidEnvRoot, { recursive: true, force: true });
    }
  });

  it('docker compose healthcheck targets the Chroma v2 heartbeat', () => {
    const compose = read('docker-compose.yml');

    expect(compose).toContain('/api/v2/heartbeat');
    expect(compose).toContain("'bash',");
    expect(compose).toContain('/dev/tcp/127.0.0.1/8000');
    expect(compose).not.toContain("'curl'");
    expect(compose).not.toContain('http://localhost:8000/api/v1/heartbeat');
  });

  it('pins local compose images and mounts an explicit Tempo config', () => {
    const compose = read('docker-compose.yml');
    const tempoConfig = read('tempo.yaml');

    expect(compose).toContain('image: chromadb/chroma:1.3.7');
    expect(compose).toContain('- chromadb-data:/data');
    expect(compose).toContain('image: grafana/grafana:12.3.8');
    expect(compose).toContain('image: grafana/tempo:2.9.3');
    expect(compose).not.toContain(':latest');
    expect(compose).toContain('- ./tempo.yaml:/etc/tempo.yaml:ro');
    expect(compose).toContain("command: ['-config.file=/etc/tempo.yaml']");

    expect(tempoConfig).toContain('http_listen_port: 3200');
    expect(tempoConfig).toContain('endpoint: 0.0.0.0:4317');
    expect(tempoConfig).toContain('endpoint: 0.0.0.0:4318');
    expect(tempoConfig).toContain('path: /tmp/tempo/wal');
    expect(tempoConfig).toContain('path: /tmp/tempo/blocks');
  });

  it('requires explicit non-default Grafana admin credentials for local compose', () => {
    const compose = read('docker-compose.yml');

    expect(compose).toContain('Set GRAFANA_USER and GRAFANA_PASSWORD before starting Grafana.');
    expect(compose).toContain('Refusing to start Grafana with admin/admin credentials.');
    expect(compose).toContain('admin reset-admin-password "$${GF_SECURITY_ADMIN_PASSWORD}"');
    expect(compose).toContain('GF_SECURITY_ADMIN_USER=${GRAFANA_USER:-}');
    expect(compose).toContain('GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-}');
    expect(compose).not.toContain('${GRAFANA_USER:-admin}');
    expect(compose).not.toContain('${GRAFANA_PASSWORD:-admin}');
    expect(compose).toContain('startup guard resets the persisted admin password');
  });

  it('.env.example documents current local env vars without removed service knobs', () => {
    const envExample = read('.env.example');
    const readme = read('README.md');
    const quickstart = read('docs/guides/quickstart.md');
    const runCliBeastGuide = read('docs/guides/run-cli-beast.md');
    const mcpSuiteReadme = read('packages/franken-mcp-suite/README.md');

    for (const required of [
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'GOOGLE_API_KEY',
      'GEMINI_API_KEY',
      'CHROMA_URL',
      'GRAFANA_USER',
      'GRAFANA_PASSWORD',
      'FRANKEN_MAX_TOTAL_TOKENS',
      'FRANKEN_MAX_DURATION_MS',
      'FRANKEN_MAX_CRITIQUE_ITERATIONS',
      'FRANKEN_ENABLE_HEARTBEAT',
      'FRANKEN_ENABLE_TRACING',
      'FRANKEN_ENABLE_REFLECTION',
      'FRANKEN_MIN_CRITIQUE_SCORE',
      'FRANKENBEAST_PASSPHRASE',
      'FRANKENBEAST_BEAST_OPERATOR_TOKEN',
      'FRANKENBEAST_BEAST_DAEMON_URL',
      'FRANKENBEAST_RUN_CONFIG',
      'FRANKENBEAST_MODULE_MEMORY',
      'FRANKENBEAST_MODULE_PLANNER',
      'FRANKENBEAST_MODULE_CRITIQUE',
      'FRANKENBEAST_MODULE_GOVERNOR',
      'FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES',
      'FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL',
    ]) {
      expect(envExample).toContain(required);
    }

    for (const removed of ['OLLAMA_BASE_URL', 'TEMPO_ENDPOINT', 'CHROMA_HOST', 'CHROMA_PORT', 'FIREWALL_PORT']) {
      expect(envExample).not.toContain(removed);
    }
    expect(envExample).not.toMatch(/^# ── Firewall Server ──$/m);
    expect(envExample).not.toMatch(/^#?\s*FIREWALL_PORT\s*=/m);
    expect(envExample).not.toMatch(/frankenfirewall|firewall proxy|port 9090/i);

    expect(readme).not.toMatch(/`CHROMA_HOST`|`CHROMA_PORT`|`FIREWALL_PORT`/);
    expect(readme).not.toMatch(/\|\s*`?(?:CHROMA_HOST|CHROMA_PORT|FIREWALL_PORT)`?\s*\|/);

    expect(envExample).not.toMatch(/^GRAFANA_USER=admin$/m);
    expect(envExample).not.toMatch(/^GRAFANA_PASSWORD=admin$/m);
    expect(envExample).toContain('Grafana\'s built-in admin/admin default is insecure');
    expect(envExample).toContain('Generate a unique local password before uncommenting');
    expect(envExample).toContain('Do not use VITE_BEAST_OPERATOR_TOKEN');
    expect(envExample).not.toMatch(/^#?\s*VITE_BEAST_OPERATOR_TOKEN=/m);

    for (const doc of [readme, quickstart, runCliBeastGuide]) {
      expect(doc).toContain('ANTHROPIC_API_KEY');
      expect(doc).toContain('OPENAI_API_KEY');
      expect(doc).toContain('GOOGLE_API_KEY');
      expect(doc).toContain('GEMINI_API_KEY');
    }

    expect(readme).toContain('CHROMA_URL');
    expect(readme).toContain('http://localhost:8000');
    expect(readme).toContain('Override it only when ChromaDB runs at a different local port/host or a remote');
    expect(readme).toContain('Local Tempo exposes OTLP/HTTP writes on http://localhost:4318');
    expect(readme).toContain('readiness on http://localhost:3200/ready');
    expect(readme).toContain('does not define a TEMPO_ENDPOINT override');
    expect(readme).toContain('TempoAdapter options');
    expect(readme).toContain('OLLAMA_BASE_URL');
    expect(readme).toContain('http://localhost:11434');
    expect(readme).toContain('not consumed by the current provider schema');
    expect(readme).toContain('intentionally absent from `.env.example`');
    expect(readme).toContain('CLI flags > `FRANKEN_*` env vars > config file > built-in defaults');
    expect(readme).toContain('maxCritiqueIterations * 10000');
    expect(readme).toContain('`frankenbeast init` configures the orchestrator/backend control plane');
    expect(readme).toContain('It is separate from `fbeast mcp init`');
    expect(readme).toContain('frankenbeast init --verify');
    expect(readme).toContain('review token prompts carefully');
    expect(readme).toContain('frankenbeast init --non-interactive');
    expect(readme).toContain('If you omit `network.secureBackend`, the config schema and init flow use `local-encrypted`');
    expect(readme).toContain('`os-keychain` is never selected automatically');
    expect(readme).toContain('Choose the secret backend before the first init run');
    expect(readme).toContain('{ "network": { "secureBackend": "os-keychain" } }');
    expect(readme).toContain('instead of the default encrypted file');
    expect(readme).toContain('{ "network": { "secureBackend": "1password" } }');
    expect(readme).toContain('{ "network": { "secureBackend": "bitwarden" } }');
    expect(readme).toContain('it applies the same `network.secureBackend` choice');
    expect(readme).toContain('Chat, Dashboard, and Comms modules');
    expect(readme).toContain('export FRANKENBEAST_PASSPHRASE=<passphrase>');
    expect(readme).toContain('frankenbeast run --config .fbeast/config.json');
    expect(readme).toContain('does not prove every completed step');
    expect(readme).toContain('create a fresh vault, answer wizard prompts, decrypt the secret vault, or resolve secret refs');
    expect(readme).toContain('does not resolve secret refs');
    expect(readme).toContain('leaving it blank can generate a replacement token');
    expect(mcpSuiteReadme).toContain('FRANKENBEAST_CONFIG_FILE=/path/to/your-project/.fbeast/config.json');
    expect(mcpSuiteReadme).toContain('or `FRANKENBEAST_CONFIG_PATH`');
    expect(mcpSuiteReadme).toContain('FRANKENBEAST_PASSPHRASE');
    expect(mcpSuiteReadme).toContain('does not move the local encrypted vault root');
    for (const frankenOverride of [
      'FRANKEN_MAX_TOTAL_TOKENS',
      'FRANKEN_MAX_DURATION_MS',
      'FRANKEN_MAX_CRITIQUE_ITERATIONS',
      'FRANKEN_ENABLE_HEARTBEAT',
      'FRANKEN_ENABLE_TRACING',
      'FRANKEN_ENABLE_REFLECTION',
      'FRANKEN_MIN_CRITIQUE_SCORE',
    ]) {
      expect(readme).toContain(frankenOverride);
    }
  });

  it('scaffolds the quick-start example into a fresh project and runs npm ci', () => {
    const packageJson = JSON.parse(read('package.json')) as { scripts?: Record<string, string> };
    const scriptPath = join(ROOT, 'scripts/create-project.sh');
    const script = read('scripts/create-project.sh');
    const tempRoot = mkdtempSync(join(tmpdir(), 'frankenbeast-create-project-'));
    const target = join(tempRoot, 'quick-start-app');

    try {
      expect(packageJson.scripts?.['create:project']).toBe('bash scripts/create-project.sh');
      expect(statSync(scriptPath).mode & 0o111).not.toBe(0);
      expect(script).toContain('examples/$example_name');
      expect(script).toContain('npm ci');
      expect(script).toContain('.env.example');
      expect(script).not.toContain('-printf');
      expect(existsSync(join(ROOT, 'examples/quick-start/package-lock.json'))).toBe(true);
      expect(read('README.md')).toContain('npm run create:project -- quick-start');
      expect(read('ONBOARDING.md')).toContain('npm run create:project -- quick-start');

      const dotExample = spawnSync('bash', [scriptPath, '..', join(tempRoot, 'dot-example')], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 60_000,
      });
      expect(dotExample.status).toBe(64);
      expect(dotExample.stderr).toContain('Invalid example name: ..');

      const realTarget = join(tempRoot, 'real-target');
      const linkedTarget = join(tempRoot, 'linked-target');
      mkdirSync(realTarget);
      writeFileSync(join(realTarget, 'README.md'), 'existing project\n');
      symlinkSync(realTarget, linkedTarget, 'dir');
      const symlinkResult = spawnSync('bash', [scriptPath, 'quick-start', linkedTarget], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 60_000,
      });
      expect(symlinkResult.status).toBe(73);
      expect(symlinkResult.stderr).toContain('Target directory is not empty');

      const result = spawnSync('bash', [scriptPath, 'quick-start', target], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 120_000,
      });

      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(result.stdout).toContain('Created Frankenbeast example project');
      expect(result.stdout).toContain('Env:     .env created');
      expect(existsSync(join(target, '.env'))).toBe(true);
      expect(existsSync(join(target, 'package-lock.json'))).toBe(true);
      expect(result.stdout).toContain('up to date');

      const scaffoldManifest = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')) as {
        scripts?: Record<string, string>;
      };
      expect(scaffoldManifest.scripts?.start).toBe('node --env-file=.env src/index.js');
      writeFileSync(join(target, '.env'), 'FRANKENBEAST_EXAMPLE_MESSAGE=Custom scaffold message\n');

      const start = spawnSync('npm', ['start'], {
        cwd: target,
        encoding: 'utf8',
        timeout: 60_000,
      });

      expect(start.status, start.stderr || start.stdout).toBe(0);
      expect(start.stdout).toContain('Custom scaffold message');
    } finally {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  it('keeps the CLI Beast guide aligned with supported Beast activation providers', () => {
    const runCliBeastGuide = read('docs/guides/run-cli-beast.md');
    const beastModeSource = read('packages/franken-mcp-suite/src/cli/beast-mode.ts');
    const providerConfigSource = read('packages/franken-orchestrator/src/providers/provider-config.ts');

    expect(runCliBeastGuide).toContain('`OLLAMA_BASE_URL` is a legacy/forward-looking endpoint variable');
    expect(runCliBeastGuide).toContain('Setting `OLLAMA_BASE_URL` alone will not enable an Ollama-backed run in this build');
    expect(runCliBeastGuide).toContain('http://localhost:11434');
    expect(runCliBeastGuide).toContain('intentionally leaves `OLLAMA_BASE_URL` out');
    expect(runCliBeastGuide).toContain('current provider schema');
    expect(runCliBeastGuide).toContain('GOOGLE_API_KEY` / `GEMINI_API_KEY` for `gemini-api`');
    expect(runCliBeastGuide).toContain('anthropic-api');
    expect(runCliBeastGuide).toContain('openai-api');
    expect(runCliBeastGuide).toContain('gemini-api');
    expect(runCliBeastGuide).toContain('fbeast mcp beast --provider=anthropic-api');
    expect(runCliBeastGuide).toContain('fbeast mcp beast --provider=codex-cli');
    expect(runCliBeastGuide).toContain('fbeast mcp beast --provider=claude-cli');

    const providerTypesMatch = providerConfigSource.match(/PROVIDER_TYPES = \[([\s\S]*?)\] as const/);
    expect(providerTypesMatch).not.toBeNull();
    const providerTypes = providerTypesMatch?.[1] ?? '';
    for (const providerType of [
      'claude-cli',
      'codex-cli',
      'gemini-cli',
      'anthropic-api',
      'openai-api',
      'gemini-api',
    ]) {
      expect(providerTypes).toContain(providerType);
      expect(runCliBeastGuide).toContain(providerType);
    }
    expect(providerTypes).not.toMatch(/ollama/i);

    const providersMatch = beastModeSource.match(/SUPPORTED_BEAST_PROVIDERS = new Set\(\[([^\]]+)\]\)/);
    expect(providersMatch).not.toBeNull();
    const supportedProviders = providersMatch?.[1] ?? '';
    for (const provider of ['anthropic-api', 'codex-cli', 'claude-cli']) {
      expect(supportedProviders).toContain(provider);
      expect(runCliBeastGuide).toContain(`--provider=${provider}`);
    }
    expect(supportedProviders).not.toContain('ollama');
  });

  it('keeps the CLI Beast guide aligned with documented orchestrator and fbeast flags', () => {
    const runCliBeastGuide = read('docs/guides/run-cli-beast.md');
    const orchestratorArgs = read('packages/franken-orchestrator/src/cli/args.ts');
    const fbeastCli = read('packages/franken-mcp-suite/src/cli/main.ts');

    const documentedFlags = [
      '--base-dir',
      '--base-branch',
      '--budget',
      '--provider',
      '--providers',
      '--trust-provider-command-overrides',
      '--design-doc',
      '--plan-dir',
      '--plan-name',
      '--config',
      '--host',
      '--port',
      '--allow-origin',
      '--no-pr',
      '--verbose',
      '--reset',
      '--resume',
      '--cleanup',
      '--verify',
      '--repair',
      '--non-interactive',
      '--backend',
      '--help',
      '--label',
      '--milestone',
      '--search',
      '--assignee',
      '--limit',
      '--repo',
      '--target-upstream',
      '--dry-run',
      '--mode <mode>',
      '--no-firewall',
      '--no-skills',
      '--no-memory',
      '--no-planner',
      '--no-critique',
      '--no-governor',
      '--no-heartbeat',
      '--set',
      '--client=',
      '--pick',
      '--mode=standard|proxy',
      '--hooks',
      '--purge',
      '--provider=<anthropic-api|codex-cli|claude-cli>',
    ];

    for (const flag of documentedFlags) {
      expect(runCliBeastGuide).toContain(flag);
    }

    for (const parserFlag of [
      'trust-provider-command-overrides',
      'no-firewall',
      'no-skills',
      'no-memory',
      'no-planner',
      'no-critique',
      'no-governor',
      'no-heartbeat',
      'target-upstream',
      'dry-run',
      'allow-origin',
    ]) {
      expect(orchestratorArgs).toContain(parserFlag);
      expect(runCliBeastGuide).toContain(`--${parserFlag}`);
    }

    for (const fbeastFlag of ['--hooks', '--pick', '--client', '--mode', '--purge']) {
      expect(fbeastCli).toContain(fbeastFlag);
    }
    expect(runCliBeastGuide).toContain('network config');
    expect(runCliBeastGuide).toContain('fbeast mcp init');
    expect(runCliBeastGuide).toContain('fbeast mcp uninstall');
  });

  it('keeps the root README provider-extension guidance on current provider surfaces', () => {
    const readme = read('README.md');

    expect(readme).not.toContain('Adding a new provider means implementing one `IAdapter` interface');
    expect(readme).not.toContain('implement `IAdapter` in 4 steps');
    expect(readme).not.toMatch(/firewall is a model-agnostic proxy/i);
    expect(readme).toContain('CLI execution/chat providers implement `ICliProvider`');
    expect(readme).toContain('API-backed clients live in the provider registry and config loading paths');
    expect(readme).toContain(
      'add CLI execution providers through `ICliProvider` or API-backed clients through the provider registry',
    );
  });

  it('keeps root AI assistant rule regeneration guidance on the supported workflow source', () => {
    for (const docPath of ['CLAUDE.md', 'GEMINI.md']) {
      const doc = read(docPath);

      expect(doc).toContain('djm204/agent-workflow-skills');
      expect(doc).toContain('package-level `project-outline.md` cleanup is tracked separately');
      expect(doc).toContain('Do not regenerate the root `.cursor/rules/*.mdc` files');
      expect(doc).not.toContain('npx @djm204/agent-skills');
      expect(doc).not.toMatch(/Re-run to update:/i);
    }
  });

  it('keeps CLAUDE.md workspace package map aligned with live package manifests', () => {
    const claudeGuide = read('CLAUDE.md');
    const packageDirs = readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((dir) => existsSync(join(ROOT, 'packages', dir, 'package.json')))
      .sort();

    const packageScopes = packageDirs.map((dir) => {
      const manifest = JSON.parse(read(`packages/${dir}/package.json`)) as { name: string };
      return manifest.name;
    });

    expect(packageDirs).toEqual([
      'franken-brain',
      'franken-critique',
      'franken-governor',
      'franken-mcp-suite',
      'franken-observer',
      'franken-orchestrator',
      'franken-planner',
      'franken-types',
      'franken-web',
      'live-bench',
    ]);

    for (const dir of packageDirs) {
      expect(claudeGuide).toContain(`${dir}/`);
    }
    for (const scope of packageScopes) {
      expect(claudeGuide).toContain(scope);
    }

    expect(claudeGuide).toContain('The root `package.json` declares `packages/*`');
    expect(claudeGuide).toContain('@franken/types');
    expect(claudeGuide).not.toContain('@frankenbeast/types');
    expect(claudeGuide).toContain('not standalone workspaces anymore');
  });
});
