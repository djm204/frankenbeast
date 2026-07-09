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

  it('rejects ordinary placeholders in sensitive fallback contexts', () => {
    const root = makeFixtureRoot();
    const sourceDir = join(root, 'packages', 'example', 'src');
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(
      join(sourceDir, 'config.ts'),
      `export const value = process.env.${sensitiveName('JWT', 'SECRET')} ?? 'changeme';\n`,
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("'<redacted>'");
    expect(result.stderr).not.toContain('changeme');
  });

  it('rejects camelCase sensitive constant assignments', () => {
    const root = makeFixtureRoot();
    const sourceDir = join(root, 'packages', 'example', 'src');
    mkdirSync(sourceDir, { recursive: true });
    const fallback = ['local', 'secret'].join('-');
    writeFileSync(join(sourceDir, 'config.ts'), `const jwtSecret = '${fallback}';\n`, 'utf8');

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('packages/example/src/config.ts:1');
    expect(result.stderr).not.toContain(fallback);
  });

  it('rejects exported private key values in environment examples', () => {
    const root = makeFixtureRoot();
    const placeholder = ['begin', 'private', 'key'].join('-');
    writeFileSync(join(root, '.env.example'), `export ${sensitiveName('PRIVATE', 'KEY')}=${placeholder}\n`, 'utf8');

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PRIVATE_KEY=<redacted>');
    expect(result.stderr).not.toContain(placeholder);
  });

  it('rejects destructured env defaults and Vite env fallbacks', () => {
    const root = makeFixtureRoot();
    const sourceDir = join(root, 'packages', 'example', 'src');
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(
      join(sourceDir, 'config.ts'),
      [
        `const { ${sensitiveName('JWT', 'SECRET')} = 'dev' } = process.env;`,
        `const viteToken = import.meta.env.${sensitiveName('VITE', 'BEAST', 'OPERATOR', 'TOKEN')} ?? 'dev';`,
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('packages/example/src/config.ts:1');
    expect(result.stderr).toContain('packages/example/src/config.ts:2');
  });

  it('rejects parenthesized multiline sensitive fallback values', () => {
    const root = makeFixtureRoot();
    const sourceDir = join(root, 'packages', 'example', 'src');
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(
      join(sourceDir, 'config.ts'),
      [
        `export const value = process.env.${sensitiveName('JWT', 'SECRET')} ??`,
        '  (',
        `    'dev';`,
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('packages/example/src/config.ts:3');
  });

  it('rejects comment markers inside hard-coded secret literals', () => {
    const root = makeFixtureRoot();
    const sourceDir = join(root, 'packages', 'example', 'src');
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, 'config.ts'), `const jwtSecret = 'abc//def';\n`, 'utf8');

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('packages/example/src/config.ts:1');
    expect(result.stderr).not.toContain('abc//def');
  });

  it('rejects sensitive object properties and common token variable names', () => {
    const root = makeFixtureRoot();
    const sourceDir = join(root, 'packages', 'example', 'src');
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(
      join(sourceDir, 'config.ts'),
      [
        `export const cfg = { jwtSecret: 'dev-secret' };`,
        `const accessToken = 'dev-token';`,
        `const jwt_secret = 'dev-secret';`,
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('packages/example/src/config.ts:1');
    expect(result.stderr).toContain('packages/example/src/config.ts:2');
    expect(result.stderr).toContain('packages/example/src/config.ts:3');
  });

  it('rejects passphrase env examples with dotenv spacing', () => {
    const root = makeFixtureRoot();
    writeFileSync(join(root, '.env.example'), `${sensitiveName('FRANKENBEAST', 'PASSPHRASE')} = replace-me\n`, 'utf8');

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('FRANKENBEAST_PASSPHRASE=<redacted>');
  });

  it('rejects optional-chained and parenthesized env fallbacks', () => {
    const root = makeFixtureRoot();
    const sourceDir = join(root, 'packages', 'example', 'src');
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(
      join(sourceDir, 'config.ts'),
      [
        `const one = process.env?.${sensitiveName('JWT', 'SECRET')} ?? 'dev-secret';`,
        `const two = (process.env).${sensitiveName('JWT', 'SECRET')} ?? 'dev-secret';`,
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('packages/example/src/config.ts:1');
    expect(result.stderr).toContain('packages/example/src/config.ts:2');
  });

  it('rejects multiline destructured defaults', () => {
    const root = makeFixtureRoot();
    const sourceDir = join(root, 'packages', 'example', 'src');
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(
      join(sourceDir, 'config.ts'),
      [
        'const {',
        `  ${sensitiveName('JWT', 'SECRET')} = 'dev-secret',`,
        '} = process.env;',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('packages/example/src/config.ts:2');
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
