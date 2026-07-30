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

function wideConflictMarker(character: '<' | '=' | '>'): string {
  return character.repeat(9);
}

function shortConflictMarker(character: '<' | '=' | '>'): string {
  return character.repeat(3);
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

  it('rejects configurable conflict-marker widths', () => {
    const root = makeFixtureRoot();
    writeFixture(root, 'docs/ARCHITECTURE.md', [
      `${wideConflictMarker('<')} HEAD`,
      'current architecture',
      wideConflictMarker('='),
      'incoming architecture',
      `${wideConflictMarker('>')} feature/architecture`,
    ].join('\n'));

    const result = runScanner(root);

    expect(result.status).toBe(1);
  });

  it('rejects complete conflict blocks with marker widths below seven', () => {
    const root = makeFixtureRoot();
    writeFixture(root, 'docs/guide.md', [
      `${shortConflictMarker('<')} HEAD`,
      'current guide',
      shortConflictMarker('='),
      'incoming guide',
      `${shortConflictMarker('>')} feature/guide`,
    ].join('\n'));

    const result = runScanner(root);

    expect(result.status).toBe(1);
  });

  it('rejects complete conflict blocks with one-character markers', () => {
    const root = makeFixtureRoot();
    writeFixture(root, '.gitattributes', '*.md conflict-marker-size=1\n');
    writeFixture(root, 'docs/minimal.md', [
      '< HEAD',
      'current guide',
      '=',
      'incoming guide',
      '> feature/guide',
    ].join('\n'));

    const result = runScanner(root);

    expect(result.status).toBe(1);
  });

  it('allows unrelated one-character Markdown constructs without a configured marker width', () => {
    const root = makeFixtureRoot();
    writeFixture(root, 'docs/valid.md', [
      '< less-than prose',
      'Title',
      '=',
      '> quoted prose',
    ].join('\n'));

    const result = runScanner(root);

    expect(result.status).toBe(0);
  });

  it('preserves a short conflict after an opening-like incoming line', () => {
    const root = makeFixtureRoot();
    writeFixture(root, 'docs/guide.md', [
      `${shortConflictMarker('<')} HEAD`,
      'current guide',
      shortConflictMarker('='),
      `${shortConflictMarker('<')} example`,
      `${shortConflictMarker('>')} feature/guide`,
    ].join('\n'));

    const result = runScanner(root);

    expect(result.status).toBe(1);
  });

  it('preserves an outer conflict before its separator', () => {
    const root = makeFixtureRoot();
    writeFixture(root, 'docs/guide.md', [
      '<<<< HEAD',
      'current guide',
      '<<< example',
      '====',
      'incoming guide',
      '>>>> feature/guide',
    ].join('\n'));

    const result = runScanner(root);

    expect(result.status).toBe(1);
  });

  it('rejects conflicts in Markdown with CR-only line endings', () => {
    const root = makeFixtureRoot();
    writeFixture(root, 'docs/legacy.md', [
      `${conflictMarker('<')} HEAD`,
      'current guide',
      conflictMarker('='),
      'incoming guide',
      `${conflictMarker('>')} feature/guide`,
    ].join('\r'));

    const result = runScanner(root);

    expect(result.status).toBe(1);
  });

  it('rejects a conflict whose opening marker follows a UTF-8 BOM', () => {
    const root = makeFixtureRoot();
    writeFixture(root, 'docs/bom.md', [
      `\uFEFF${shortConflictMarker('<')} HEAD`,
      'current guide',
      shortConflictMarker('='),
      'incoming guide',
      `${shortConflictMarker('>')} feature/guide`,
    ].join('\n'));

    const result = runScanner(root);

    expect(result.status).toBe(1);
  });

  it('rejects incomplete standard-width opening and closing remnants', () => {
    const root = makeFixtureRoot();
    writeFixture(root, 'docs/opening.md', `${conflictMarker('<')} HEAD\nunfinished\n`);
    writeFixture(root, 'docs/closing.md', `unfinished\n${conflictMarker('>')} feature/docs\n`);

    const result = runScanner(root);
    const report = JSON.parse(result.stdout) as { totalFindings: number };

    expect(result.status).toBe(1);
    expect(report.totalFindings).toBe(2);
  });

  it('rejects incomplete standard-width diff3 ancestor remnants', () => {
    const root = makeFixtureRoot();
    writeFixture(root, 'docs/ancestor.md', [
      '# Guide',
      '||||||| base',
      'ancestor text',
    ].join('\n'));

    const result = runScanner(root);

    expect(result.status).toBe(1);
  });

  it('allows valid Setext heading underlines outside conflict blocks', () => {
    const root = makeFixtureRoot();
    writeFixture(root, 'docs/guide.md', [
      'Architecture',
      conflictMarker('='),
    ].join('\n'));

    const result = runScanner(root);

    expect(result.status).toBe(0);
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
