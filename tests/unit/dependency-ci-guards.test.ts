import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');
const OUTDATED_SCRIPT = resolve(ROOT, 'scripts/check-major-outdated.mjs');
const DEPENDABOT_SUPPLY_CHAIN_SCRIPT = resolve(ROOT, 'scripts/check-dependabot-supply-chain.mjs');

function writeJson(value: unknown, filename = 'outdated.json') {
  const dir = mkdtempSync(join(tmpdir(), 'franken-outdated-'));
  const file = join(dir, filename);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return file;
}

function writeText(content: string, filename: string) {
  const dir = mkdtempSync(join(tmpdir(), 'franken-dependabot-'));
  const file = join(dir, filename);
  writeFileSync(file, content, 'utf8');
  return file;
}

function runOutdatedGuard(report: unknown, baseline: unknown = []) {
  return spawnSync(process.execPath, [OUTDATED_SCRIPT, '--input', writeJson(report), '--baseline', writeJson(baseline, 'baseline.json')], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

function runDependabotSupplyChainGuard(config: string) {
  return spawnSync(process.execPath, [DEPENDABOT_SUPPLY_CHAIN_SCRIPT, '--config', writeText(config, 'dependabot.yml')], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

describe('dependency CI guards for issue #1414', () => {
  it('fails only for dependencies with latest versions on a newer major', () => {
    const result = runOutdatedGuard({
      acorn: {
        current: '8.17.0',
        wanted: '8.17.1',
        latest: '8.17.1',
        location: 'node_modules/acorn',
      },
      vite: {
        current: '8.1.3',
        wanted: '9.0.0',
        latest: '9.0.0',
        location: 'node_modules/vite',
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('vite');
    expect(result.stderr).toContain('current 8.1.3');
    expect(result.stderr).not.toContain('acorn');
  });

  it('flattens npm workspace arrays before checking major gaps', () => {
    const result = runOutdatedGuard({
      zod: [
        {
          current: '3.25.0',
          wanted: '4.0.0',
          latest: '4.2.0',
          location: 'packages/franken-web/node_modules/zod',
        },
        {
          current: '3.25.0',
          wanted: '3.25.1',
          latest: '4.2.0',
          location: 'packages/franken-orchestrator/node_modules/zod',
        },
      ],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('zod');
    expect(result.stderr).toContain('packages/franken-web');
  });

  it('fails closed when npm outdated returns an error JSON object', () => {
    const result = runOutdatedGuard({ error: { code: 'E403', summary: 'forbidden' } });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('npm outdated reported an error');
    expect(result.stderr).toContain('E403');
  });

  it('passes when existing direct major gaps match the approved baseline', () => {
    const report = {
      react: {
        current: '18.3.1',
        wanted: '18.3.1',
        latest: '19.2.7',
        location: 'packages/franken-web/node_modules/react',
        dependent: 'franken-web',
      },
    };

    const result = runOutdatedGuard(report, [{ name: 'react', dependent: 'franken-web', location: 'packages/franken-web/node_modules/react', currentMajor: 18, latestMajor: 19 }]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('baseline-approved major gap');
  });

  it('does not let one baseline entry approve another workspace location', () => {
    const result = runOutdatedGuard(
      {
        react: [
          {
            current: '18.3.1',
            wanted: '18.3.1',
            latest: '19.2.7',
            location: 'node_modules/react',
            dependent: 'franken-web',
          },
          {
            current: '18.3.1',
            wanted: '18.3.1',
            latest: '19.2.7',
            location: 'node_modules/react',
            dependent: 'franken-new',
          },
        ],
      },
      [{ name: 'react', dependent: 'franken-web', location: 'node_modules/react', currentMajor: 18, latestMajor: 19 }],
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('franken-new');
    expect(result.stderr).toContain('node_modules/react');
  });

  it('passes when dependencies are only behind within their current major', () => {
    const result = runOutdatedGuard({
      typescript: {
        current: '5.9.3',
        wanted: '5.9.4',
        latest: '5.9.4',
        location: 'node_modules/typescript',
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('no unapproved direct dependencies are behind the latest major release');
  });

  it('fails dependabot configs that allow registry-driven internal workspace updates', () => {
    const result = runDependabotSupplyChainGuard(`
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    groups:
      all-npm:
        patterns:
          - "*"
`);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('@franken/*');
    expect(result.stderr).toContain('exclude-patterns');
    expect(result.stderr).toContain('must ignore');
  });

  it('fails internal-scope ignores that only cover filtered update PRs', () => {
    const result = runDependabotSupplyChainGuard(`
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    groups:
      external-npm:
        patterns: ["*"]
        exclude-patterns: ["@franken/*"]
    ignore:
      - dependency-name: "@franken/*"
        update-types:
          - "version-update:semver-major"
          - "version-update:semver-minor"
          - "version-update:semver-patch"
`);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('without update-types filters');

    const versionFiltered = runDependabotSupplyChainGuard(`
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    groups:
      external-npm:
        patterns: ["*"]
        exclude-patterns: ["@franken/*"]
    ignore:
      - dependency-name: "@franken/*"
        versions: ["<1.0.0"]
`);

    expect(versionFiltered.status).toBe(1);
    expect(versionFiltered.stderr).toContain('without update-types filters');
  });

  it('fails npm entries that target release branches instead of default-branch security coverage', () => {
    const result = runDependabotSupplyChainGuard(`
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    target-branch: release/0.45
    groups:
      external-npm:
        patterns: ["*"]
        exclude-patterns: ["@franken/*"]
    ignore:
      - dependency-name: "@franken/*"
`);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('target-branch');
    expect(result.stderr).toContain('default branch');
  });

  it('fails every npm group that lacks an internal-scope exclusion', () => {
    const result = runDependabotSupplyChainGuard(`
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    groups:
      safe-inline:
        patterns: ["*"]
        exclude-patterns: ["@franken/*"]
      unsafe-production:
        dependency-type: production
    ignore:
      - dependency-name: "@franken/*"
`);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unsafe-production');
    expect(result.stderr).toContain('exclude-patterns');
  });

  it('accepts dependabot configs that exclude internal packages from all npm updates', () => {
    const result = runDependabotSupplyChainGuard(`
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    groups:
      external-npm:
        patterns: ["*"]
        exclude-patterns: ["@franken/*"]
      production-only:
        dependency-type: production
        exclude-patterns: ["@franken/*"]
    ignore:
      - dependency-name: "@franken/*"
`);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Dependabot supply-chain guard OK');
  });

  it('wires dependency audit, major outdated check, dependabot guard, and SBOM artifact generation into CI', () => {
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const workflow = readFileSync(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8');

    expect(packageJson.scripts?.['audit:dependencies']).toBe('node scripts/check-package-manager.mjs && npm audit');
    expect(packageJson.scripts?.['deps:outdated:major']).toBe('node scripts/check-major-outdated.mjs');
    expect(packageJson.scripts?.['check:dependabot-supply-chain']).toBe('node scripts/check-dependabot-supply-chain.mjs');
    expect(workflow).toContain('npm run audit:dependencies');
    expect(workflow).toContain('npm run deps:outdated:major');
    expect(workflow).toContain('npm run check:dependabot-supply-chain');
    expect(workflow).toContain('npm sbom --sbom-format cyclonedx');
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('dependency-sbom-cyclonedx');
  });
});
