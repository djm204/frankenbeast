import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = resolve(ROOT, 'scripts/check-doc-integrity.mjs');
const fixtureRoots = new Set<string>();

function conflictMarker(character: '<' | '=' | '>'): string {
  return character.repeat(7);
}

function makeFixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'franken-doc-integrity-'));
  fixtureRoots.add(root);
  return root;
}

function writeFixture(root: string, relativePath: string, content: string): void {
  const path = join(root, relativePath);
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

function runScanner(root: string) {
  return spawnSync(process.execPath, [SCRIPT, '--json'], {
    cwd: ROOT,
    env: { ...process.env, FRANKENBEAST_DOCS_SCAN_ROOT: root },
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const root of fixtureRoots) {
    rmSync(root, { force: true, recursive: true });
  }
  fixtureRoots.clear();
});

describe('maintained Markdown integrity', () => {
  it('passes for the repository maintained docs', () => {
    const result = runScanner(ROOT);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ totalFindings: 0 });
  });

  it('rejects unresolved merge markers in maintained docs', () => {
    const root = makeFixtureRoot();
    writeFixture(
      root,
      'docs/onboarding/RAMP_UP.md',
      [
        '# Ramp up',
        `${conflictMarker('<')} HEAD`,
        'planning faculty wording',
        conflictMarker('='),
        'durable brain wording',
        `${conflictMarker('>')} feature/docs`,
      ].join('\n'),
    );

    const result = runScanner(root);
    const report = JSON.parse(result.stdout) as {
      findings: Array<{ line: number; path: string }>;
    };

    expect(result.status).toBe(1);
    expect(report.findings).toContainEqual({
      line: 2,
      marker: conflictMarker('<'),
      path: 'docs/onboarding/RAMP_UP.md',
    });
  });

  it('does not scan generated or vendored Markdown artifacts', () => {
    const root = makeFixtureRoot();
    const unresolved = `${conflictMarker('<')} generated\n`;
    writeFixture(root, 'docs/generated/reference.md', unresolved);
    writeFixture(root, 'docs/vendor/upstream.md', unresolved);
    writeFixture(root, 'docs/node_modules/package/README.md', unresolved);

    const result = runScanner(root);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ totalFindings: 0 });
  });
});
