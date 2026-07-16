import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

    const diffArgs = parseArgs(['dr', 'snapshot-diff', '/healthy/export', '/incident/export']);
    expect(diffArgs.drAction).toBe('snapshot-diff');
    expect(diffArgs.drBackupManifestPath).toBe('/healthy/export');
    expect(diffArgs.drLiveManifestPath).toBe('/incident/export');
  });

  it('parses encrypted backup, verify, list, restore, and dead-letter commands', () => {
    expect(parseArgs(['dr', 'backup', '/state', '/backup.enc.json', '/key']).drKeyFilePath).toBe('/key');
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

  it('diffs state snapshot directories by subsystem with redacted output', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dr-snapshot-diff-'));
    const beforeDir = join(dir, 'before');
    const afterDir = join(dir, 'after');
    const output: string[] = [];
    const beforePassword = 'before' + 'Secret123';
    const afterPassword = 'after' + 'Secret456';
    const beforeToken = 'ghp_' + 'beforeSecret1234567890';
    const afterToken = 'ghp_' + 'afterSecret1234567890';
    const afterApiKey = 'sk-' + 'afterSecret123456';

    try {
      await mkdir(beforeDir, { recursive: true });
      await mkdir(afterDir, { recursive: true });
      await writeFile(join(beforeDir, 'state.json'), JSON.stringify({
        tasks: [
          { id: 'task-removed', status: 'done', title: 'old task' },
          { id: 'task-changed', status: 'running', workerId: 'worker-old', password: beforePassword },
        ],
        approvals: [{ id: 'approval-changed', state: 'pending', token: beforeToken }],
        memory: [{ id: 'memory-same', digest: 'same' }],
        cron: [{ id: 'cron-removed', status: 'running' }],
      }), 'utf8');
      await writeFile(join(afterDir, 'state.json'), JSON.stringify({
        tasks: [
          { id: 'task-added', status: 'ready', title: 'new task' },
          { id: 'task-changed', status: 'blocked', workerId: 'worker-new', password: afterPassword },
        ],
        approvals: [{ id: 'approval-changed', state: 'used', token: afterToken }],
        memory: [{ id: 'memory-same', digest: 'same' }, { id: 'memory-added', value: { apiKey: afterApiKey } }],
        cron: [{ id: 'cron-added', status: 'paused' }],
      }), 'utf8');

      await handleDrCommand({
        action: 'snapshot-diff',
        backupManifestPath: beforeDir,
        liveManifestPath: afterDir,
        print: (message) => output.push(message),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }

    const rawOutput = output.join('\n');
    const report = JSON.parse(rawOutput) as {
      command: string;
      textSummary: string;
      summary: { added: number; removed: number; changed: number; bySubsystem: Record<string, { added: number; removed: number; changed: number }> };
      diffs: Array<{ subsystem: string; added: Array<{ id: string }>; removed: Array<{ id: string }>; changed: Array<{ id: string; before: unknown; after: unknown; changedFields: string[] }> }>;
    };

    expect(report.command).toBe('dr snapshot-diff');
    expect(report.textSummary).toContain('State snapshot diff: 4 added, 3 removed, 2 changed.');
    expect(report.summary.bySubsystem.tasks).toEqual({ added: 1, removed: 1, changed: 1 });
    expect(report.summary.bySubsystem.approvals).toEqual({ added: 0, removed: 0, changed: 1 });
    expect(report.summary.bySubsystem.workerIds).toEqual({ added: 1, removed: 1, changed: 0 });
    expect(report.summary.bySubsystem.memory).toEqual({ added: 1, removed: 0, changed: 0 });
    expect(report.summary.bySubsystem.cron).toEqual({ added: 1, removed: 1, changed: 0 });
    expect(report.diffs.find((diff) => diff.subsystem === 'tasks')?.changed[0]?.changedFields).toEqual(['password', 'status', 'workerId']);
    expect(rawOutput).not.toContain(beforePassword);
    expect(rawOutput).not.toContain(afterPassword);
    expect(rawOutput).not.toContain(beforeToken);
    expect(rawOutput).not.toContain(afterToken);
    expect(rawOutput).not.toContain(afterApiKey);
    expect(rawOutput).toContain('<redacted>');
  });

  it('extracts object-map snapshots and redacts primitive approval token arrays', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dr-snapshot-map-diff-'));
    const beforeDir = join(dir, 'before');
    const afterDir = join(dir, 'after');
    const output: string[] = [];
    const beforeRefreshToken = 'local' + 'RefreshToken123';
    const afterRefreshToken = 'other' + 'RefreshToken456';

    try {
      await mkdir(beforeDir, { recursive: true });
      await mkdir(afterDir, { recursive: true });
      await writeFile(join(beforeDir, 'state.json'), JSON.stringify({
        tasks: {
          'task-1': { id: 'task-1', status: 'running' },
        },
        approvalTokens: [beforeRefreshToken],
      }), 'utf8');
      await writeFile(join(afterDir, 'state.json'), JSON.stringify({
        tasks: {
          'task-1': { id: 'task-1', status: 'blocked' },
          'task-2': { id: 'task-2', status: 'ready' },
        },
        approvalTokens: [afterRefreshToken],
      }), 'utf8');

      await handleDrCommand({
        action: 'snapshot-diff',
        backupManifestPath: beforeDir,
        liveManifestPath: afterDir,
        print: (message) => output.push(message),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }

    const rawOutput = output.join('\n');
    const report = JSON.parse(rawOutput) as {
      summary: { bySubsystem: Record<string, { added: number; removed: number; changed: number }> };
      diffs: Array<{ subsystem: string; added: Array<{ id: string }>; removed: Array<{ id: string }>; changed: Array<{ id: string }> }>;
    };

    expect(report.summary.bySubsystem.tasks).toEqual({ added: 1, removed: 0, changed: 1 });
    expect(report.summary.bySubsystem.approvals).toEqual({ added: 0, removed: 0, changed: 1 });
    expect(report.diffs.find((diff) => diff.subsystem === 'tasks')?.added[0]?.id).toBe('task-2');
    expect(report.diffs.find((diff) => diff.subsystem === 'tasks')?.changed[0]?.id).toBe('task-1');
    expect(rawOutput).not.toContain(beforeRefreshToken);
    expect(rawOutput).not.toContain(afterRefreshToken);
    expect(rawOutput).toContain('<redacted>');
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
