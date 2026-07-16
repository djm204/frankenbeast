import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { parseArgs } from '../../../src/cli/args.js';
import { handleDrCommand } from '../../../src/cli/dr-restore.js';

describe('dr restore-dry-run CLI', () => {
  it('parses restore-dry-run manifest paths', () => {
    const args = parseArgs(['dr', 'restore-dry-run', '/backup/manifest.json', '/live/manifest.json']);

    expect(args.subcommand).toBe('dr');
    expect(args.drAction).toBe('restore-dry-run');
    expect(args.drBackupManifestPath).toBe('/backup/manifest.json');
    expect(args.drLiveManifestPath).toBe('/live/manifest.json');
  });

  it('parses encrypted backup, verify, list, restore, export, and dead-letter commands', () => {
    expect(parseArgs(['dr', 'backup', '/state', '/backup.enc.json', '/key']).drKeyFilePath).toBe('/key');
    const pointInTimeExport = parseArgs(['--dry-run', 'dr', 'export', '/state', '/incident-export.json']);
    expect(pointInTimeExport.drAction).toBe('export');
    expect(pointInTimeExport.drBackupManifestPath).toBe('/state');
    expect(pointInTimeExport.drLiveManifestPath).toBe('/incident-export.json');
    expect(pointInTimeExport.dryRun).toBe(true);
    expect(parseArgs(['dr', 'list', '/backup.enc.json']).drAction).toBe('list');
    expect(parseArgs(['dr', 'verify', '/backup.enc.json', '/key']).drLiveManifestPath).toBe('/key');
    const restore = parseArgs(['--dry-run', 'dr', 'restore', '/backup.enc.json', '/restore', '/key']);
    expect(restore.drAction).toBe('restore');
    expect(restore.drBackupManifestPath).toBe('/backup.enc.json');
    expect(restore.drLiveManifestPath).toBe('/restore');
    expect(restore.drKeyFilePath).toBe('/key');
    expect(restore.dryRun).toBe(true);

    const inspect = parseArgs(['dr', 'dead-letter-inspect', '/queue.json', 'dlq_123']);
    expect(inspect.drAction).toBe('dead-letter-inspect');
    expect(inspect.drBackupManifestPath).toBe('/queue.json');
    expect(inspect.drLiveManifestPath).toBe('dlq_123');
    const retire = parseArgs(['dr', 'dead-letter-retire', '/queue.json', 'dlq_123', 'operator resolved manually']);
    expect(retire.drAction).toBe('dead-letter-retire');
    expect(retire.drKeyFilePath).toBe('operator resolved manually');
  });

  it('prints a small backup summary and marks list output unverified', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dr-'));
    const stateDir = join(dir, 'state');
    const backupPath = join(dir, 'backup.enc.json');
    const keyPath = join(dir, 'key');
    const output: string[] = [];

    try {
      await mkdir(stateDir, { recursive: true });
      await writeFile(join(stateDir, 'kanban.db'), 'secret kanban bytes', 'utf8');
      await writeFile(keyPath, 'key material', 'utf8');
      await handleDrCommand({
        action: 'backup',
        backupManifestPath: stateDir,
        liveManifestPath: backupPath,
        keyFilePath: keyPath,
        print: (message) => output.push(message),
      });

      const backupReport = JSON.parse(output.pop() ?? '') as { command: string; ciphertext?: string; manifest: { categories: { kanban: number } } };
      expect(backupReport.command).toBe('dr backup');
      expect(backupReport.ciphertext).toBeUndefined();
      expect(backupReport.manifest.categories.kanban).toBe(1);
      expect(await readFile(backupPath, 'utf8')).not.toContain('secret kanban bytes');

      await handleDrCommand({ action: 'list', backupManifestPath: backupPath, print: (message) => output.push(message) });
      const listReport = JSON.parse(output.pop() ?? '') as { command: string; verified: boolean; verificationRequired: string };
      expect(listReport.command).toBe('dr list');
      expect(listReport.verified).toBe(false);
      expect(listReport.verificationRequired).toContain('dr verify');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('creates a redacted point-in-time export with manifest, config checksums, summaries, and log tails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dr-export-'));
    const stateDir = join(dir, 'state');
    const exportPath = join(dir, 'incident-export.json');
    const output: string[] = [];

    try {
      await mkdir(join(stateDir, 'approvals'), { recursive: true });
      await mkdir(join(stateDir, 'memory'), { recursive: true });
      await mkdir(join(stateDir, 'runs', 'run-1'), { recursive: true });
      await mkdir(join(stateDir, 'logs'), { recursive: true });
      await mkdir(join(stateDir, 'chat'), { recursive: true });
      await writeFile(join(stateDir, 'config.json'), JSON.stringify({ provider: 'openai', apiToken: 'secret-config-token' }), 'utf8');
      await writeFile(join(stateDir, 'approvals', 'ledger.json'), JSON.stringify({ approvals: [{ id: 'approval-1', token: 'secret-approval-token', state: 'pending' }] }), 'utf8');
      await writeFile(join(stateDir, 'memory', 'store.json'), JSON.stringify({ memories: [{ key: 'user.pref', value: 'private memory body', metadata: { source: 'chat' } }] }), 'utf8');
      await writeFile(join(stateDir, 'kanban-tasks.json'), JSON.stringify({ tasks: [{ id: 'task-1', title: 'secret task title', status: 'running' }] }), 'utf8');
      await writeFile(join(stateDir, 'runs', 'run-1', 'metadata.json'), JSON.stringify({ id: 'run-1', taskId: 'task-1', status: 'running' }), 'utf8');
      await writeFile(join(stateDir, 'chat', 'session-1.json'), JSON.stringify({
        id: 'session-1',
        pendingApproval: { id: 'approval-chat-1', description: 'deploy pending', target: 'https://operator:chatTargetSecret@example.com' },
      }), 'utf8');
      await writeFile(join(stateDir, 'logs', 'run-1.log'), [
        'starting run',
        'OPENAI_API_KEY=test-key-needs-redaction',
        'Authorization: Bearer bearerCredentialForReview123',
        'finished run',
      ].join('\n'), 'utf8');
      const beastDb = new Database(join(stateDir, 'beast.db'));
      const kanbanDb = new Database(join(stateDir, 'kanban.db'));
      try {
        beastDb.exec(`CREATE TABLE beast_runs (id TEXT PRIMARY KEY, status TEXT, definition_id TEXT, created_at TEXT);`);
        beastDb.prepare('INSERT INTO beast_runs (id, status, definition_id, created_at) VALUES (?, ?, ?, ?)')
          .run('run-db-1', 'running', 'nightly', '2026-07-16T08:00:00.000Z');
        kanbanDb.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, status TEXT, created_at TEXT);`);
        kanbanDb.prepare('INSERT INTO tasks (id, status, created_at) VALUES (?, ?, ?)')
          .run('task-db-1', 'ready', '2026-07-16T08:00:00.000Z');
      } finally {
        beastDb.close();
        kanbanDb.close();
      }

      await handleDrCommand({
        action: 'export',
        backupManifestPath: stateDir,
        liveManifestPath: exportPath,
        dryRun: true,
        generatedAt: '2026-07-16T09:00:00.000Z',
        print: (message) => output.push(message),
      });
      const preview = JSON.parse(output.pop() ?? '') as { command: string; dryRun: boolean; wouldWrite: boolean };
      expect(preview.command).toBe('dr export');
      expect(preview.dryRun).toBe(true);
      expect(preview.wouldWrite).toBe(false);
      await expect(readFile(exportPath, 'utf8')).rejects.toThrow();

      await handleDrCommand({
        action: 'export',
        backupManifestPath: stateDir,
        liveManifestPath: exportPath,
        generatedAt: '2026-07-16T09:00:00.000Z',
        print: (message) => output.push(message),
      });
      const reportText = await readFile(exportPath, 'utf8');
      const report = JSON.parse(reportText) as {
        command: string;
        manifest: { generatedAt: string; configChecksums: Array<{ path: string; sha256: string }>; sections: Record<string, number> };
        evidence: { approvals: unknown[]; memory: unknown[]; tasks: unknown[]; runs: unknown[]; logs: Array<{ tail: string[] }> };
      };

      expect(report.command).toBe('dr export');
      expect(report.manifest.generatedAt).toBe('2026-07-16T09:00:00.000Z');
      expect(report.manifest.configChecksums).toEqual([expect.objectContaining({ path: 'config.json', sha256: expect.stringMatching(/^sha256:/u) })]);
      expect(report.manifest.sections).toEqual(expect.objectContaining({ approvals: 2, memory: 1, tasks: 2, runs: 2, logs: 1 }));
      expect(report.evidence.approvals).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'approvals/ledger.json' }),
        expect.objectContaining({ path: 'chat/session-1.json', records: [expect.objectContaining({ id: 'approval-chat-1' })] }),
      ]));
      expect(report.evidence.memory).toEqual([expect.objectContaining({ path: 'memory/store.json', recordCount: 1 })]);
      expect(report.evidence.tasks).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'kanban-tasks.json', records: [expect.objectContaining({ id: 'task-1', status: 'running' })] })]));
      expect(report.evidence.runs).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'runs/run-1/metadata.json', records: [expect.objectContaining({ id: 'run-1', status: 'running' })] })]));
      expect(report.evidence.tasks).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'kanban.db', table: 'tasks', rowCount: 1 })]));
      expect(report.evidence.runs).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'beast.db', table: 'beast_runs', rowCount: 1 })]));
      expect(report.evidence.logs[0]?.tail.join('\n')).toContain('<redacted>');
      expect(reportText).not.toContain('secret-config-token');
      expect(reportText).not.toContain('secret-approval-token');
      expect(reportText).not.toContain('private memory body');
      expect(reportText).not.toContain('secret task title');
      expect(reportText).not.toContain('test-key-needs-redaction');
      expect(reportText).not.toContain('bearerCredentialForReview123');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('prints dead-letter list, inspect, dry-run replay, and retire JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dr-'));
    const queuePath = join(dir, 'dead-letter.json');
    const output: string[] = [];

    try {
      await writeFile(queuePath, JSON.stringify({
        schemaVersion: 1,
        entries: [{
          id: 'dlq_test',
          actionClass: 'codex-review-trigger',
          target: 'https://operator:targetSecret123@example.com/franken',
          attempts: 5,
          maxAttempts: 5,
          lastError: 'provider failures: «redacted:sk-…» and «redacted:xox…»',
          firstAttemptedAt: '2026-07-16T08:00:00.000Z',
          lastAttemptedAt: '2026-07-16T08:05:00.000Z',
          createdAt: '2026-07-16T08:05:00.000Z',
          replaySafety: 'side-effect-approval-required',
          status: 'open',
          payload: {
            command: 'curl --password notasecret -H "Authorization: Bearer ***" https://api.github.com/repos/djm204/frankenbeast',
            argv: ['gh', 'api', '--token', 'abcdefghijklmnopqrstuvwxyz123456', '--password=abcd1234secret5678'],
            databaseUrl: 'postgres://beast:anotherSecret456@db.example/franken',
          },
        }],
      }), 'utf8');

      await handleDrCommand({ action: 'dead-letter-list', backupManifestPath: queuePath, print: (message) => output.push(message) });
      const listOutput = output.pop() ?? '';
      expect(JSON.parse(listOutput)).toMatchObject({
        command: 'dr dead-letter-list',
        summary: { open: 1 },
        entries: [{ id: 'dlq_test', actionClass: 'codex-review-trigger', target: 'https://operator:<redacted>@example.com/franken' }],
      });
      expect(listOutput).not.toContain('targetSecret123');
      expect(listOutput).not.toContain('databaseSecret123');
      expect(listOutput).not.toContain('abcd1234secret5678');
      expect(listOutput).not.toContain('GH_TOKEN');
      expect(listOutput).not.toContain('lastError');
      expect(listOutput).not.toContain('payload');

      await handleDrCommand({ action: 'dead-letter-inspect', backupManifestPath: queuePath, liveManifestPath: 'dlq_test', print: (message) => output.push(message) });
      const inspectOutput = output.pop() ?? '';
      expect(JSON.parse(inspectOutput)).toMatchObject({ command: 'dr dead-letter-inspect', entry: { id: 'dlq_test' } });
      expect(inspectOutput).not.toContain('databaseSecret123');
      expect(inspectOutput).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
      expect(inspectOutput).not.toContain('notasecret');
      expect(inspectOutput).not.toContain('xoxb-123456789012-abcdefabcdef');
      expect(inspectOutput).not.toContain('anotherSecret456');
      expect(inspectOutput).toContain('<redacted>');

      await handleDrCommand({ action: 'dead-letter-replay-dry-run', backupManifestPath: queuePath, liveManifestPath: 'dlq_test', generatedAt: '2026-07-16T08:06:00.000Z', print: (message) => output.push(message) });
      const replayOutput = output.pop() ?? '';
      expect(JSON.parse(replayOutput)).toMatchObject({ command: 'dr dead-letter-replay-dry-run', replay: { dryRun: true, wouldReplay: false, requiresApproval: true } });
      expect(replayOutput).not.toContain('ghp_testtoken1234567890');

      await handleDrCommand({ action: 'dead-letter-retire', backupManifestPath: queuePath, liveManifestPath: 'dlq_test', keyFilePath: 'handled manually', generatedAt: '2026-07-16T08:07:00.000Z', print: (message) => output.push(message) });
      expect(JSON.parse(output.pop() ?? '')).toMatchObject({ command: 'dr dead-letter-retire', entry: { id: 'dlq_test', status: 'retired', retiredReason: 'handled manually' } });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('prints structured dry-run JSON without mutating input manifests', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dr-'));
    const backupPath = join(dir, 'backup.json');
    const livePath = join(dir, 'live.json');
    const backup = {
      schemaVersion: 1,
      tasks: [{ id: 'task-1', digest: 'old-task', value: { title: 'secret task title' } }],
      approvals: [{ id: 'approval-1', state: 'pending', value: 'secret approval token' }],
      memory: [],
      cron: [],
    };
    const live = { schemaVersion: 1, tasks: [], approvals: [], memory: [], cron: [] };
    await writeFile(backupPath, JSON.stringify(backup), 'utf8');
    await writeFile(livePath, JSON.stringify(live), 'utf8');
    const output: string[] = [];

    try {
      await handleDrCommand({
        action: 'restore-dry-run',
        backupManifestPath: backupPath,
        liveManifestPath: livePath,
        generatedAt: '2026-07-14T12:30:00.000Z',
        print: (message) => output.push(message),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }

    const report = JSON.parse(output.join('\n')) as {
      command: string;
      dryRun: boolean;
      wouldWrite: boolean;
      summary: { blockerCount: number; conflictCount: number };
      preview: { conflicts: Array<{ area: string; severity: string; backup?: { valuePresent?: boolean } }> };
    };
    expect(report.command).toBe('dr restore-dry-run');
    expect(report.dryRun).toBe(true);
    expect(report.wouldWrite).toBe(false);
    expect(report.summary.conflictCount).toBe(2);
    expect(report.summary.blockerCount).toBe(2);
    expect(report.preview.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ area: 'tasks', severity: 'blocker', backup: expect.objectContaining({ valuePresent: true }) }),
        expect.objectContaining({ area: 'approvals', severity: 'blocker', backup: expect.objectContaining({ valuePresent: true }) }),
      ]),
    );
    expect(output.join('\n')).not.toContain('secret task title');
    expect(output.join('\n')).not.toContain('secret approval token');
  });

  it('fails closed with an actionable message when a manifest is malformed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dr-'));
    const backupPath = join(dir, 'backup.json');
    const livePath = join(dir, 'live.json');
    await writeFile(backupPath, '{not-json', 'utf8');
    await writeFile(livePath, JSON.stringify({ schemaVersion: 1, tasks: [], approvals: [], memory: [], cron: [] }), 'utf8');

    try {
      await expect(handleDrCommand({
        action: 'restore-dry-run',
        backupManifestPath: backupPath,
        liveManifestPath: livePath,
        print: () => undefined,
      })).rejects.toThrow(/Unable to read restore manifest/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('routes duplicate and malformed record IDs into structured consistency JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dr-'));
    const backupPath = join(dir, 'backup.json');
    const livePath = join(dir, 'live.json');
    await writeFile(backupPath, JSON.stringify({
      schemaVersion: 1,
      tasks: [{ id: 'task-1', digest: 'old' }, { id: 'task-1', digest: 'new' }, { id: { leaked: 'object' } }],
      approvals: [],
      memory: [],
      cron: [],
    }), 'utf8');
    await writeFile(livePath, JSON.stringify({ schemaVersion: 1, tasks: [], approvals: [], memory: [], cron: [] }), 'utf8');
    const output: string[] = [];

    try {
      await handleDrCommand({
        action: 'restore-dry-run',
        backupManifestPath: backupPath,
        liveManifestPath: livePath,
        print: (message) => output.push(message),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }

    const report = JSON.parse(output.join('\n')) as {
      summary: { safeToRestore: boolean; consistencyBlockerCount: number };
      consistency: { backup: { findings: Array<{ code: string; id: string; jsonPath: string }> } };
    };
    expect(report.summary.safeToRestore).toBe(false);
    expect(report.summary.consistencyBlockerCount).toBeGreaterThanOrEqual(2);
    expect(report.consistency.backup.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate-record-id-within-area', id: 'task-1' }),
        expect.objectContaining({ code: 'malformed-record-id', id: '<missing>', jsonPath: '$.tasks[2].id' }),
      ]),
    );
    expect(output.join('\n')).not.toContain('leaked');
  });

  it('routes unsupported schema versions into structured consistency JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dr-'));
    const backupPath = join(dir, 'backup.json');
    const livePath = join(dir, 'live.json');
    await writeFile(backupPath, JSON.stringify({ schemaVersion: 2, tasks: [], approvals: [], memory: [], cron: [] }), 'utf8');
    await writeFile(livePath, JSON.stringify({ schemaVersion: 2, tasks: [], approvals: [], memory: [], cron: [] }), 'utf8');
    const output: string[] = [];

    try {
      await handleDrCommand({
        action: 'restore-dry-run',
        backupManifestPath: backupPath,
        liveManifestPath: livePath,
        print: (message) => output.push(message),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }

    const report = JSON.parse(output.join('\n')) as {
      summary: { safeToRestore: boolean; consistencyBlockerCount: number };
      consistency: { backup: { findings: Array<{ code: string; jsonPath: string }> } };
    };
    expect(report.summary.safeToRestore).toBe(false);
    expect(report.summary.consistencyBlockerCount).toBe(2);
    expect(report.consistency.backup.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unsupported-schema-version', jsonPath: '$.schemaVersion' }),
      ]),
    );
  });

  it('fails closed for unsupported record fields and malformed summary fields', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dr-'));
    const backupPath = join(dir, 'backup.json');
    const livePath = join(dir, 'live.json');
    await writeFile(backupPath, JSON.stringify({
      schemaVersion: 1,
      tasks: [{ id: 'task-1', title: 'unsupported direct field' }],
      approvals: [{ id: 'approval-1', state: { token: 'secret' } }],
      memory: [],
      cron: [],
    }), 'utf8');
    await writeFile(livePath, JSON.stringify({ schemaVersion: 1, tasks: [], approvals: [], memory: [], cron: [] }), 'utf8');

    try {
      await expect(handleDrCommand({
        action: 'restore-dry-run',
        backupManifestPath: backupPath,
        liveManifestPath: livePath,
        print: () => undefined,
      })).rejects.toThrow(/unsupported field 'title'/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects identical backup and live manifest paths', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dr-'));
    const manifestPath = join(dir, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify({ schemaVersion: 1, tasks: [], approvals: [], memory: [], cron: [] }), 'utf8');

    try {
      await expect(handleDrCommand({
        action: 'restore-dry-run',
        backupManifestPath: manifestPath,
        liveManifestPath: manifestPath,
        print: () => undefined,
      })).rejects.toThrow(/requires distinct backup and live manifest files/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
