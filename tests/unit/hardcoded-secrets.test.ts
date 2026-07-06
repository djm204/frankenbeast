import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = resolve(ROOT, 'scripts/check-hardcoded-secrets.mjs');

function sensitiveName(...parts: string[]) {
  return parts.join('_');
}

function makeFixtureRoot() {
  return mkdtempSync(join(tmpdir(), 'franken-secret-scan-'));
}

function runScanner(root: string) {
  return spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    env: { ...process.env, FRANKENBEAST_SECRETS_SCAN_ROOT: root },
    encoding: 'utf8',
  });
}

describe('hard-coded example secret scanner', () => {
  it('is included in the root security lint script', () => {
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.['lint:security']).toContain('node scripts/check-hardcoded-secrets.mjs');
  });

  it('passes the repository fixtures that keep secret examples commented or env-backed', () => {
    execFileSync(process.execPath, [SCRIPT], { cwd: ROOT, stdio: 'pipe' });
  });

  it('rejects and redacts uncommented secret values in environment examples', () => {
    const root = makeFixtureRoot();
    const placeholder = ['replace', 'me'].join('-');
    writeFileSync(join(root, '.env.example'), `${sensitiveName('OPENAI', 'API', 'KEY')}=${placeholder}\n`, 'utf8');

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('.env.example:1');
    expect(result.stderr).toContain('OPENAI_API_KEY=<redacted>');
    expect(result.stderr).not.toContain(placeholder);
    expect(result.stderr).toContain('Hard-coded example secret values are not allowed');
  });

  it('rejects and redacts hard-coded sensitive fallback values in production sources', () => {
    const root = makeFixtureRoot();
    const sourceDir = join(root, 'packages', 'example', 'src');
    mkdirSync(sourceDir, { recursive: true });
    const fallback = ['local', 'secret'].join('-');
    writeFileSync(
      join(sourceDir, 'config.ts'),
      `export const value = process.env.${sensitiveName('JWT', 'SECRET')} ?? '${fallback}';\n`,
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('packages/example/src/config.ts:1');
    expect(result.stderr).toContain("'<redacted>'");
    expect(result.stderr).not.toContain(fallback);
  });

  it('rejects formatted multiline sensitive fallback values in production sources', () => {
    const root = makeFixtureRoot();
    const sourceDir = join(root, 'packages', 'example', 'src');
    mkdirSync(sourceDir, { recursive: true });
    const fallback = ['dev', 'secret'].join('-');
    writeFileSync(
      join(sourceDir, 'config.ts'),
      [
        `export const value = process.env.${sensitiveName('JWT', 'SECRET')} ??`,
        `  '${fallback}';`,
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('packages/example/src/config.ts:2');
    expect(result.stderr).not.toContain(fallback);
  });

  it('allows sensitive env checks with ordinary diagnostic strings', () => {
    const root = makeFixtureRoot();
    const sourceDir = join(root, 'packages', 'example', 'src');
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(
      join(sourceDir, 'config.ts'),
      `if (!process.env.${sensitiveName('JWT', 'SECRET')}) throw new Error('required');\n`,
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(0);
  });

  it('allows sensitive-looking examples inside block comments', () => {
    const root = makeFixtureRoot();
    const sourceDir = join(root, 'packages', 'example', 'src');
    mkdirSync(sourceDir, { recursive: true });
    const fallback = ['comment', 'secret'].join('-');
    writeFileSync(
      join(sourceDir, 'config.ts'),
      `/* use process.env.${sensitiveName('JWT', 'SECRET')} ?? '${fallback}' only in tests */\n`,
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(0);
  });

  it('allows environment-backed production reads without literal fallbacks', () => {
    const root = makeFixtureRoot();
    const sourceDir = join(root, 'packages', 'example', 'src');
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(
      join(sourceDir, 'config.ts'),
      `export const value = process.env.${sensitiveName('AWS', 'ACCESS', 'KEY', 'ID')};\n`,
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No hard-coded example secret values found');
  });
});
