import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = resolve(ROOT, 'scripts/check-major-outdated.mjs');

function writeJson(value: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'franken-outdated-'));
  const file = join(dir, 'outdated.json');
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return file;
}

function runOutdatedGuard(report: unknown) {
  return spawnSync(process.execPath, [SCRIPT, '--input', writeJson(report)], {
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
    expect(result.stdout).toContain('no direct dependencies are behind an allowed major release');
  });

  it('wires dependency audit, major outdated check, and SBOM artifact generation into CI', () => {
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const workflow = readFileSync(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8');

    expect(packageJson.scripts?.['audit:dependencies']).toBe('node scripts/check-package-manager.mjs && npm audit');
    expect(packageJson.scripts?.['deps:outdated:major']).toBe('node scripts/check-major-outdated.mjs');
    expect(workflow).toContain('npm run audit:dependencies');
    expect(workflow).toContain('npm run deps:outdated:major');
    expect(workflow).toContain('npm sbom --sbom-format cyclonedx');
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('dependency-sbom-cyclonedx');
  });
});
