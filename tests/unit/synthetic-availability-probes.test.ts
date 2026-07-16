import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = resolve(ROOT, 'scripts/synthetic-availability-probes.mjs');
const DOC = resolve(ROOT, 'docs/synthetic-availability-probes.md');

async function loadScript() {
  return import(`${SCRIPT}?case=${Date.now()}-${Math.random()}`) as Promise<{
    runSyntheticAvailabilityProbes: (options: Record<string, unknown>) => Promise<Record<string, unknown>>;
    formatProbeReportText: (report: Record<string, unknown>) => string;
  }>;
}

describe('synthetic availability probes', () => {
  it('runs read-only probes for critical workflows with timeout, latency, status, and remediation hints', async () => {
    const { runSyntheticAvailabilityProbes } = await loadScript();
    const tmp = mkdtempSync(join(tmpdir(), 'fbeast-availability-probes-'));
    const ledgerPath = join(tmp, 'ledger.json');
    const kanbanPath = join(tmp, 'kanban.db');
    writeFileSync(ledgerPath, JSON.stringify({ approvals: [{ id: 'approved-1', state: 'approved' }] }));
    writeFileSync(kanbanPath, 'sqlite placeholder');

    const execCalls: Array<{ file: string; args: string[] }> = [];
    const execFile = vi.fn(async (file: string, args: string[]) => {
      execCalls.push({ file, args });
      if (file === 'gh') return JSON.stringify([{ number: 1719, title: 'availability', state: 'OPEN' }]);
      if (file === 'node') return 'v24.0.0';
      throw new Error(`unexpected exec ${file}`);
    });
    const fetch = vi.fn(async (url: string) => ({ ok: true, status: 200, url }));
    const openSqliteReadOnly = vi.fn((path: string) => ({
      prepare: (sql: string) => ({ get: () => ({ count: path === kanbanPath && sql.includes('sqlite_master') ? 1 : 0 }) }),
      close: vi.fn(),
    }));

    const report = await runSyntheticAvailabilityProbes({
      config: {
        repo: 'djm204/frankenbeast',
        kanbanDbPath: kanbanPath,
        providerCommand: ['node', '--version'],
        dashboardHealthUrl: 'http://127.0.0.1:3737/health',
        approvalLedgerPath: ledgerPath,
        timeoutMs: 250,
      },
      execFile,
      fetch,
      openSqliteReadOnly,
      now: () => 1_000,
    });

    expect(report).toMatchObject({ ok: true, schemaVersion: 1 });
    const probes = report.probes as Array<Record<string, unknown>>;
    expect(probes.map((probe) => probe.name)).toEqual([
      'github_issue_read',
      'kanban_read',
      'provider_status',
      'dashboard_health',
      'approval_ledger_parse',
    ]);
    for (const probe of probes) {
      expect(probe).toMatchObject({ status: 'healthy', timeoutMs: 250 });
      expect(probe.latencyMs).toEqual(expect.any(Number));
      expect(probe.remediationHint).toEqual(expect.any(String));
    }
    expect(execCalls.find((call) => call.file === 'gh')?.args).toEqual([
      'issue',
      'list',
      '--repo',
      'djm204/frankenbeast',
      '--limit',
      '1',
      '--json',
      'number,title,state',
    ]);
    expect(JSON.stringify(execCalls)).not.toMatch(/issue edit|issue close|pr merge|kanban complete|approval/i);
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:3737/health', expect.objectContaining({ method: 'GET' }));

    rmSync(tmp, { recursive: true, force: true });
  });

  it('reports individual unavailable probes without aborting the suite', async () => {
    const { runSyntheticAvailabilityProbes } = await loadScript();
    const report = await runSyntheticAvailabilityProbes({
      config: {
        repo: 'djm204/frankenbeast',
        kanbanDbPath: '/missing/kanban.db',
        providerCommand: ['node', '--version'],
        dashboardHealthUrl: 'http://127.0.0.1:3737/health',
        approvalLedgerPath: '/missing/ledger.json',
        timeoutMs: 100,
      },
      execFile: vi.fn(async (file: string) => {
        if (file === 'gh') throw new Error('GitHub API unavailable');
        return 'provider ok';
      }),
      fetch: vi.fn(async () => ({ ok: false, status: 503 })),
      openSqliteReadOnly: vi.fn(() => { throw new Error('missing db'); }),
      readFile: vi.fn(async () => { throw new Error('missing ledger'); }),
      now: () => 2_000,
    });

    expect(report.ok).toBe(false);
    const statuses = Object.fromEntries((report.probes as Array<Record<string, unknown>>).map((probe) => [probe.name, probe.status]));
    expect(statuses).toMatchObject({
      github_issue_read: 'unavailable',
      kanban_read: 'unavailable',
      provider_status: 'healthy',
      dashboard_health: 'unavailable',
      approval_ledger_parse: 'unavailable',
    });
  });

  it('parses quoted provider commands as argv instead of passing literal quotes', async () => {
    const { runSyntheticAvailabilityProbes } = await loadScript();
    const execFile = vi.fn(async (file: string) => {
      if (file === 'gh') return '[]';
      return 'provider ok';
    });

    await runSyntheticAvailabilityProbes({
      config: {
        repo: 'djm204/frankenbeast',
        providerCommand: 'node -e "process.exit(1)"',
        timeoutMs: 100,
      },
      execFile,
      fetch: vi.fn(async () => ({ ok: true, status: 200 })),
      openSqliteReadOnly: vi.fn(() => ({ prepare: () => ({ get: () => ({ count: 1 }) }), close: vi.fn() })),
      readFile: vi.fn(async () => '{}'),
    });

    expect(execFile).toHaveBeenCalledWith('node', ['-e', 'process.exit(1)'], 100);
  });

  it('emits compact one-line JSON for JSONL-friendly cron logs', () => {
    const result = spawnSync(process.execPath, [SCRIPT, '--json', '--repo', 'djm204/frankenbeast'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        FRANKENBEAST_AVAILABILITY_PROVIDER_COMMAND: 'node --version',
      },
    });

    expect([0, 1]).toContain(result.status);
    const lines = result.stdout.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(() => JSON.parse(lines[0])).not.toThrow();
  });

  it('renders compact text output and documents cron/CI usage', async () => {
    const { formatProbeReportText } = await loadScript();
    const text = formatProbeReportText({
      ok: false,
      probes: [
        { name: 'github_issue_read', status: 'healthy', latencyMs: 12, timeoutMs: 5000, remediationHint: 'Check gh auth.' },
        { name: 'dashboard_health', status: 'unavailable', latencyMs: 40, timeoutMs: 5000, remediationHint: 'Start dashboard.' },
      ],
    });

    expect(text).toContain('Synthetic availability probes: unavailable');
    expect(text).toContain('github_issue_read healthy 12ms');
    expect(text).toContain('dashboard_health unavailable 40ms');

    const doc = readFileSync(DOC, 'utf8');
    expect(doc).toContain('node scripts/synthetic-availability-probes.mjs --json');
    expect(doc).toContain('cron');
    expect(doc).toContain('CI');
    expect(doc).toContain('JSONL');
    expect(doc).toContain('No probe mutates GitHub, Git, memory, or approval state');
  });
});
