import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
  });

  it('prints structured dry-run JSON without mutating input manifests', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dr-'));
    const backupPath = join(dir, 'backup.json');
    const livePath = join(dir, 'live.json');
    const backup = {
      schemaVersion: 1,
      tasks: [{ id: 'task-1', digest: 'old-task' }],
      approvals: [{ id: 'approval-1', state: 'pending' }],
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
      preview: { conflicts: Array<{ area: string; severity: string }> };
    };
    expect(report.command).toBe('dr restore-dry-run');
    expect(report.dryRun).toBe(true);
    expect(report.wouldWrite).toBe(false);
    expect(report.summary.conflictCount).toBe(2);
    expect(report.summary.blockerCount).toBe(2);
    expect(report.preview.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ area: 'tasks', severity: 'blocker' }),
        expect.objectContaining({ area: 'approvals', severity: 'blocker' }),
      ]),
    );
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

  it('fails closed when a manifest has duplicate record IDs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dr-'));
    const backupPath = join(dir, 'backup.json');
    const livePath = join(dir, 'live.json');
    await writeFile(backupPath, JSON.stringify({
      schemaVersion: 1,
      tasks: [{ id: 'task-1', digest: 'old' }, { id: 'task-1', digest: 'new' }],
      approvals: [],
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
      })).rejects.toThrow(/duplicate id 'task-1'/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails closed for unsupported schema versions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dr-'));
    const backupPath = join(dir, 'backup.json');
    const livePath = join(dir, 'live.json');
    await writeFile(backupPath, JSON.stringify({ schemaVersion: 2, tasks: [], approvals: [], memory: [], cron: [] }), 'utf8');
    await writeFile(livePath, JSON.stringify({ schemaVersion: 2, tasks: [], approvals: [], memory: [], cron: [] }), 'utf8');

    try {
      await expect(handleDrCommand({
        action: 'restore-dry-run',
        backupManifestPath: backupPath,
        liveManifestPath: livePath,
        print: () => undefined,
      })).rejects.toThrow(/unsupported schemaVersion 2/);
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
