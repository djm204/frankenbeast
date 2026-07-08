import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = resolve(ROOT, 'scripts/audit-todo-markers.mjs');

function marker(...parts: string[]) {
  return parts.join('');
}

function makeFixtureRoot() {
  return join(tmpdir(), `franken-todo-scan-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

function writeFixture(root: string, rel: string, content: string) {
  const path = join(root, rel);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

function runScanner(root: string, args: string[] = []) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    env: { ...process.env, FRANKENBEAST_DEBT_SCAN_ROOT: root },
    encoding: 'utf8',
  });
}

describe('code comment debt marker scanner', () => {
  it('is wired into root scripts and CI', () => {
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const workflow = readFileSync(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8');

    expect(packageJson.scripts?.['audit:todos']).toBe('node scripts/audit-todo-markers.mjs');
    expect(packageJson.scripts?.['lint:security']).toContain('node scripts/audit-todo-markers.mjs');
    expect(workflow).toContain('npm run test:root -- tests/workspaces.test.ts tests/unit/web-dev-server-dependency-policy.test.ts tests/unit/todo-markers.test.ts');
    expect(workflow).toContain('npm run audit:todos');
  });

  it('passes when production sources have no tracked comment markers', () => {
    const root = makeFixtureRoot();
    writeFixture(root, 'packages/example/src/index.ts', 'export const value = 1;\n');

    const result = runScanner(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No tracked code-comment markers found');
  });

  it('reports line and block comment markers with paths and line numbers', () => {
    const root = makeFixtureRoot();
    const pending = marker('TO', 'DO');
    const workaround = marker('HA', 'CK');
    writeFixture(
      root,
      'packages/example/src/index.ts',
      [
        'export const value = 1;',
        `// ${pending}: turn this into an issue`,
        '/*',
        ` * ${workaround}: temporary branch`,
        ' */',
      ].join('\n'),
    );

    const result = runScanner(root, ['--json']);
    const summary = JSON.parse(result.stdout) as { totalFindings: number; findings: Array<{ path: string; line: number; marker: string }> };

    expect(result.status).toBe(1);
    expect(summary.totalFindings).toBe(2);
    expect(summary.findings).toEqual([
      { path: 'packages/example/src/index.ts', line: 2, marker: pending, excerpt: `${pending}: turn this into an issue` },
      { path: 'packages/example/src/index.ts', line: 3, marker: workaround, excerpt: `${workaround}: temporary branch` },
    ]);
  });

  it('scans comments inside template interpolations and NodeNext module files', () => {
    const root = makeFixtureRoot();
    const pending = marker('TO', 'DO');
    const deferred = marker('FIX', 'ME');
    writeFixture(root, 'packages/example/src/template.ts', 'const value = `${answer /* ' + pending + ': file issue */}`;\n');
    writeFixture(root, 'packages/example/src/module.mts', `// ${deferred}: module follow-up\nexport const value = 1;\n`);

    const result = runScanner(root, ['--json']);
    const summary = JSON.parse(result.stdout) as { totalFindings: number; findings: Array<{ path: string; line: number; marker: string }> };

    expect(result.status).toBe(1);
    expect(summary.totalFindings).toBe(2);
    expect(summary.findings.map((finding) => `${finding.path}:${finding.line}:${finding.marker}`)).toEqual([
      `packages/example/src/module.mts:1:${deferred}`,
      `packages/example/src/template.ts:1:${pending}`,
    ]);
  });

  it('ignores marker-looking strings, tests, fixtures, and scanner source', () => {
    const root = makeFixtureRoot();
    const deferred = marker('FIX', 'ME');
    writeFixture(root, 'packages/example/src/index.ts', `const value = "${deferred}: not a comment";\n`);
    writeFixture(root, 'packages/example/tests/index.test.ts', `// ${deferred}: ignored test debt\n`);
    writeFixture(root, 'packages/example/fixtures/sample.ts', `// ${deferred}: ignored fixture debt\n`);
    writeFixture(root, 'scripts/audit-todo-markers.mjs', `// ${deferred}: ignored self reference\n`);

    const result = runScanner(root, ['--json']);
    const summary = JSON.parse(result.stdout) as { totalFindings: number };

    expect(result.status).toBe(0);
    expect(summary.totalFindings).toBe(0);
  });

  it('does not treat regular expression literals as comments', () => {
    const root = makeFixtureRoot();
    const pending = marker('TO', 'DO');
    const deferred = marker('FIX', 'ME');
    writeFixture(
      root,
      'packages/example/src/regex.ts',
      [
        `const one = /[/* ${pending} */]/;`,
        `const two = /[// ${deferred}]/;`,
      ].join('\n'),
    );

    const result = runScanner(root, ['--json']);
    const summary = JSON.parse(result.stdout) as { totalFindings: number };

    expect(result.status).toBe(0);
    expect(summary.totalFindings).toBe(0);
  });
});
