import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

function runScannerWithLimits(root: string, limits: Record<string, string>) {
  return spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    env: { ...process.env, FRANKENBEAST_SECRETS_SCAN_ROOT: root, ...limits },
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

  it('keeps the issue 506 secret examples removed or env-backed', () => {
    expect(existsSync(resolve(ROOT, 'packages/franken-mcp-suite/src/config/defaults.ts'))).toBe(false);
    expect(existsSync(resolve(ROOT, 'packages/franken-web/src/lib/config.ts'))).toBe(false);

    const envExample = readFileSync(resolve(ROOT, '.env.example'), 'utf8');
    expect(envExample).not.toMatch(/^\s*SECRET_KEY\s*=/m);
    expect(envExample).not.toMatch(/^\s*AWS_ACCESS_KEY_ID\s*=/m);
    expect(envExample).not.toMatch(/^\s*JWT_SECRET\s*=/m);
    expect(envExample).not.toMatch(/^GRAFANA_PASSWORD=admin$/m);
    expect(envExample).toContain('# GRAFANA_PASSWORD=change-me-random-grafana-password');
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

  it('rejects cron commands that interpolate sensitive environment aliases', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    const tokenValue = ['persisted', 'github', 'pat'].join('-');
    writeFileSync(
      join(scriptDir, 'install_pr_cron.py'),
      [
        'import os',
        "github_pat = os.environ['GITHUB_PERSONAL_ACCESS_TOKEN']",
        `CRON_CMD = f"* * * * * GITHUB_PERSONAL_ACCESS_TOKEN={github_pat} agy pr --token ${tokenValue}"`,
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/install_pr_cron.py:3');
    expect(result.stderr).toContain('CRON_CMD = f"<redacted>"');
    expect(result.stderr).not.toContain(tokenValue);
  });

  it('rejects common Python cron PAT interpolation variants', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'install_cron.py'),
      [
        'from os import getenv',
        "github_pat: str = getenv('GITHUB_PERSONAL_ACCESS_TOKEN')",
        'github_pat = github_pat.strip()',
        "entry = f'0 0-23/2 * * * GITHUB_PERSONAL_ACCESS_TOKEN={github_pat} agy pr'",
        'CRON_CMD = (',
        "  '*/5 * * * * agy issue-fixer '",
        "  f'--pat={github_pat}'",
        ')',
        'entry = (',
        "  '0 3 * * * '",
        "  f'GITHUB_PERSONAL_ACCESS_TOKEN={github_pat} agy pr'",
        ')',
        "safe = 'gh auth token | agy pr'",
        "# CRON_CMD = f\"* * * * * GITHUB_PERSONAL_ACCESS_TOKEN={getenv('GITHUB_PERSONAL_ACCESS_TOKEN')}\"",
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/install_cron.py:4');
    expect(result.stderr).toContain('scripts/install_cron.py:7');
    expect(result.stderr).toContain('scripts/install_cron.py:11');
    expect(result.stderr).not.toContain('scripts/install_cron.py:13');
    expect(result.stderr).not.toContain('scripts/install_cron.py:14');
  });

  it('allows safe cron diagnostics and gh auth token command text', () => {
    const root = makeFixtureRoot();
    const sourceDir = join(root, 'scripts');
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(
      join(sourceDir, 'install-cron.mjs'),
      [
        'const token = process.env.GITHUB_TOKEN;',
        "if (!process.env.GITHUB_TOKEN) throw new Error('crontab requires GITHUB_TOKEN');",
        "const CRON_CMD = '0 3 * * * gh auth token | agy pr';",
        "token = 'gh auth token';",
        "const ENTRY = '0 3 * * * ' + token;",
        "const NEXT_CRON =",
        "  '0 3 * * * gh auth token';",
        'const laterTokenDiagnostic = process.env.GITHUB_TOKEN;',
        "const compat = process.env.COMPAT ?? 'legacy';",
        "const configPath = process.env.CONFIG_PATH ?? './config.json';",
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(0);
  });

  it('rejects broader cron credential persistence patterns', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'install-cron.mjs'),
      [
        'const { GITHUB_PERSONAL_ACCESS_TOKEN } = process.env;',
        'const tokenAssignment = `GITHUB_PERSONAL_ACCESS_TOKEN=${GITHUB_PERSONAL_ACCESS_TOKEN}`;',
        "const CRON_CMD = '0 3 * * MON ' + tokenAssignment;",
        "const envName = 'GITHUB_PERSONAL_ACCESS_TOKEN';",
        'const pat = process.env[envName];',
        'const PARTS = ["* * * * *", "agy", "pr", "--token", pat];',
        "const CRON_CMD_2 = PARTS.join(' ');",
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'install-cron.sh'),
      [
        'GITHUB_PAT_VALUE="$GITHUB_PAT"',
        'CRON_CMD="0 3 * * * GITHUB_PAT=$GITHUB_PAT_VALUE agy pr"',
        'local pat="$GITHUB_PERSONAL_ACCESS_TOKEN"',
        'CRON_CMD_2="* * * * * agy pr --token $pat"',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'cron-install.sh'),
      [
        'GITHUB_PAT_VALUE="$GITHUB_PAT"',
        'CRON_CMD="0 3 * * * GITHUB_PAT=$GITHUB_PAT_VALUE agy pr"',
        'crontab <<EOF',
        '* * * * * GITHUB_TOKEN=$GITHUB_TOKEN agy pr',
        'EOF',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'install-cron.py'),
      [
        'from os import environ',
        "pat = environ['GH_PAT']",
        "CRON_CMD = f'0 3 * * MON GH_PAT={pat} agy pr'",
        "TOKEN_ENV = 'GITHUB_PERSONAL_ACCESS_TOKEN'",
        'github_pat = environ[TOKEN_ENV]',
        "CRON_CMD_2 = f'@daily agy pr --pat={github_pat.strip()}'",
        "hardcoded_pat = 'ghp_1234567890abcdef'",
        "CRON_CMD_3 = f'* * * * * agy pr --token {hardcoded_pat}'",
        'CRON_CMD_4 = f"""',
        '* * * * * GITHUB_TOKEN={pat} agy pr',
        '"""',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/install-cron.mjs:3');
    expect(result.stderr).toContain('scripts/install-cron.sh:2');
    expect(result.stderr).toContain('scripts/cron-install.sh:2');
    expect(result.stderr).toContain('scripts/install-cron.py:3');
  });

  it('rejects quoted, async, and multiline cron credential persistence variants', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'install-cron.mjs'),
      [
        "const quoted = '0 3 * * * GITHUB_TOKEN=\"abc123\" agy pr';",
        "execFile('gh', ['auth', 'token'], (error, stdout) => {",
        '  const credential = stdout.trim();',
        '  const entry = `0 3 * * * agy pr --token ${credential}`;',
        '});',
        "const envName = 'GITHUB_TOKEN';",
        'const optionalCredential = process.env?.[envName];',
        'const optionalEntry = `0 4 * * * agy pr --token ${optionalCredential}`;',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'quoted-cron.py'),
      [
        `one = '0 3 * * * GITHUB_TOKEN="abc123" agy pr'`,
        `two = "0 4 * * * GH_PAT='def456' agy pr"`,
        'three = "0 5 * * * GITHUB_TOKEN=`ghi789` agy pr"',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'async-multiline-cron.mjs'),
      [
        'execFile(',
        "  'gh',",
        "  ['auth', 'token'],",
        '  (error, credential) => {',
        '    const entry = `0 7 * * * agy pr --token ${credential}`;',
        '  },',
        ');',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'install-cron.py'),
      [
        'from os import environ',
        'credential = environ.get(',
        "  'GITHUB_TOKEN',",
        '  None,',
        ')',
        "entry = f'0 3 * * * agy pr --token {credential}'",
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'install-cron.sh'),
      [
        'auth="$(command gh auth token)"',
        'CRON_CMD="0 3 * * * agy pr --token $auth"',
        'crontab <<CRON.EOF',
        'GITHUB_TOKEN=$GITHUB_TOKEN',
        '0 4 * * * agy pr',
        'CRON.EOF',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/install-cron.mjs:1');
    expect(result.stderr).toContain('scripts/install-cron.mjs:4');
    expect(result.stderr).toContain('scripts/install-cron.mjs:8');
    expect(result.stderr).toContain('scripts/quoted-cron.py:1');
    expect(result.stderr).toContain('scripts/quoted-cron.py:2');
    expect(result.stderr).toContain('scripts/quoted-cron.py:3');
    expect(result.stderr).toContain('scripts/async-multiline-cron.mjs:5');
    expect(result.stderr).toContain('scripts/install-cron.py:6');
    expect(result.stderr).toContain('scripts/install-cron.sh:2');
    expect(result.stderr).toContain('scripts/install-cron.sh:4');
  });

  it('rejects cron credential scanner edge cases without leaking raw tokens', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    const rawPat = 'ghp_' + 'a'.repeat(16);
    writeFileSync(join(root, '.env.example'), `GITHUB_PAT=${rawPat}\n`, 'utf8');
    writeFileSync(
      join(scriptDir, 'install-cron.mjs'),
      [
        "import { execFileSync } from 'node:child_process';",
        'const { owner } = options;',
        'const pat = process.env.GITHUB_TOKEN;',
        'export const exportedAuth = process.env.GITHUB_TOKEN;',
        'const exportedEntry = `0 3 * * * agy pr --token ${exportedAuth}`;',
        'const { env: nodeEnv } = process;',
        'const fromNodeEnv = nodeEnv.GITHUB_TOKEN;',
        'const env = process.env;',
        'const fromEnvAlias = env.GITHUB_TOKEN;',
        'const {',
        '  GITHUB_TOKEN: destructuredPat,',
        '} = process.env;',
        'const schedule = "0 3 * * mon";',
        'const CRON_CMD =',
        "  schedule + ' agy pr --token ' + pat.trim();",
        'const multilinePat =',
        '  process.env.GITHUB_PERSONAL_ACCESS_TOKEN;',
        'const multilineEntry = `0 3 * * * agy pr --token ${multilinePat}`;',
        "const normalizedPat = pat || '';",
        'const normalizedEntry = `0 3 * * * agy pr --token ${normalizedPat}`;',
        "const installTimeGh = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' });",
        'const installTimeEntry = `0 3 * * * agy pr --token ${installTimeGh}`;',
        'const CRON_CMD_2 = `0 3 * * mon agy pr --token ${destructuredPat.trim()}`;',
        'const entry = `0 3 * * * agy pr --token ${fromEnvAlias}`;',
        "execFileSync('crontab', ['-'], { input: entry });",
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'install-cron.py'),
      [
        'from os import environ',
        'from os import environ as env',
        'from os import getenv as getenv_alias',
        "TOKEN_ENV = 'GITHUB_TOKEN'",
        "github_pat = environ['GITHUB_PERSONAL_ACCESS_TOKEN']",
        "entry = f'* * * * * agy pr --token {github_pat.strip()}'",
        "entry2 = f'* * * * * agy pr --token {env[TOKEN_ENV]}'",
        "github_pat_2 = getenv_alias('GITHUB_PERSONAL_ACCESS_TOKEN')",
        "entry3 = f'* * * * * agy pr --token {github_pat_2}'",
        'raw = """',
        `* * * * * GH_PAT=${rawPat} agy pr`,
        '"""',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'cron-install.sh'),
      [
        'echo /tmp/*',
        'GITHUB_PAT_VALUE="$GITHUB_PAT"',
        'CRON_CMD="* * * * * GITHUB_PAT=$GITHUB_PAT_VALUE agy pr"',
        'readonly pat="$GITHUB_TOKEN"',
        'CRON_CMD_2="* * * * * agy pr --token $pat"',
        'declare -r other_pat="$GITHUB_PAT"',
        'CRON_CMD_3="* * * * * agy pr --token $other_pat"',
        'crontab <<EOF',
        'GITHUB_TOKEN=$GITHUB_TOKEN',
        'EOF',
        'if [ -z "$GITHUB_TOKEN" ]; then echo missing; fi',
        'CRON_CMD_4="0 3 * * * agy pr --token $(gh auth token)"',
        "CRON_CMD_SAFE='0 3 * * * agy pr --token $(gh auth token)'",
        'auth="$(gh auth token)"',
        'CRON_CMD_5="0 3 * * * agy pr --token $auth"',
        'local -r local_auth="$GITHUB_TOKEN"',
        'CRON_CMD_6="0 3 * * * agy pr --token $local_auth"',
        "name='GITHUB_TOKEN'",
        'indirect_auth="${!name}"',
        'CRON_CMD_7="0 3 * * * agy pr --token $indirect_auth"',
        'printenv_auth="$(printenv GITHUB_TOKEN)"',
        'CRON_CMD_8="0 3 * * * agy pr --token $printenv_auth"',
        'printenv_name_auth="$(printenv "$name")"',
        'CRON_CMD_9="0 3 * * * agy pr --token $printenv_name_auth"',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'pr-cron.sh'),
      ['GITHUB_PAT_VALUE="$GITHUB_PAT"', 'CRON_CMD="* * * * * GITHUB_PAT=$GITHUB_PAT_VALUE agy pr"'].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('.env.example:1');
    expect(result.stderr).toContain('scripts/install-cron.mjs:5');
    expect(result.stderr).toContain('scripts/install-cron.mjs:15');
    expect(result.stderr).toContain('scripts/install-cron.mjs:18');
    expect(result.stderr).toContain('scripts/install-cron.mjs:20');
    expect(result.stderr).toContain('scripts/install-cron.mjs:22');
    expect(result.stderr).toContain('scripts/install-cron.mjs:23');
    expect(result.stderr).toContain('scripts/install-cron.mjs:24');
    expect(result.stderr).toContain('scripts/install-cron.mjs:25');
    expect(result.stderr).toContain('scripts/install-cron.py:6');
    expect(result.stderr).toContain('scripts/install-cron.py:7');
    expect(result.stderr).toContain('scripts/install-cron.py:9');
    expect(result.stderr).toContain('scripts/install-cron.py:11');
    expect(result.stderr).toContain('scripts/cron-install.sh:3');
    expect(result.stderr).toContain('scripts/cron-install.sh:5');
    expect(result.stderr).toContain('scripts/cron-install.sh:7');
    expect(result.stderr).toContain('scripts/cron-install.sh:9');
    expect(result.stderr).toContain('scripts/cron-install.sh:12');
    expect(result.stderr).toContain('scripts/cron-install.sh:15');
    expect(result.stderr).toContain('scripts/cron-install.sh:17');
    expect(result.stderr).toContain('scripts/cron-install.sh:20');
    expect(result.stderr).toContain('scripts/cron-install.sh:22');
    expect(result.stderr).toContain('scripts/pr-cron.sh:2');
    expect(result.stderr).not.toContain('scripts/cron-install.sh:11');
    expect(result.stderr).not.toContain('scripts/cron-install.sh:13');
    expect(result.stderr).toContain('GH_PAT=<redacted>');
    expect(result.stderr).not.toContain(rawPat);
  });

  it('rejects Codex-reported cron credential scanner edge cases', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'install-cron.mjs'),
      [
        'const credential = (',
        '  process.env.GITHUB_TOKEN',
        ');',
        'const entry = `0 3 * * * agy pr --token ${credential}`;',
        'export const { GITHUB_TOKEN: exportedCredential } = process.env;',
        'const exportedEntry = `0 4 * * * agy pr --token ${exportedCredential}`;',
        'const { GITHUB_TOKEN: typedCredential }: NodeJS.ProcessEnv = process.env;',
        'const typedEntry = `0 5 * * * agy pr --token ${typedCredential}`;',
        'const env = process.env;',
        'const { GITHUB_TOKEN: envAliasCredential } = env;',
        'const envAliasEntry = `0 7 * * * agy pr --token ${envAliasCredential}`;',
        'const CRON_CMD = `',
        'GITHUB_TOKEN=${process.env.GITHUB_TOKEN} agy pr',
        '`;',
        "const optionalCredential = process.env?.['GITHUB_TOKEN'];",
        'const optionalEntry = `0 8 * * * agy pr --token ${optionalCredential}`;',
        "const args = ['agy', 'pr', '--token', process.env.GITHUB_TOKEN];",
        "const spreadEntry = ['0 9 * * *', ...args].join(' ');",
        "const schedule = '0 10 * * *';",
        'const pat = process.env.GITHUB_TOKEN;',
        "const scheduleEntry = schedule + ' agy pr --token ' + pat;",
        'const cfg = { credential: process.env.GITHUB_TOKEN };',
        'const { credential: cfgCredential } = cfg;',
        'const cfgEntry = `0 11 * * * agy pr --token ${cfgCredential}`;',
        'let compoundCredential;',
        'compoundCredential ||= process.env.GITHUB_TOKEN;',
        'const compoundEntry = `0 12 * * * agy pr --token ${compoundCredential}`;',
        'const splitCredential = process',
        '.env',
        '.GITHUB_TOKEN;',
        'const splitEntry = `0 13 * * * agy pr --token ${splitCredential}`;',
        'const execCredential = execFileSync(',
        "  'gh',",
        "  ['auth', 'token'],",
        ');',
        'const execEntry = `0 14 * * * agy pr --token ${execCredential}`;',
        'const {',
        '  GITHUB_TOKEN: multilineEnvAliasCredential',
        '} = env;',
        'const multilineEnvAliasEntry = `0 14 * * * agy pr --token ${multilineEnvAliasCredential}`;',
        'const entries = [',
        "  '0 6 * * * gh auth token | agy pr',",
        '];',
        'const laterDiagnostic = process.env.GITHUB_TOKEN;',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'install-cron.py'),
      [
        'from os import environ as env',
        'from os import path, getenv as get_env',
        'from subprocess import check_output',
        'getenv_alias = os.getenv',
        "credential = env.get('GITHUB_TOKEN')",
        "entry = f'0 3 * * * agy pr --token {credential}'",
        "credential2 = get_env('GITHUB_TOKEN')",
        "entry2 = f'0 4 * * * agy pr --token {credential2}'",
        'credential3 = env.get(',
        "  'GITHUB_TOKEN'",
        ')',
        "entry3 = f'0 5 * * * agy pr --token {credential3}'",
        "credential4 = check_output(['gh', 'auth', 'token'], text=True)",
        "entry4 = f'0 6 * * * agy pr --token {credential4}'",
        "credential5 = getenv_alias('GITHUB_TOKEN')",
        "entry5 = f'0 7 * * * agy pr --token {credential5}'",
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'cron-install.sh'),
      [
        'cat <<EOF | crontab -',
        'GITHUB_TOKEN=$GITHUB_TOKEN',
        'EOF',
        'name=GITHUB_TOKEN',
        'auth="${!name}"',
        'CRON_CMD="* * * * * agy pr --token $auth"',
        'backtick_auth=`gh auth token`',
        'CRON_CMD_2="* * * * * agy pr --token $backtick_auth"',
        'scoped_auth=$(gh auth token --hostname github.com | tr -d "\\n")',
        'CRON_CMD_3="* * * * * agy pr --token $scoped_auth"',
        'name=GITHUB_TOKEN',
        'braced_auth="$(printenv "${name}")"',
        'CRON_CMD_4="* * * * * agy pr --token $braced_auth"',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'install.sh'),
      [
        'cat <<EOF | crontab -',
        '* * * * * GITHUB_TOKEN=$GITHUB_TOKEN agy pr',
        'EOF',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'nightly.sh'),
      [
        'cat <<EOF | crontab -',
        '* * * * * GITHUB_TOKEN=$GITHUB_TOKEN agy pr',
        'EOF',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'maintenance.sh'),
      [
        'cat <<EOF | crontab -',
        '* * * * * GITHUB_TOKEN=$GITHUB_TOKEN agy pr',
        'EOF',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/install-cron.mjs:4');
    expect(result.stderr).toContain('scripts/install-cron.mjs:6');
    expect(result.stderr).toContain('scripts/install-cron.mjs:8');
    expect(result.stderr).toContain('scripts/install-cron.mjs:11');
    expect(result.stderr).toContain('scripts/install-cron.mjs:13');
    expect(result.stderr).toContain('scripts/install-cron.mjs:16');
    expect(result.stderr).toContain('scripts/install-cron.mjs:18');
    expect(result.stderr).toContain('scripts/install-cron.mjs:21');
    expect(result.stderr).toContain('scripts/install-cron.mjs:24');
    expect(result.stderr).toContain('scripts/install-cron.mjs:27');
    expect(result.stderr).toContain('scripts/install-cron.mjs:31');
    expect(result.stderr).toContain('scripts/install-cron.mjs:36');
    expect(result.stderr).toContain('scripts/install-cron.mjs:40');
    expect(result.stderr).toContain('scripts/install-cron.py:6');
    expect(result.stderr).toContain('scripts/install-cron.py:8');
    expect(result.stderr).toContain('scripts/install-cron.py:12');
    expect(result.stderr).toContain('scripts/install-cron.py:14');
    expect(result.stderr).toContain('scripts/install-cron.py:16');
    expect(result.stderr).toContain('scripts/cron-install.sh:2');
    expect(result.stderr).toContain('scripts/cron-install.sh:6');
    expect(result.stderr).toContain('scripts/cron-install.sh:8');
    expect(result.stderr).toContain('scripts/cron-install.sh:10');
    expect(result.stderr).toContain('scripts/cron-install.sh:13');
    expect(result.stderr).toContain('scripts/install.sh:2');
    expect(result.stderr).toContain('scripts/nightly.sh:2');
    expect(result.stderr).toContain('scripts/maintenance.sh:2');
  });

  it('allows runtime gh token substitutions in cron strings', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'install-cron.mjs'),
      "const CRON_CMD = '0 3 * * * GITHUB_TOKEN=$(gh auth token) agy pr';\n",
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'cron-install.sh'),
      [
        "cat <<'EOF' | crontab -",
        '0 3 * * * GITHUB_TOKEN=$(gh auth token) agy pr',
        'EOF',
        'cat <<\\EOF | crontab -',
        '0 4 * * * GITHUB_TOKEN=$(gh auth token) agy pr',
        'EOF',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'runtime-token.mjs'),
      "spawnSync('deployctl', ['login', '--token', process.env.DEPLOY_TOKEN]);\n",
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(0);
  });

  it('documents cron credential rotation guidance', () => {
    const doc = readFileSync(resolve(ROOT, 'docs/cron-credential-safety.md'), 'utf8');

    expect(doc).toContain('must not persist GitHub personal access tokens');
    expect(doc).toContain('gh auth token');
    expect(doc.toLowerCase()).toContain('rotate any github credentials');
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

  it('fails closed on oversized source lines before regex scanners inspect untrusted text', () => {
    const root = makeFixtureRoot();
    const sourceDir = join(root, 'packages', 'example', 'src');
    mkdirSync(sourceDir, { recursive: true });
    const oversizedPayload = 'a'.repeat(80);
    writeFileSync(
      join(sourceDir, 'config.ts'),
      `const jwtSecret = '${oversizedPayload}';\n`,
      'utf8',
    );

    const result = runScannerWithLimits(root, { FRANKENBEAST_SECRETS_SCAN_MAX_LINE_CHARS: '40' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('packages/example/src/config.ts:1');
    expect(result.stderr).toContain('parser=secret-source-scanner input=line-too-large');
    expect(result.stderr).not.toContain(oversizedPayload);
  });

  it('handles short unterminated secret literals with linear parsing', () => {
    const root = makeFixtureRoot();
    const sourceDir = join(root, 'packages', 'example', 'src');
    mkdirSync(sourceDir, { recursive: true });
    const redosPayload = `const jwtSecret = '${'\\\\'.repeat(40)};`;
    writeFileSync(join(sourceDir, 'config.ts'), `${redosPayload}\n`, 'utf8');

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('packages/example/src/config.ts:1');
    expect(result.stderr).toContain("const jwtSecret = '<redacted>");
    expect(result.stderr).not.toContain('\\\\\\\\\\\\\\\\');
  });

  it('fails closed on oversized environment examples with parser and input-class details only', () => {
    const root = makeFixtureRoot();
    const oversizedPayload = 'b'.repeat(120);
    writeFileSync(join(root, '.env.example'), `${sensitiveName('JWT', 'SECRET')}=${oversizedPayload}\n`, 'utf8');

    const result = runScannerWithLimits(root, { FRANKENBEAST_SECRETS_SCAN_MAX_FILE_BYTES: '60' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('.env.example');
    expect(result.stderr).toContain('parser=secret-env-scanner input=file-too-large');
    expect(result.stderr).not.toContain(oversizedPayload);
  });
});
