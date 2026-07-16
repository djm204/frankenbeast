import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = resolve(ROOT, 'scripts/profile-capability-self-test.mjs');

function runSelfTest(args: string[], env: Record<string, string | undefined> = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

function parseJson(stdout: string) {
  return JSON.parse(stdout) as {
    ok: boolean;
    checks: Array<{ id: string; status: string; detail: string; action?: string }>;
  };
}

describe('profile capability self-test', () => {
  it('fails JSON mode when provider and model labels do not match expectations', () => {
    const result = runSelfTest([
      '--json',
      '--provider', 'openai-codex',
      '--model', 'gpt-5.3-codex-spark',
      '--skip-github-auth',
    ], {
      HERMES_PROVIDER: 'ollama',
      HERMES_MODEL: 'gpt-oss:120b-cloud',
      HERMES_ENABLED_TOOLSETS: '',
      HERMES_DELIVER_TARGETS: '',
    });

    expect(result.status).toBe(1);
    const report = parseJson(result.stdout);
    expect(report.ok).toBe(false);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'provider-label', status: 'fail' }),
        expect.objectContaining({ id: 'model-label', status: 'fail' }),
      ]),
    );
  });

  it('reports missing required toolsets, approval route, and delivery target without contacting GitHub', () => {
    const result = runSelfTest([
      '--json',
      '--toolset', 'terminal,file,web',
      '--approval-cop', 'approval-cop',
      '--delivery-target', 'discord:1523806555047333968',
      '--skip-github-auth',
    ], {
      PATH: '/usr/bin:/bin',
      HERMES_ENABLED_TOOLSETS: 'terminal,file',
      HERMES_DELIVER_TARGETS: 'local',
    });

    expect(result.status).toBe(1);
    const report = parseJson(result.stdout);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'required-toolsets', status: 'fail' }),
        expect.objectContaining({ id: 'approval-cop-route', status: 'fail' }),
        expect.objectContaining({ id: 'delivery-targets', status: 'fail' }),
        expect.objectContaining({ id: 'github-auth', status: 'warn' }),
      ]),
    );
  });

  it('checks repo write access read-only and never invokes remote mutation commands on failure', () => {
    const binDir = mkdtempSync(join(tmpdir(), 'profile-self-test-bin-'));
    const callsPath = join(binDir, 'gh-calls.log');
    writeFileSync(join(binDir, 'gh'), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(callsPath)}\nif [ "$1 $2" = "auth status" ]; then exit 0; fi\nif [ "$1 $2" = "repo view" ]; then printf '{"viewerPermission":"READ"}\\n'; exit 0; fi\nexit 7\n`, { mode: 0o755 });

    const result = runSelfTest([
      '--json',
      '--repo', 'djm204/frankenbeast',
      '--require-repo-write',
    ], {
      PATH: `${binDir}:/usr/bin:/bin`,
      HERMES_ENABLED_TOOLSETS: '',
      HERMES_DELIVER_TARGETS: '',
    });

    expect(result.status).toBe(1);
    const report = parseJson(result.stdout);
    expect(report.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'repo-write-access', status: 'fail' })]),
    );

    const ghCalls = readFileSync(callsPath, 'utf8');
    expect(ghCalls).toContain('auth status');
    expect(ghCalls).toContain('repo view djm204/frankenbeast --json viewerPermission');
    expect(ghCalls).not.toMatch(/\b(issue|pr|repo)\s+(create|edit|delete|merge|close)|\bapi\s+-X\s+(POST|PUT|PATCH|DELETE)/u);
  });

  it('verifies the local checkout package identity before passing repository-root', () => {
    const checkout = mkdtempSync(join(tmpdir(), 'profile-self-test-other-repo-'));
    spawnSync('git', ['init'], { cwd: checkout, encoding: 'utf8' });
    writeFileSync(join(checkout, 'package.json'), JSON.stringify({ name: 'not-frankenbeast' }));

    const result = runSelfTest(['--json', '--root', checkout, '--skip-github-auth'], {
      HERMES_ENABLED_TOOLSETS: '',
      HERMES_DELIVER_TARGETS: '',
    });

    expect(result.status).toBe(1);
    const report = parseJson(result.stdout);
    expect(report.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'repository-root', status: 'fail' })]),
    );
  });

  it('parses approval-cop routes with arguments before appending --help', () => {
    const binDir = mkdtempSync(join(tmpdir(), 'profile-self-test-bin-'));
    const callsPath = join(binDir, 'approval-cop-calls.log');
    writeFileSync(join(binDir, 'approval-cop'), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(callsPath)}\nif [ "$1 $2 $3" = "run -- --help" ]; then exit 0; fi\nexit 9\n`, { mode: 0o755 });

    const result = runSelfTest([
      '--json',
      '--approval-cop', 'approval-cop run --',
      '--skip-github-auth',
    ], {
      PATH: `${binDir}:/usr/bin:/bin`,
      HERMES_ENABLED_TOOLSETS: '',
      HERMES_DELIVER_TARGETS: '',
    });

    const report = parseJson(result.stdout);
    expect(report.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'approval-cop-route', status: 'ok' })]),
    );
    expect(readFileSync(callsPath, 'utf8')).toContain('run -- --help');
  });
});
