import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FileApprovalAuditLog,
  commandSha256,
  defaultApprovalAuditLogPath,
} from '../../../src/chat/approval-audit-log.js';

describe('FileApprovalAuditLog', () => {
  it('appends approved, denied, executed, failed, and replayed HITL audit entries with provenance', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-approval-audit-'));
    try {
      const logPath = join(dir, 'approval-audit.jsonl');
      const log = new FileApprovalAuditLog(logPath, {
        workerId: 'worker-123',
        workdir: '/repo/worktree',
        requester: 'operator-ui',
      });

      await log.recordDecision({
        sessionId: 'chat-1',
        projectId: 'proj-1',
        token: 'approval-token-1',
        command: 'git push origin HEAD',
        decision: 'approved',
        decisionSource: 'human',
      });
      await log.recordDecision({
        sessionId: 'chat-1',
        projectId: 'proj-1',
        token: 'approval-token-2',
        command: 'rm -rf /tmp/nope',
        decision: 'denied',
        decisionSource: 'human',
        reason: 'operator rejected destructive cleanup',
      });
      await log.recordExecution({
        sessionId: 'chat-1',
        projectId: 'proj-1',
        token: 'approval-token-1',
        command: 'git push origin HEAD',
        exitCode: 0,
        output: 'pushed abc123',
      });
      await log.recordExecution({
        sessionId: 'chat-1',
        projectId: 'proj-1',
        token: 'approval-token-3',
        command: 'gh pr merge 1',
        exitCode: 1,
        output: 'merge failed because checks are pending',
      });
      await log.recordReplay({
        sessionId: 'chat-1',
        projectId: 'proj-1',
        token: 'approval-token-1',
        command: 'git push origin HEAD',
        reason: 'approval was already consumed',
      });

      const lines = (await readFile(logPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
      expect(lines.map((entry) => entry.decision)).toEqual([
        'approved',
        'denied',
        'executed',
        'failed',
        'replayed',
      ]);
      for (const entry of lines) {
        expect(entry.workerId).toBe('worker-123');
        expect(entry.workdir).toBe('/repo/worktree');
        expect(entry.requester).toBe('operator-ui');
        expect(entry.commandHash).toMatch(/^[a-f0-9]{64}$/);
        expect(entry.commandBody).not.toContain('approval-token');
        expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
      expect(lines[3].exitCode).toBe(1);
      expect(lines[3].outputTail).toBe('merge failed because checks are pending');
      expect(lines[4].reason).toBe('approval was already consumed');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('loads existing audit entries after restart and detects consumed approval replay attempts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-approval-audit-'));
    try {
      const logPath = join(dir, 'approval-audit.jsonl');
      const command = 'git push origin HEAD';
      const first = new FileApprovalAuditLog(logPath);
      await first.recordExecution({
        sessionId: 'chat-1',
        projectId: 'proj-1',
        token: 'approval-token-1',
        command,
        exitCode: 0,
        output: 'ok',
      });

      const restarted = new FileApprovalAuditLog(logPath);
      expect(await restarted.hasConsumedApproval({
        sessionId: 'chat-1',
        projectId: 'proj-1',
        token: 'approval-token-1',
        commandHash: commandSha256(command),
      })).toBe(true);
      expect(await restarted.hasConsumedApproval({
        sessionId: 'chat-1',
        projectId: 'proj-1',
        token: 'approval-token-1',
        commandHash: commandSha256('different command'),
      })).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('separates a corrupt partial tail before appending replay-protecting entries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-approval-audit-'));
    try {
      const logPath = join(dir, 'approval-audit.jsonl');
      await writeFile(logPath, '{"partial":', 'utf8');

      const command = 'git push origin HEAD';
      const log = new FileApprovalAuditLog(logPath);
      await log.recordExecution({
        sessionId: 'chat-1',
        projectId: 'proj-1',
        token: 'approval-token-1',
        command,
        exitCode: 0,
        output: 'ok',
      });

      const raw = await readFile(logPath, 'utf8');
      expect(raw).toContain('{"partial":\n');
      expect(await log.hasConsumedApproval({
        sessionId: 'chat-1',
        projectId: 'proj-1',
        token: 'approval-token-1',
        commandHash: commandSha256(command),
      })).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses to append through an existing audit-log symlink', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-approval-audit-'));
    try {
      const outsidePath = join(dir, 'outside-target.jsonl');
      const logPath = join(dir, 'approval-audit.jsonl');
      await writeFile(outsidePath, 'original\n', 'utf8');
      await symlink(outsidePath, logPath);

      const log = new FileApprovalAuditLog(logPath);
      await expect(log.recordExecution({
        sessionId: 'chat-1',
        projectId: 'proj-1',
        token: 'approval-token-1',
        command: 'git push origin HEAD',
        exitCode: 0,
        output: 'ok',
      })).rejects.toThrow();
      expect(await readFile(outsidePath, 'utf8')).toBe('original\n');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('documents the durable default storage path under .fbeast audit state', () => {
    expect(defaultApprovalAuditLogPath('/repo')).toBe('/repo/.fbeast/audit/hitl-approval-audit.jsonl');
  });
});
