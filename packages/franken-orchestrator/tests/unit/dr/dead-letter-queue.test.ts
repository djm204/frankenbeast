import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  dryRunReplayDeadLetterEntry,
  inspectDeadLetterEntry,
  listDeadLetterEntries,
  recordRetryExhaustionToDeadLetterQueue,
  retireDeadLetterEntry,
} from '../../../src/dr/dead-letter-queue.js';

describe('dead-letter queue for failed automation actions', () => {
  it('records retry exhaustion evidence with replay safety classification', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dlq-'));
    const queuePath = join(dir, 'dead-letter.json');

    try {
      const entry = await recordRetryExhaustionToDeadLetterQueue({
        queuePath,
        actionClass: 'approval-cop-command',
        target: 'pr-2342',
        attempts: 3,
        maxAttempts: 3,
        lastError: 'approval command failed after provider timeout',
        replaySafety: 'side-effect-approval-required',
        firstAttemptedAt: '2026-07-16T08:00:00.000Z',
        exhaustedAt: '2026-07-16T08:05:00.000Z',
        payload: { command: 'gh pr comment 2342 --body @codex review' },
      });

      expect(entry).toMatchObject({
        actionClass: 'approval-cop-command',
        target: 'pr-2342',
        attempts: 3,
        maxAttempts: 3,
        lastError: 'approval command failed after provider timeout',
        replaySafety: 'side-effect-approval-required',
        firstAttemptedAt: '2026-07-16T08:00:00.000Z',
        lastAttemptedAt: '2026-07-16T08:05:00.000Z',
        status: 'open',
      });
      expect(entry.id).toMatch(/^dlq_/);

      const listed = await listDeadLetterEntries(queuePath);
      expect(listed).toHaveLength(1);
      expect(listed[0]).toEqual(entry);
      expect((await stat(queuePath)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not enqueue actions before the bounded retry limit is exhausted', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dlq-'));
    const queuePath = join(dir, 'dead-letter.json');

    try {
      await expect(recordRetryExhaustionToDeadLetterQueue({
        queuePath,
        actionClass: 'approval-cop-command',
        target: 'pr-2342',
        attempts: 2,
        maxAttempts: 3,
        lastError: 'still retryable',
        replaySafety: 'safe',
      })).rejects.toThrow(/retry limit has not been exhausted/);

      expect(await listDeadLetterEntries(queuePath)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects over-limit attempt counts before writing unreadable entries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dlq-'));
    const queuePath = join(dir, 'dead-letter.json');

    try {
      await expect(recordRetryExhaustionToDeadLetterQueue({
        queuePath,
        actionClass: 'approval-cop-command',
        target: 'pr-2342',
        attempts: 4,
        maxAttempts: 3,
        lastError: 'loop incremented past cap',
        replaySafety: 'side-effect-approval-required',
      })).rejects.toThrow(/attempts cannot exceed maxAttempts/);

      expect(await listDeadLetterEntries(queuePath)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects invalid replay safety before writing unreadable entries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dlq-'));
    const queuePath = join(dir, 'dead-letter.json');

    try {
      await expect(recordRetryExhaustionToDeadLetterQueue({
        queuePath,
        actionClass: 'approval-cop-command',
        target: 'pr-2342',
        attempts: 3,
        maxAttempts: 3,
        lastError: 'bad replay safety',
        replaySafety: 'bogus' as 'safe',
      })).rejects.toThrow(/replaySafety/);

      expect(await listDeadLetterEntries(queuePath)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('serializes concurrent dead-letter appends to preserve every exhausted action', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dlq-'));
    const queuePath = join(dir, 'dead-letter.json');

    try {
      const writes = Array.from({ length: 8 }, (_, index) => recordRetryExhaustionToDeadLetterQueue({
        queuePath,
        actionClass: 'codex-review-trigger',
        target: `pr-${index}`,
        attempts: 3,
        maxAttempts: 3,
        lastError: `failure ${index}`,
        replaySafety: 'safe',
        exhaustedAt: `2026-07-16T08:0${index}:00.000Z`,
      }));

      const recorded = await Promise.all(writes);
      const listed = await listDeadLetterEntries(queuePath);
      expect(listed).toHaveLength(recorded.length);
      expect(new Set(listed.map((entry) => entry.target))).toEqual(new Set(recorded.map((entry) => entry.target)));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reaps stale dead-letter lock files before recording exhausted actions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dlq-'));
    const queuePath = join(dir, 'dead-letter.json');
    const lockPath = `${queuePath}.lock`;

    try {
      await writeFile(lockPath, JSON.stringify({ owner: 'stale-test-lock', pid: 999_999, acquiredAt: '2000-01-01T00:00:00.000Z' }), 'utf8');

      const entry = await recordRetryExhaustionToDeadLetterQueue({
        queuePath,
        actionClass: 'codex-review-trigger',
        target: 'pr-2342',
        attempts: 3,
        maxAttempts: 3,
        lastError: 'stale lock should not strand the queue',
        replaySafety: 'safe',
      });

      expect(await listDeadLetterEntries(queuePath)).toEqual([entry]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('normalizes non-JSON payloads so retry evidence is still recorded', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dlq-'));
    const queuePath = join(dir, 'dead-letter.json');
    const payload: { id: bigint; self?: unknown } = { id: 123n };
    payload.self = payload;

    try {
      const entry = await recordRetryExhaustionToDeadLetterQueue({
        queuePath,
        actionClass: 'approval-cop-command',
        target: 'pr-2342',
        attempts: 3,
        maxAttempts: 3,
        lastError: 'payload had rich retry context',
        replaySafety: 'safe',
        payload,
      });

      expect(entry.payload).toEqual({ id: '123', self: '[Circular]' });
      await expect(listDeadLetterEntries(queuePath)).resolves.toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('inspects, retires, and dry-runs replay without executing side effects', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-dlq-'));
    const queuePath = join(dir, 'dead-letter.json');

    try {
      const entry = await recordRetryExhaustionToDeadLetterQueue({
        queuePath,
        actionClass: 'codex-review-trigger',
        target: 'pr-2342',
        attempts: 5,
        maxAttempts: 5,
        lastError: 'connector usage limit',
        replaySafety: 'side-effect-approval-required',
        exhaustedAt: '2026-07-16T08:10:00.000Z',
      });

      await expect(inspectDeadLetterEntry(queuePath, entry.id)).resolves.toEqual(entry);
      await expect(dryRunReplayDeadLetterEntry(queuePath, entry.id, {
        requestedAt: '2026-07-16T08:12:00.000Z',
      })).resolves.toMatchObject({
        entryId: entry.id,
        dryRun: true,
        wouldReplay: false,
        requiresApproval: true,
        approvalRequired: 'side-effect replay requires explicit operator approval before execution',
      });

      const retired = await retireDeadLetterEntry(queuePath, entry.id, {
        reason: 'operator chose to abandon stale retry',
        retiredAt: '2026-07-16T08:20:00.000Z',
      });
      expect(retired).toMatchObject({
        id: entry.id,
        status: 'retired',
        retiredReason: 'operator chose to abandon stale retry',
        retiredAt: '2026-07-16T08:20:00.000Z',
      });

      await expect(dryRunReplayDeadLetterEntry(queuePath, entry.id, {
        requestedAt: '2026-07-16T08:25:00.000Z',
      })).resolves.toMatchObject({
        entryId: entry.id,
        dryRun: true,
        wouldReplay: false,
        retired: true,
      });

      const stillRetired = await retireDeadLetterEntry(queuePath, entry.id, {
        reason: 'second retry should not overwrite audit evidence',
        retiredAt: '2026-07-16T08:30:00.000Z',
      });
      expect(stillRetired).toMatchObject({
        id: entry.id,
        status: 'retired',
        retiredReason: 'operator chose to abandon stale retry',
        retiredAt: '2026-07-16T08:20:00.000Z',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
