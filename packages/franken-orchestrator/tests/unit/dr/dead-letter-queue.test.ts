import { mkdtemp, rm } from 'node:fs/promises';
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
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
