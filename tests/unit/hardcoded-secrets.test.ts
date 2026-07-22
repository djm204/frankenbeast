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

  it('rejects indirect printenv, schedule-template, and object-property cron credentials', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'indirect-cron.sh'),
      [
        'name=GITHUB_TOKEN',
        'auth="$(printenv "$name")"',
        'CRON_CMD="0 3 * * * agy pr --token $auth"',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'template-cron.mjs'),
      [
        "const schedule = '0 3 * * *';",
        'const credential = process.env.GITHUB_TOKEN;',
        'const entry = `${schedule} agy pr --token ${credential}`;',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'object-cron.mjs'),
      [
        'const cfg = {};',
        'cfg.credential = process.env.GITHUB_TOKEN;',
        'const entry = `0 4 * * * agy pr --token ${cfg.credential}`;',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'typed-multiline-cron.mjs'),
      [
        'const {',
        '  GITHUB_TOKEN: credential,',
        '}: NodeJS.ProcessEnv = process.env;',
        'const entry = `0 5 * * * agy pr --token ${credential}`;',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'split-env-cron.mjs'),
      [
        'const credential =',
        'process',
        '.env',
        '.GITHUB_TOKEN;',
        'const entry = `0 6 * * * agy pr --token ${credential}`;',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'destructured-gh-cron.mjs'),
      [
        "const { stdout: credential } = await execFile('gh', ['auth', 'token']);",
        'const entry = `0 7 * * * agy pr --token ${credential}`;',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'getter-alias-cron.py'),
      [
        'get_env = os.environ.get',
        "credential = get_env('GITHUB_TOKEN')",
        "entry = f'0 8 * * * agy pr --token {credential}'",
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/indirect-cron.sh:3');
    expect(result.stderr).toContain('scripts/template-cron.mjs:3');
    expect(result.stderr).toContain('scripts/object-cron.mjs:3');
    expect(result.stderr).toContain('scripts/typed-multiline-cron.mjs:4');
    expect(result.stderr).toContain('scripts/split-env-cron.mjs:5');
    expect(result.stderr).toContain('scripts/destructured-gh-cron.mjs:2');
    expect(result.stderr).toContain('scripts/getter-alias-cron.py:3');
  });

  it('rejects staged and programmatic cron credential persistence variants', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'install-cron.mjs'),
      [
        'const entry = `0 3 * * *',
        'GITHUB_TOKEN=${process.env.GITHUB_TOKEN} agy pr`;',
        'const schedule = getSchedule();',
        'const credential = process.env.GITHUB_TOKEN;',
        'const computedEntry = `${schedule} agy pr --token ${credential}`;',
        "execFileSync('crontab', ['-'], { input: computedEntry });",
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'install-cron.sh'),
      [
        'cat >/tmp/jobs <<EOF',
        'GITHUB_TOKEN=$GITHUB_TOKEN',
        '0 5 * * * agy pr',
        'EOF',
        'crontab /tmp/jobs',
        'auth="$(/usr/bin/gh auth token)"',
        'CRON_CMD="0 6 * * * agy pr --token $auth"',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'install-cron.py'),
      [
        'import os as os_',
        'env = os_.environ',
        "credential = env['GITHUB_TOKEN']",
        "entry = f'0 7 * * * agy pr --token {credential}'",
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/install-cron.mjs:2');
    expect(result.stderr).toContain('scripts/install-cron.mjs:6');
    expect(result.stderr).toContain('scripts/install-cron.sh:2');
    expect(result.stderr).toContain('scripts/install-cron.sh:7');
    expect(result.stderr).toContain('scripts/install-cron.py:4');
  });

  it('rejects post-processed, staged, dynamic, and equivalent cron credential flows', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'install-dynamic-cron.py'),
      [
        'import os',
        'import subprocess',
        'import sys',
        "credential = os.environ.pop('GITHUB_TOKEN')",
        'schedule = sys.argv[1]',
        "entry = f'{schedule} agy pr --token {credential}'",
        "subprocess.run(['crontab', '-'], input=entry)",
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'install-staged-cron.sh'),
      [
        "printf '%s\\n' '0 3 * * * agy pr' >/tmp/jobs",
        "printf '%s\\n' \"--token $GITHUB_TOKEN\" >>/tmp/jobs",
        'crontab /tmp/jobs',
        "name='GITHUB_TOKEN'",
        'auth="$(printenv "$name" | tr -d "\\n")"',
        'CRON_CMD="0 4 * * * agy pr --token $auth"',
        'host_auth="$(GH_HOST=github.com gh auth token)"',
        'CRON_COMMAND="0 5 * * * agy pr --token $host_auth"',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'install-equivalent-cron.mjs'),
      [
        'const cfg = {};',
        "cfg.credential = process['env'].GITHUB_TOKEN;",
        'const first = `0 6 * * * agy pr --token ${cfg?.credential}`;',
        "spawnSync('crontab', ['-'], { input: first });",
        "let appended = '';",
        'appended += process.env.GITHUB_TOKEN;',
        'const second = `0 7 * * * agy pr --token ${appended}`;',
        "spawnSync('crontab', ['-'], { input: second });",
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/install-dynamic-cron.py:7');
    expect(result.stderr).toContain('scripts/install-staged-cron.sh:2');
    expect(result.stderr).toContain('scripts/install-staged-cron.sh:6');
    expect(result.stderr).toContain('scripts/install-staged-cron.sh:8');
    expect(result.stderr).toContain('scripts/install-equivalent-cron.mjs:3');
    expect(result.stderr).toContain('scripts/install-equivalent-cron.mjs:7');
  });

  it('rejects multiline sinks, aliased commands, backquotes, destructuring, and multiline assembly', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'install-multiline-cron.py'),
      [
        'import os',
        'import subprocess',
        'import sys',
        "credential = os.environ['GITHUB_TOKEN']",
        'schedule = sys.argv[1]',
        "entry = f'{schedule} agy pr --token {credential}'",
        'subprocess.run(',
        "  ['crontab', '-'],",
        '  input=entry,',
        ')',
        'second = (',
        "  f'{schedule} agy pr '",
        "  f'--token {credential}'",
        ')',
        "subprocess.run(['crontab', '-'], input=second)",
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'install-more-cron.sh'),
      [
        "printf '%s\\n' '0 3 * * * agy pr' >/tmp/jobs",
        "printf '%s\\n' \"--token $GITHUB_TOKEN\" >>/tmp/jobs",
        'crontab < /tmp/jobs',
        'auth=`printenv GITHUB_TOKEN`',
        'CRON_CMD="0 4 * * * agy pr --token $auth"',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'install-more-cron.mjs'),
      [
        "const ghArgs = ['auth', 'token'];",
        "const credential = execFileSync('gh', ghArgs, { encoding: 'utf8' });",
        'const schedule =',
        "  '0 5 * * *';",
        'const entry = `${schedule} agy pr --token ${credential}`;',
        'const cfg = {};',
        'cfg.credential = process.env.GITHUB_TOKEN;',
        'const { credential: destructured } = cfg;',
        'const second = `0 6 * * * agy pr --token ${destructured}`;',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/install-multiline-cron.py:9');
    expect(result.stderr).toContain('scripts/install-multiline-cron.py:15');
    expect(result.stderr).toContain('scripts/install-more-cron.sh:2');
    expect(result.stderr).toContain('scripts/install-more-cron.sh:5');
    expect(result.stderr).toContain('scripts/install-more-cron.mjs:5');
    expect(result.stderr).toContain('scripts/install-more-cron.mjs:9');
  });

  it('rejects imported env, bracket properties, aliased sinks, tee staging, and wrapped gh calls', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'install-alias-cron.py'),
      [
        'import os as os_, subprocess',
        'from subprocess import run as run_cmd, check_output',
        'env = os_.environ',
        "credential = env.pop('GITHUB_TOKEN')",
        "entry = f'{sys.argv[1]} agy pr --token {credential}'",
        "run_cmd(['crontab', '-'], input=entry)",
        "gh_args = ['auth', 'token']",
        "second_credential = check_output(['gh', *gh_args], text=True)",
        "second = f'0 7 * * * agy pr --token {second_credential}'",
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'install-alias-cron.mjs'),
      [
        "import { env } from 'node:process';",
        'const cfg = {};',
        "cfg['credential'] = env.GITHUB_TOKEN;",
        "const bracketEntry = `0 8 * * * agy pr --token ${cfg['credential']}`;",
        "const cmd = 'crontab';",
        'const dynamicEntry = `${process.argv[2]} agy pr --token ${env.GITHUB_TOKEN}`;',
        "spawnSync(cmd, ['-'], { input: dynamicEntry });",
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'install-tee-cron.sh'),
      [
        "printf '%s\\n' '0 9 * * * agy pr' | tee /tmp/jobs",
        "printf '%s\\n' \"GITHUB_TOKEN=$GITHUB_TOKEN\" | tee -a /tmp/jobs",
        'crontab /tmp/jobs',
        'auth="$(command /usr/bin/gh auth token)"',
        'CRON_CMD="0 10 * * * agy pr --token $auth"',
        'other="$(env GH_HOST=github.com gh auth token)"',
        'CRON_CMD_2="0 11 * * * agy pr --token $other"',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/install-alias-cron.py:6');
    expect(result.stderr).toContain('scripts/install-alias-cron.py:9');
    expect(result.stderr).toContain('scripts/install-alias-cron.mjs:4');
    expect(result.stderr).toContain('scripts/install-alias-cron.mjs:7');
    expect(result.stderr).toContain('scripts/install-tee-cron.sh:2');
    expect(result.stderr).toContain('scripts/install-tee-cron.sh:5');
    expect(result.stderr).toContain('scripts/install-tee-cron.sh:7');
  });

  it('rejects joined aliases, nonliteral sinks, incremental args, shell URLs, and optional env access', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'install-joined-cron.py'),
      [
        "args = ['agy', 'pr', '--token', os.environ['GITHUB_TOKEN']]",
        "entry = f\"0 3 * * * {' '.join(args)}\"",
        "subprocess.run(['/usr/bin/crontab', '-'], input=entry)",
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'install-joined-cron.mjs'),
      [
        'const credential = process?.env?.GITHUB_TOKEN;',
        'const schedule = process.argv[2];',
        'const entry = `${schedule} agy pr --token ${credential}`;',
        "spawnSync('/usr/bin/crontab', ['-'], { input: entry });",
        "const ghArgs = ['auth'];",
        "ghArgs.push('token');",
        "const secondCredential = execFileSync('gh', ghArgs);",
        'const second = `0 4 * * * agy pr --token ${secondCredential}`;',
        "execSync(`printf '%s\\n' ${second} | crontab -`);",
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'install-url-cron.sh'),
      [
        "auth=\"$(/usr/bin/env gh auth token)\"",
        'CRON_CMD="0 5 * * * agy pr --token $auth"',
        "crontab - <<CRON",
        '* * * * * curl https://example.invalid/?token=$GITHUB_TOKEN',
        'CRON',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/install-joined-cron.py:3');
    expect(result.stderr).toContain('scripts/install-joined-cron.mjs:4');
    expect(result.stderr).toContain('scripts/install-joined-cron.mjs:8');
    expect(result.stderr).toContain('scripts/install-url-cron.sh:2');
    expect(result.stderr).toContain('scripts/install-url-cron.sh:4');
  });

  it('rejects Codex round 26 cron scanner bypasses', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'round-26-cron.mjs'),
      [
        "const cli = 'gh';",
        "const fromCliAlias = execFileSync(cli, ['auth', 'token']);",
        'const cliEntry = `0 1 * * * agy pr --token ${fromCliAlias}`;',
        "const bracketEnv = process['env'];",
        'const fromBracketEnv = bracketEnv.GITHUB_TOKEN;',
        'const bracketEntry = `0 2 * * * agy pr --token ${fromBracketEnv}`;',
        'let shadowed = process.env.GITHUB_TOKEN;',
        'if (debug) {',
        "  const shadowed = 'diagnostic';",
        '}',
        'const shadowedEntry = `0 3 * * * agy pr --token ${shadowed}`;',
        'const [destructured] = [process.env.GITHUB_TOKEN];',
        'const destructuredEntry = `0 4 * * * agy pr --token ${destructured}`;',
        'const stagedCredential = process.env.GITHUB_TOKEN;',
        'const stagedEntry = `${process.argv[2]} agy pr --token ${stagedCredential}`;',
        "writeFileSync('/tmp/round-26-jobs', stagedEntry);",
        "execFileSync('crontab', ['/tmp/round-26-jobs']);",
        'const midnightEntry = `@midnight agy pr --token ${process.env.GITHUB_TOKEN}`;',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'round-26-cron.py'),
      [
        'import os as os_',
        'import subprocess',
        'from pathlib import Path',
        "TOKEN_ENV = 'GITHUB_TOKEN'",
        'from_pop = os_.environ.pop(TOKEN_ENV)',
        "pop_entry = f'0 5 * * * agy pr --token {from_pop}'",
        'get_env = os_.getenv',
        "from_getter = get_env('GITHUB_TOKEN')",
        "getter_entry = f'0 6 * * * agy pr --token {from_getter}'",
        "tuple_credential, _ = os_.environ['GITHUB_TOKEN'], None",
        "tuple_entry = f'0 7 * * * agy pr --token {tuple_credential}'",
        "staged = f'{sys.argv[1]} agy pr --token {os_.environ[\"GITHUB_TOKEN\"]}'",
        "Path('/tmp/round-26-python-jobs').write_text(staged)",
        "subprocess.run(['crontab', '/tmp/round-26-python-jobs'])",
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'round-26-cron.sh'),
      [
        'auth="$(/usr/bin/printenv GITHUB_TOKEN)"',
        'CRON_CMD="0 8 * * * agy pr --token $auth"',
        "printf '%s\\n' '0 9 * * * agy pr' >/tmp/round-26-shell-jobs",
        "printf '%s\\n' \"--token $GITHUB_TOKEN\" >>/tmp/round-26-shell-jobs",
        'crontab -u "$USER" /tmp/round-26-shell-jobs',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'round-26-sink.mjs'),
      [
        "const sink = '/usr/bin/crontab';",
        'const sinkEntry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        "spawnSync(sink, ['-'], { input: sinkEntry });",
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/round-26-cron.mjs:3');
    expect(result.stderr).toContain('scripts/round-26-cron.mjs:6');
    expect(result.stderr).toContain('scripts/round-26-cron.mjs:11');
    expect(result.stderr).toContain('scripts/round-26-cron.mjs:13');
    expect(result.stderr).toContain('scripts/round-26-cron.mjs:16');
    expect(result.stderr).toContain('scripts/round-26-cron.mjs:18');
    expect(result.stderr).toContain('scripts/round-26-cron.py:6');
    expect(result.stderr).toContain('scripts/round-26-cron.py:9');
    expect(result.stderr).toContain('scripts/round-26-cron.py:11');
    expect(result.stderr).toContain('scripts/round-26-cron.py:13');
    expect(result.stderr).toContain('scripts/round-26-cron.sh:2');
    expect(result.stderr).toContain('scripts/round-26-cron.sh:4');
    expect(result.stderr).toContain('scripts/round-26-sink.mjs:3');
  });

  it('rejects Codex round 27 cron scanner bypasses', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'round-27-cron.mjs'),
      [
        'const parts = [];',
        'parts.push(process.env.GITHUB_TOKEN);',
        'const pushed = `0 1 * * * agy pr --token ${parts.join(" ")}`;',
        'const copied = { ...process.env };',
        'const copiedEntry = `0 2 * * * agy pr --token ${copied.GITHUB_TOKEN}`;',
        "const computed = process.env['GITHUB_' + 'TOKEN'];",
        'const computedEntry = `0 3 * * * agy pr --token ${computed}`;',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'round-27-cron.py'),
      [
        'import os',
        'import subprocess',
        'parts = []',
        "parts.append(os.environ['GITHUB_TOKEN'])",
        "entry = f\"0 4 * * * agy pr --token {' '.join(parts)}\"",
        "subprocess.call(['crontab', '-'], input=entry)",
        'copied = os.environ.copy()',
        "copied_entry = f\"0 5 * * * agy pr --token {copied['GITHUB_TOKEN']}\"",
        "computed = os.environ['GITHUB_' + 'TOKEN']",
        "computed_entry = f'0 6 * * * agy pr --token {computed}'",
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'round-27-cron.sh'),
      [
        'readonly -g auth="$GITHUB_TOKEN"',
        'CRON_CMD="0 7 * * * agy pr --token $auth"',
        '{',
        "  printf '%s\\n' '0 8 * * * agy pr'",
        "  printf '%s\\n' \"--token $GITHUB_TOKEN\"",
        '} > /tmp/round-27-jobs',
        'crontab /tmp/round-27-jobs',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/round-27-cron.mjs:3');
    expect(result.stderr).toContain('scripts/round-27-cron.mjs:5');
    expect(result.stderr).toContain('scripts/round-27-cron.mjs:7');
    expect(result.stderr).toContain('scripts/round-27-cron.py:5');
    expect(result.stderr).toContain('scripts/round-27-cron.py:6');
    expect(result.stderr).toContain('scripts/round-27-cron.py:8');
    expect(result.stderr).toContain('scripts/round-27-cron.py:10');
    expect(result.stderr).toContain('scripts/round-27-cron.sh:2');
    expect(result.stderr).toContain('scripts/round-27-cron.sh:5');
  });

  it('rejects unresolved current-head Codex cron scanner bypasses', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    const packageDir = join(root, 'packages', 'example');
    mkdirSync(scriptDir, { recursive: true });
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'current-head-cron.mjs'),
      [
        "const { auth: { GITHUB_TOKEN: nestedCredential } } = process.env;",
        'const nestedEntry = `0 1 * * * agy pr --token ${nestedCredential}`;',
        "const { env: commonEnv } = require('node:process');",
        'const commonCredential = commonEnv.GITHUB_TOKEN;',
        'const commonEntry = `0 2 * * * agy pr --token ${commonCredential}`;',
        "const { execFileSync: runGh } = require('node:child_process');",
        "const helperCredential = runGh('gh', ['auth', 'token']);",
        'const helperEntry = `0 3 * * * agy pr --token ${helperCredential}`;',
        "const child = spawn('crontab', ['-']);",
        'const stdinEntry = `0 4 * * * agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'child.stdin.write(stdinEntry);',
        'child.stdin.end();',
        "const { GITHUB_TOKEN: bracketCredential } = process['env'];",
        'const bracketEntry = `0 5 * * * agy pr --token ${bracketCredential}`;',
        "const ghArgs = ['auth'];",
        "ghArgs.extend(['token']);",
        "const extendedCredential = execFileSync('gh', ghArgs);",
        'const extendedEntry = `0 6 * * * agy pr --token ${extendedCredential}`;',
        'let fallbackCredential = process.env.GITHUB_TOKEN;',
        'if (!fallbackCredential) fallbackCredential = loadCredential();',
        'const fallbackEntry = `0 7 * * * agy pr --token ${fallbackCredential}`;',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'multiline-process-import.mjs'),
      [
        'import {',
        '  env as runtimeEnv,',
        "} from 'node:process';",
        'const importedCredential = runtimeEnv.GITHUB_TOKEN;',
        'const entry = `0 8 * * * agy pr --token ${importedCredential}`;',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'stdin-end-cron.mjs'),
      [
        "const installer = spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'current-head-cron.py'),
      [
        'import os',
        'import subprocess',
        'from subprocess import check_output as run_gh',
        "computed_getenv = os.getenv('GITHUB_' + 'TOKEN')",
        "getenv_entry = f'0 9 * * * agy pr --token {computed_getenv}'",
        "computed_environ = os.environ.get('GITHUB_' + 'TOKEN')",
        "environ_entry = f'0 10 * * * agy pr --token {computed_environ}'",
        "helper_credential = run_gh(['gh', 'auth', 'token'], text=True)",
        "helper_entry = f'0 11 * * * agy pr --token {helper_credential}'",
        "child = subprocess.Popen(['crontab', '-'], stdin=subprocess.PIPE, text=True)",
        "communicate_entry = f\"0 12 * * * agy pr --token {os.environ['GITHUB_TOKEN']}\"",
        'child.communicate(communicate_entry)',
        "system_entry = f\"0 13 * * * agy pr --token {os.environ['GITHUB_TOKEN']}\"",
        "os.system(f\"printf '%s\\n' '{system_entry}' | crontab -\")",
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'current-head-cron.sh'),
      [
        'gh_cli=gh',
        'auth="$($gh_cli auth token)"',
        'CRON_CMD="0 14 * * * agy pr --token $auth"',
        'installer=crontab',
        'printf "%s\\n" "agy pr --token $GITHUB_TOKEN" | "$installer" -',
        'jobs=/tmp/current-head-jobs',
        'printf "GITHUB_TOKEN=%s\\n" "$GITHUB_TOKEN" >"$jobs"',
        'crontab "$jobs"',
        '(',
        "  printf '%s\\n' '0 17 * * * agy pr'",
        '  printf "--token %s\\n" "$GITHUB_TOKEN"',
        ') > /tmp/current-head-grouped-jobs',
        'crontab /tmp/current-head-grouped-jobs',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(packageDir, 'maintenance.sh'),
      ['entry="0 18 * * * agy pr --token $GITHUB_TOKEN"', 'printf "%s\\n" "$entry" | crontab -'].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    for (const location of [
      'scripts/current-head-cron.mjs:2',
      'scripts/current-head-cron.mjs:5',
      'scripts/current-head-cron.mjs:8',
      'scripts/current-head-cron.mjs:11',
      'scripts/current-head-cron.mjs:14',
      'scripts/current-head-cron.mjs:18',
      'scripts/current-head-cron.mjs:21',
      'scripts/multiline-process-import.mjs:5',
      'scripts/stdin-end-cron.mjs:3',
      'scripts/current-head-cron.py:5',
      'scripts/current-head-cron.py:7',
      'scripts/current-head-cron.py:9',
      'scripts/current-head-cron.py:12',
      'scripts/current-head-cron.py:14',
      'scripts/current-head-cron.sh:3',
      'scripts/current-head-cron.sh:5',
      'scripts/current-head-cron.sh:7',
      'scripts/current-head-cron.sh:11',
      'packages/example/maintenance.sh:2',
    ]) {
      expect(result.stderr).toContain(location);
    }
  });

  it('rejects object-qualified Node child_process crontab stdin writes', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'object-qualified-cron.mjs'),
      [
        "const childProcess = require('node:child_process');",
        "const child = childProcess.spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'child.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'namespace-cron.mjs'),
      [
        "import * as cp from 'node:child_process';",
        "const installer = cp.spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'spaced-require-cron.cjs'),
      [
        "const cp = require ('node:child_process');",
        "const installer = cp.spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'hoisted-namespace-cron.mjs'),
      [
        "const installer = cp.spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
        "import * as cp from 'node:child_process';",
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'default-import-cron.mjs'),
      [
        "import cp from 'node:child_process';",
        "const installer = cp.spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'typed-commonjs-cron.ts'),
      [
        "const cp = require('node:child_process') as typeof import('node:child_process');",
        "const installer = cp.spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'combined-default-cron.mjs'),
      [
        "import cp, { execFile } from 'node:child_process';",
        "const installer = cp.spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'named-default-cron.mjs'),
      [
        "import { default as cp } from 'node:child_process';",
        "const installer = cp.spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'direct-require-cron.cjs'),
      [
        "const installer = require('node:child_process').spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'import-equals-cron.ts'),
      [
        "import cp = require('node:child_process');",
        "const installer = cp.spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'commented-import-cron.mjs'),
      [
        "import * as cp from 'node:child_process'; // helpers",
        "const installer = cp.spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'combined-namespace-cron.mjs'),
      [
        "import childProcess, * as cp from 'node:child_process';",
        "const installer = cp.spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'split-direct-require-cron.cjs'),
      [
        "const installer = require('node:child_process')",
        "  .spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'split-namespace-cron.mjs'),
      [
        "import * as cp from 'node:child_process';",
        'const installer = cp',
        "  .spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'dynamic-import-cron.mjs'),
      [
        "const cp = await import('node:child_process');",
        "const installer = cp.spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'bracket-spawn-cron.mjs'),
      [
        "import * as cp from 'node:child_process';",
        "const installer = cp['spawn']('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'typed-process-cron.ts'),
      [
        "import * as cp from 'node:child_process';",
        "const installer: ChildProcess = cp.spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'multi-declarator-cron.cjs'),
      [
        "const cp = require('node:child_process'), fs = require('node:fs');",
        "const installer = cp.spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'wrapped-import-cron.mjs'),
      [
        'import * as cp',
        "  from 'node:child_process';",
        "const installer = cp.spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'spawn-method-alias-cron.mjs'),
      [
        "import * as cp from 'node:child_process';",
        'const run = cp.spawn;',
        "const installer = run('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'parenthesized-require-cron.ts'),
      [
        "const installer = (require('node:child_process') as typeof import('node:child_process')).spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'colon-spawn-alias-cron.cjs'),
      [
        "const { spawn: run } = require('node:child_process');",
        "const installer = run('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'typed-spawn-alias-cron.ts'),
      [
        "import * as cp from 'node:child_process';",
        'const run: typeof cp.spawn = cp.spawn;',
        "const installer = run('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'angle-asserted-require-cron.ts'),
      [
        "const installer = (<typeof import('node:child_process')>require('node:child_process')).spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'wrapped-commonjs-alias-cron.cjs'),
      [
        "const cp = (require('node:child_process'));",
        "const installer = cp.spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'bare-destructured-spawn-cron.cjs'),
      [
        "const { spawn: run } = require('child_process');",
        "const installer = run('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'parenthesized-typed-alias-cron.ts'),
      [
        "const cp = (require('node:child_process') as typeof import('node:child_process'));",
        "const installer = cp.spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'split-module-specifier-cron.mjs'),
      [
        'import * as cp from',
        "  'node:child_process';",
        "const installer = cp.spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'destructured-namespace-spawn-cron.mjs'),
      [
        "import * as cp from 'node:child_process';",
        'const { spawn: run } = cp;',
        "const installer = run('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'split-after-dot-cron.mjs'),
      [
        "import * as cp from 'node:child_process';",
        'const installer = cp.',
        "  spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'optional-chain-spawn-cron.mjs'),
      [
        "import * as cp from 'node:child_process';",
        "const installer = cp?.spawn?.('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/object-qualified-cron.mjs:4');
    expect(result.stderr).toContain('scripts/namespace-cron.mjs:4');
    expect(result.stderr).toContain('scripts/spaced-require-cron.cjs:4');
    expect(result.stderr).toContain('scripts/hoisted-namespace-cron.mjs:3');
    expect(result.stderr).toContain('scripts/default-import-cron.mjs:4');
    expect(result.stderr).toContain('scripts/typed-commonjs-cron.ts:4');
    expect(result.stderr).toContain('scripts/combined-default-cron.mjs:4');
    expect(result.stderr).toContain('scripts/named-default-cron.mjs:4');
    expect(result.stderr).toContain('scripts/direct-require-cron.cjs:3');
    expect(result.stderr).toContain('scripts/import-equals-cron.ts:4');
    expect(result.stderr).toContain('scripts/commented-import-cron.mjs:4');
    expect(result.stderr).toContain('scripts/combined-namespace-cron.mjs:4');
    expect(result.stderr).toContain('scripts/split-direct-require-cron.cjs:4');
    expect(result.stderr).toContain('scripts/split-namespace-cron.mjs:5');
    expect(result.stderr).toContain('scripts/dynamic-import-cron.mjs:4');
    expect(result.stderr).toContain('scripts/bracket-spawn-cron.mjs:4');
    expect(result.stderr).toContain('scripts/typed-process-cron.ts:4');
    expect(result.stderr).toContain('scripts/multi-declarator-cron.cjs:4');
    expect(result.stderr).toContain('scripts/wrapped-import-cron.mjs:5');
    expect(result.stderr).toContain('scripts/spawn-method-alias-cron.mjs:5');
    expect(result.stderr).toContain('scripts/parenthesized-require-cron.ts:3');
    expect(result.stderr).toContain('scripts/colon-spawn-alias-cron.cjs:4');
    expect(result.stderr).toContain('scripts/typed-spawn-alias-cron.ts:5');
    expect(result.stderr).toContain('scripts/angle-asserted-require-cron.ts:3');
    expect(result.stderr).toContain('scripts/wrapped-commonjs-alias-cron.cjs:4');
    expect(result.stderr).toContain('scripts/bare-destructured-spawn-cron.cjs:4');
    expect(result.stderr).toContain('scripts/parenthesized-typed-alias-cron.ts:4');
    expect(result.stderr).toContain('scripts/split-module-specifier-cron.mjs:5');
    expect(result.stderr).toContain('scripts/destructured-namespace-spawn-cron.mjs:5');
    expect(result.stderr).toContain('scripts/split-after-dot-cron.mjs:5');
    expect(result.stderr).toContain('scripts/optional-chain-spawn-cron.mjs:4');
  });

  it('rejects assigned CommonJS child_process namespace crontab stdin writes', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'assigned-commonjs-cron.cjs'),
      [
        'let cp;',
        "cp = require('node:child_process');",
        "const installer = cp.spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/assigned-commonjs-cron.cjs:5');
  });

  it('rejects direct require crontab spawn calls split after assignment', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'split-assignment-require-cron.cjs'),
      [
        'const installer =',
        "  require('node:child_process').spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/split-assignment-require-cron.cjs:4');
  });

  it('rejects split assignments followed by split child_process spawn chains', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'split-assignment-chain-cron.cjs'),
      [
        'const installer =',
        "  require('node:child_process')",
        "    .spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/split-assignment-chain-cron.cjs:5');
  });

  it('rejects multiline dynamic-import namespace crontab stdin writes', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'multiline-dynamic-import-cron.mjs'),
      [
        'const cp = await import(',
        "  'node:child_process',",
        ');',
        "const installer = cp.spawn('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/multiline-dynamic-import-cron.mjs:6');
  });

  it('rejects destructured dynamic-import spawn aliases used for crontab stdin writes', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'destructured-dynamic-import-cron.mjs'),
      [
        "const { spawn: launch } = await import('node:child_process');",
        "const installer = launch('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/destructured-dynamic-import-cron.mjs:4');
  });

  it('rejects bound namespace spawn aliases used for crontab stdin writes', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'bound-spawn-alias-cron.mjs'),
      [
        "import * as cp from 'node:child_process';",
        'const run = cp.spawn.bind(cp);',
        "const installer = run('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/bound-spawn-alias-cron.mjs:5');
  });

  it('rejects spawn aliases bound with null or pre-bound crontab arguments', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'null-bound-spawn-cron.mjs'),
      [
        "import * as cp from 'node:child_process';",
        'const run = cp.spawn.bind(null);',
        "const installer = run('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'prebound-command-spawn-cron.mjs'),
      [
        "import * as cp from 'node:child_process';",
        "const run = cp.spawn.bind(cp, 'crontab');",
        "const installer = run(['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/null-bound-spawn-cron.mjs:5');
    expect(result.stderr).toContain('scripts/prebound-command-spawn-cron.mjs:5');
  });

  it('rejects typed destructured require spawn aliases used for crontab stdin writes', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'typed-destructured-require-cron.ts'),
      [
        "const { spawn: run } = require('node:child_process') as typeof import('node:child_process');",
        "const installer = run('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/typed-destructured-require-cron.ts:4');
  });

  it('rejects TypeScript-asserted namespace spawn aliases used for crontab stdin writes', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'asserted-namespace-spawn-cron.ts'),
      [
        "import * as cp from 'node:child_process';",
        'const run = cp.spawn as typeof cp.spawn;',
        "const installer = run('crontab', ['-']);",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'installer.stdin.end(entry);',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scripts/asserted-namespace-spawn-cron.ts:5');
  });

  it('does not treat scoped runtime child_process aliases as file-wide', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'scoped-child-process-alias.mjs'),
      [
        'function earlierMock(mockSpawn) {',
        '  const cp = { spawn: mockSpawn };',
        "  const installer = cp.spawn('crontab', ['-']);",
        '  const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        '  installer.stdin.end(entry);',
        '}',
        'function loadChildProcess() {',
        "  const cp = require('node:child_process');",
        '  return cp;',
        '}',
        'function laterMock(mockSpawn) {',
        '  const cp = { spawn: mockSpawn };',
        "  const installer = cp.spawn('crontab', ['-']);",
        '  const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        '  installer.stdin.end(entry);',
        '}',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(0);
  });

  it('rejects Codex round 28 cron scanner bypasses', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'round-28-cron.mjs'),
      [
        'const proc = process;',
        'const credential = proc.env.GITHUB_TOKEN;',
        'const aliasEntry = `0 1 * * * agy pr --token ${credential}`;',
        'const envCopy = Object.assign({}, process.env);',
        'const copiedEntry = `0 2 * * * agy pr --token ${envCopy.GITHUB_TOKEN}`;',
        "const jobFile = '/tmp/round-28-jobs';",
        'const stagedCredential = process.env.GITHUB_TOKEN;',
        'const stagedEntry = `${process.argv[2]} agy pr --token ${stagedCredential}`;',
        'writeFileSync(jobFile, stagedEntry);',
        "execFileSync('crontab', [jobFile]);",
        'const child = spawn(',
        "  'crontab',",
        "  ['-'],",
        ');',
        'const stdinEntry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'child.stdin.end(stdinEntry);',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'round-28-cron.py'),
      [
        'import os',
        'env = os.environ',
        'env_get = env.get',
        "credential = env_get('GITHUB_TOKEN')",
        "entry = f'{sys.argv[1]} agy pr --token {credential}'",
        "os.system(f\"printf '%s\\n' '{entry}' | crontab -\")",
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'round-28-cron.sh'),
      [
        'gh_cli=/usr/bin/gh',
        'auth="$($gh_cli auth token)"',
        'CRON_CMD="0 3 * * * agy pr --token $auth"',
        'installer=/usr/bin/crontab',
        'printf "%s\\n" "agy pr --token $GITHUB_TOKEN" | "$installer" -',
        "cat <<'EOF' | envsubst | crontab -",
        '0 4 * * * agy pr --token "$GITHUB_TOKEN"',
        'EOF',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    for (const location of [
      'scripts/round-28-cron.mjs:3',
      'scripts/round-28-cron.mjs:5',
      'scripts/round-28-cron.mjs:9',
      'scripts/round-28-cron.mjs:16',
      'scripts/round-28-cron.py:6',
      'scripts/round-28-cron.sh:3',
      'scripts/round-28-cron.sh:5',
      'scripts/round-28-cron.sh:7',
    ]) {
      expect(result.stderr).toContain(location);
    }
  });

  it('rejects Codex round 29 cron scanner bypasses', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'round-29-cron.mjs'),
      [
        "import proc from 'node:process';",
        'const importedCredential = proc.env.GITHUB_TOKEN;',
        'const importedEntry = `0 1 * * * agy pr --token ${importedCredential}`;',
        'const ghArgs = [',
        "  'auth',",
        "  'token',",
        '];',
        "const ghCredential = execFileSync('gh', ghArgs);",
        'const ghEntry = `0 2 * * * agy pr --token ${ghCredential}`;',
        'const ignored = 1, declaredCredential = process.env.GITHUB_TOKEN;',
        'const declaredEntry = `0 3 * * * agy pr --token ${declaredCredential}`;',
        'const assertedCredential = process.env!.GITHUB_TOKEN;',
        'const assertedEntry = `0 4 * * * agy pr --token ${assertedCredential}`;',
        'const castCredential = (process.env as Record<string, string>).GITHUB_TOKEN;',
        'const castEntry = `0 5 * * * agy pr --token ${castCredential}`;',
        "const command = ['crontab', '-'];",
        'const commandEntry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'spawnSync(command[0], command.slice(1), { input: commandEntry });',
        "execFile('gh', ['auth', 'token'], installCron);",
        'function installCron(error, stdout) {',
        '  const callbackEntry = `0 6 * * * agy pr --token ${stdout}`;',
        "  spawnSync('crontab', ['-'], { input: callbackEntry });",
        '}',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'round-29-cron.sh'),
      [
        'jobs=/tmp/round-29-jobs',
        'printf "GITHUB_TOKEN=%s\\n" "$GITHUB_TOKEN">"$jobs"',
        "printf '%s\\n' '0 7 * * * agy pr' >>\"$jobs\"",
        'crontab "$jobs"',
        'alias_jobs=/tmp/round-29-alias-jobs',
        'installer=crontab',
        'printf "GITHUB_TOKEN=%s\\n" "$GITHUB_TOKEN" >"$alias_jobs"',
        '"$installer" "$alias_jobs"',
        'local ignored=1 auth="$GITHUB_TOKEN"',
        'CRON_CMD="0 8 * * * agy pr --token $auth"',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    for (const location of [
      'scripts/round-29-cron.mjs:3',
      'scripts/round-29-cron.mjs:9',
      'scripts/round-29-cron.mjs:11',
      'scripts/round-29-cron.mjs:13',
      'scripts/round-29-cron.mjs:15',
      'scripts/round-29-cron.mjs:18',
      'scripts/round-29-cron.mjs:21',
      'scripts/round-29-cron.sh:2',
      'scripts/round-29-cron.sh:7',
      'scripts/round-29-cron.sh:10',
    ]) {
      expect(result.stderr).toContain(location);
    }
  });

  it('rejects Codex round 30 cron scanner bypasses without flagging read-only or runtime lookups', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'round-30-commonjs.js'),
      [
        "const proc = require('node:process');",
        'const token = proc.env.GITHUB_TOKEN;',
        'const entry = `0 1 * * * agy pr --token ${token}`;',
        "writeFileSync('/tmp/jobs-commonjs', entry);",
        "execFileSync('crontab', ['/tmp/jobs-commonjs']);",
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'round-30-path.py'),
      [
        "job_path = Path('/tmp/jobs-path')",
        "entry = f\"{sys.argv[1]} agy pr --token {os.environ['GITHUB_TOKEN']}\"",
        'job_path.write_text(entry)',
        "subprocess.run(['crontab', str(job_path)])",
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'round-30-shell.sh'),
      [
        '#!/usr/bin/env bash',
        'CRON_CMD="0 1 * * * agy pr --token \'$GITHUB_TOKEN\'"',
        'gh_cli=$(command -v gh)',
        'auth="$($gh_cli auth token)"',
        'CRON_CMD="0 2 * * * agy pr --token $auth"',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scriptDir, 'round-30-argv.py'),
      [
        "cmd = ['gh', 'auth', 'token']",
        'token = check_output(cmd, text=True).strip()',
        'entry = f"0 1 * * * agy pr --token {token}"',
        "Path('/tmp/jobs-argv').write_text(entry)",
        "run(['crontab', '/tmp/jobs-argv'])",
      ].join('\n'),
      'utf8',
    );

    const rejected = runScanner(root);

    expect(rejected.status).toBe(1);
    for (const location of [
      'scripts/round-30-commonjs.js:3',
      'scripts/round-30-path.py:3',
      'scripts/round-30-shell.sh:2',
      'scripts/round-30-shell.sh:5',
      'scripts/round-30-argv.py:3',
    ]) {
      expect(rejected.stderr).toContain(location);
    }

    const allowedRoot = makeFixtureRoot();
    const allowedScriptDir = join(allowedRoot, 'scripts');
    mkdirSync(allowedScriptDir, { recursive: true });
    writeFileSync(
      join(allowedScriptDir, 'list-crontab.js'),
      "spawnSync('crontab', ['-l'], { env: { ...process.env, GITHUB_TOKEN: process.env.GITHUB_TOKEN } });\n",
      'utf8',
    );
    writeFileSync(
      join(allowedScriptDir, 'runtime-host.sh'),
      "printf '%s\\n' '0 1 * * * GITHUB_TOKEN=$(GH_HOST=github.example gh auth token) agy pr' | crontab -\n",
      'utf8',
    );

    const allowed = runScanner(allowedRoot);
    expect(allowed.status, allowed.stderr).toBe(0);
  });

  it('rejects Codex round 33 cron scanner bypasses without flagging shell-string crontab reads', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    const fixtures: Record<string, string[]> = {
      'namespace-process.mjs': [
        "import * as proc from 'node:process';",
        'const entry = `${process.argv[2]} agy pr --token ${proc.env.GITHUB_TOKEN}`;',
        "spawnSync('crontab', ['-'], { input: entry });",
      ],
      'optional-process.mjs': [
        "const proc = require('node:process');",
        'const entry = `${process.argv[2]} agy pr --token ${proc?.env?.GITHUB_TOKEN}`;',
        "spawnSync('crontab', ['-'], { input: entry });",
      ],
      'crontab-command.sh': [
        'installer=$(command -v crontab)',
        'entry="$1 agy pr --token $GITHUB_TOKEN"',
        'printf "%s\\n" "$entry" | "$installer" -',
      ],
      'crontab-array.mjs': [
        "const command = ['env', 'crontab', '-'];",
        'const entry = `${process.argv[2]} agy pr --token ${process.env.GITHUB_TOKEN}`;',
        'spawnSync(command[0], command.slice(1), { input: entry });',
      ],
      'quoted-stage.sh': [
        "cat <<'EOF' >/tmp/jobs-envsubst",
        '$1 agy pr --token $GITHUB_TOKEN',
        'EOF',
        'envsubst < /tmp/jobs-envsubst | crontab -',
      ],
      'file-handle.py': [
        'entry = f"{sys.argv[1]} agy pr --token {os.environ[\'GITHUB_TOKEN\']}"',
        "with open('/tmp/jobs-handle', 'w') as jobs:",
        '    jobs.write(entry)',
        "subprocess.run(['crontab', '/tmp/jobs-handle'])",
      ],
      'promisified-exec.mjs': [
        'const execFileAsync = promisify(execFile);',
        "const { stdout } = await execFileAsync('gh', ['auth', 'token']);",
        'const entry = `${process.argv[2]} agy pr --token ${stdout}`;',
        "spawnSync('crontab', ['-'], { input: entry });",
      ],
    };
    for (const [name, lines] of Object.entries(fixtures)) {
      writeFileSync(join(scriptDir, name), lines.join('\n'), 'utf8');
    }

    const rejected = runScanner(root);

    expect(rejected.status).toBe(1);
    for (const location of [
      'scripts/namespace-process.mjs:3',
      'scripts/optional-process.mjs:3',
      'scripts/crontab-command.sh:3',
      'scripts/crontab-array.mjs:3',
      'scripts/quoted-stage.sh:2',
      'scripts/file-handle.py:3',
      'scripts/promisified-exec.mjs:4',
    ]) {
      expect(rejected.stderr).toContain(location);
    }

    const allowedRoot = makeFixtureRoot();
    const allowedScriptDir = join(allowedRoot, 'scripts');
    mkdirSync(allowedScriptDir, { recursive: true });
    writeFileSync(
      join(allowedScriptDir, 'list-crontab.js'),
      "execSync('crontab -l', { env: { ...process.env, GITHUB_TOKEN: process.env.GITHUB_TOKEN } });\n",
      'utf8',
    );

    const allowed = runScanner(allowedRoot);
    expect(allowed.status, allowed.stderr).toBe(0);
  });

  it('allows direct crontab installs that defer gh auth token lookup until runtime', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'runtime-gh-cron.sh'),
      [
        "printf '%s\\n' '0 3 * * * GITHUB_TOKEN=$(gh auth token) agy pr' | crontab -",
        "crontab - <<'EOF'",
        '0 4 * * * GITHUB_TOKEN=$(gh auth token) agy pr',
        'EOF',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(0);
  });

  it('allows bare token arguments and absolute-path runtime gh token substitutions', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'round-27-safe.mjs'),
      [
        "const args = ['auth', 'token'];",
        "const CRON_CMD = '0 3 * * * GITHUB_TOKEN=$(/usr/bin/gh auth token) agy pr';",
        "const CRON_CMD_2 = '0 4 * * * GITHUB_TOKEN=$(command /usr/local/bin/gh auth token) agy pr';",
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(0);
  });

  it('allows quoted runtime env-file credentials in shell cron commands and heredocs', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'install-runtime-cron.sh'),
      [
        "CRON_CMD='0 3 * * * . /etc/franken.env; agy pr --token \"$GITHUB_TOKEN\"'",
        "CRON_COMMAND=\"0 4 * * * . /etc/franken.env; agy pr --token \\\$GITHUB_TOKEN\"",
        "cat <<'EOF' | crontab -",
        '0 5 * * * . /etc/franken.env; agy pr --token "$GITHUB_TOKEN"',
        'EOF',
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(0);
  });

  it('allows runtime gh token substitutions in cron strings', () => {
    const root = makeFixtureRoot();
    const scriptDir = join(root, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(
      join(scriptDir, 'install-cron.mjs'),
      [
        "const CRON_CMD = '0 3 * * * GITHUB_TOKEN=$(gh auth token) agy pr';",
        "const CRON_CMD_2 = '0 4 * * * GITHUB_TOKEN=$(command gh auth token) agy pr';",
        "const token = '$(gh auth token)';",
        'const CRON_CMD_3 = `0 5 * * * agy pr --token ${token}`;',
      ].join('\n'),
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
      [
        "spawnSync('deployctl', ['login', '--token', process.env.DEPLOY_TOKEN]);",
        'const runtimeArgs = [',
        "  'agy',",
        "  'pr',",
        "  '--token',",
        "  '$(gh auth token)',",
        '];',
        "const CRON_CMD = `0 5 * * * ${runtimeArgs.join(' ')}`;",
      ].join('\n'),
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

  it('redacts raw credential-shaped token matches from deterministic scan findings', () => {
    const root = makeFixtureRoot();
    const sourceDir = join(root, 'packages', 'example', 'src');
    mkdirSync(sourceDir, { recursive: true });
    const githubToken = `github_pat_${'A'.repeat(40)}`;
    const classicGithubToken = `ghp_${'D'.repeat(40)}`;
    const anthropicToken = `sk-ant-${'B'.repeat(40)}`;
    const googleToken = `AIza${'C'.repeat(35)}`;
    const googleTokenEndingInDash = `AIza${'E'.repeat(34)}-`;
    const adjacentSecret = 'super-secret';
    writeFileSync(
      join(sourceDir, 'config.ts'),
      [
        `export const github = '${githubToken}';`,
        `export const anthropic = '${anthropicToken}';`,
        `export const google = '${googleToken}';`,
        `export const classicGitHub = '${classicGithubToken}';`,
        `const jwtSecret = '${adjacentSecret}'; const gh = '${githubToken}';`,
        `// db password=${adjacentSecret} leaked token: ${githubToken}`,
        `/* leaked token: ${anthropicToken} */`,
        `export const suffixed = '${googleTokenEndingInDash}';`,
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(root, '.env.example'),
      [
        `SERVICE_URL=https://user:dbpass@example.test?token=${githubToken}`,
        `service_url=https://example.test/?token=${googleToken}`,
        `JWT_SECRET=prefix-${classicGithubToken}-local-secret`,
        `# leaked token: ${githubToken}`,
      ].join('\n'),
      'utf8',
    );

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('packages/example/src/config.ts:1');
    expect(result.stderr).toContain('packages/example/src/config.ts:2');
    expect(result.stderr).toContain('packages/example/src/config.ts:3');
    expect(result.stderr).toContain('packages/example/src/config.ts:4');
    expect(result.stderr).toContain('packages/example/src/config.ts:5');
    expect(result.stderr).toContain('packages/example/src/config.ts:6');
    expect(result.stderr).toContain('packages/example/src/config.ts:7');
    expect(result.stderr).toContain('packages/example/src/config.ts:8');
    expect(result.stderr).toContain('SERVICE_URL=<redacted>');
    expect(result.stderr).toContain('service_url=<redacted>');
    expect(result.stderr).toContain('JWT_SECRET=<redacted>');
    expect(result.stderr).toContain('.env.example:4: <redacted>');
    expect(result.stderr).not.toContain(githubToken);
    expect(result.stderr).not.toContain(classicGithubToken);
    expect(result.stderr).not.toContain(anthropicToken);
    expect(result.stderr).not.toContain(googleToken);
    expect(result.stderr).not.toContain(googleTokenEndingInDash);
    expect(result.stderr).not.toContain(adjacentSecret);
    expect(result.stderr).not.toContain('dbpass');
    expect(result.stderr).not.toContain('local-secret');
  });
});
