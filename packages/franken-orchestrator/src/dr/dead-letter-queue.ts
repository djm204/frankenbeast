import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export type DeadLetterReplaySafety = 'safe' | 'side-effect-approval-required' | 'unsafe';
export type DeadLetterEntryStatus = 'open' | 'retired';

export interface DeadLetterEntry {
  readonly id: string;
  readonly actionClass: string;
  readonly target: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lastError: string;
  readonly firstAttemptedAt: string;
  readonly lastAttemptedAt: string;
  readonly createdAt: string;
  readonly replaySafety: DeadLetterReplaySafety;
  readonly status: DeadLetterEntryStatus;
  readonly payload?: unknown;
  readonly retiredAt?: string;
  readonly retiredReason?: string;
}

interface DeadLetterQueueFile {
  readonly schemaVersion: 1;
  readonly entries: readonly DeadLetterEntry[];
}

const appendLocks = new Map<string, Promise<void>>();

export interface RecordRetryExhaustionOptions {
  readonly queuePath: string;
  readonly actionClass: string;
  readonly target: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lastError: string;
  readonly replaySafety: DeadLetterReplaySafety;
  readonly firstAttemptedAt?: string;
  readonly exhaustedAt?: string;
  readonly payload?: unknown;
}

export interface RetireDeadLetterEntryOptions {
  readonly retiredAt?: string;
  readonly reason: string;
}

export interface DryRunReplayOptions {
  readonly requestedAt?: string;
}

export interface DeadLetterReplayDryRunReport {
  readonly entryId: string;
  readonly dryRun: true;
  readonly requestedAt: string;
  readonly wouldReplay: boolean;
  readonly requiresApproval: boolean;
  readonly replaySafety: DeadLetterReplaySafety;
  readonly actionClass: string;
  readonly target: string;
  readonly attempts: number;
  readonly lastError: string;
  readonly approvalRequired?: string;
  readonly retired?: boolean;
  readonly retiredReason?: string;
  readonly blockedReason?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid dead-letter queue entry: ${field} must be a non-empty string`);
  }
  return value;
}

function requireSafeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`Invalid dead-letter queue entry: ${field} must be a non-negative safe integer`);
  }
  return value as number;
}

function parseReplaySafety(value: unknown): DeadLetterReplaySafety {
  if (value === 'safe' || value === 'side-effect-approval-required' || value === 'unsafe') return value;
  throw new Error('Invalid dead-letter queue entry: replaySafety must be safe, side-effect-approval-required, or unsafe');
}

function parseStatus(value: unknown): DeadLetterEntryStatus {
  if (value === 'open' || value === 'retired') return value;
  throw new Error('Invalid dead-letter queue entry: status must be open or retired');
}

function parseEntry(value: unknown): DeadLetterEntry {
  if (!isRecord(value)) {
    throw new Error('Invalid dead-letter queue entry: expected object');
  }
  const entry: DeadLetterEntry = {
    id: requireString(value.id, 'id'),
    actionClass: requireString(value.actionClass, 'actionClass'),
    target: requireString(value.target, 'target'),
    attempts: requireSafeInteger(value.attempts, 'attempts'),
    maxAttempts: requireSafeInteger(value.maxAttempts, 'maxAttempts'),
    lastError: requireString(value.lastError, 'lastError'),
    firstAttemptedAt: requireString(value.firstAttemptedAt, 'firstAttemptedAt'),
    lastAttemptedAt: requireString(value.lastAttemptedAt, 'lastAttemptedAt'),
    createdAt: requireString(value.createdAt, 'createdAt'),
    replaySafety: parseReplaySafety(value.replaySafety),
    status: parseStatus(value.status),
    ...(value.payload === undefined ? {} : { payload: value.payload }),
    ...(value.retiredAt === undefined ? {} : { retiredAt: requireString(value.retiredAt, 'retiredAt') }),
    ...(value.retiredReason === undefined ? {} : { retiredReason: requireString(value.retiredReason, 'retiredReason') }),
  };
  if (entry.attempts > entry.maxAttempts) {
    throw new Error('Invalid dead-letter queue entry: attempts cannot exceed maxAttempts');
  }
  return entry;
}

function emptyQueue(): DeadLetterQueueFile {
  return { schemaVersion: 1, entries: [] };
}

async function readQueue(queuePath: string): Promise<DeadLetterQueueFile> {
  let raw: string;
  try {
    raw = await readFile(queuePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return emptyQueue();
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read dead-letter queue ${queuePath}: ${message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to parse dead-letter queue ${queuePath}: ${message}`);
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.entries)) {
    throw new Error(`Invalid dead-letter queue ${queuePath}: expected schemaVersion 1 with entries array`);
  }
  const ids = new Set<string>();
  const entries = parsed.entries.map((entry) => {
    const normalized = parseEntry(entry);
    if (ids.has(normalized.id)) {
      throw new Error(`Invalid dead-letter queue ${queuePath}: duplicate entry id ${normalized.id}`);
    }
    ids.add(normalized.id);
    return normalized;
  });
  return { schemaVersion: 1, entries };
}

async function writeQueue(queuePath: string, queue: DeadLetterQueueFile): Promise<void> {
  await mkdir(dirname(queuePath), { recursive: true });
  const tempPath = `${queuePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(queue, null, 2)}\n`, 'utf8');
  await rename(tempPath, queuePath);
}

async function appendQueueEntry(queuePath: string, entry: DeadLetterEntry): Promise<void> {
  const previous = appendLocks.get(queuePath) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => current, () => current);
  appendLocks.set(queuePath, chained);
  await previous.catch(() => undefined);
  try {
    const queue = await readQueue(queuePath);
    await writeQueue(queuePath, { schemaVersion: 1, entries: [...queue.entries, entry] });
  } finally {
    release();
    if (appendLocks.get(queuePath) === chained) {
      appendLocks.delete(queuePath);
    }
  }
}

function entryIdFor(options: RecordRetryExhaustionOptions, createdAt: string): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({
      actionClass: options.actionClass,
      target: options.target,
      attempts: options.attempts,
      maxAttempts: options.maxAttempts,
      lastError: options.lastError,
      createdAt,
      nonce: randomUUID(),
    }))
    .digest('hex')
    .slice(0, 20);
  return `dlq_${digest}`;
}

export async function listDeadLetterEntries(queuePath: string): Promise<DeadLetterEntry[]> {
  return [...(await readQueue(queuePath)).entries];
}

export async function inspectDeadLetterEntry(queuePath: string, entryId: string): Promise<DeadLetterEntry> {
  const entry = (await readQueue(queuePath)).entries.find((candidate) => candidate.id === entryId);
  if (!entry) {
    throw new Error(`Dead-letter entry not found: ${entryId}`);
  }
  return entry;
}

export async function recordRetryExhaustionToDeadLetterQueue(
  options: RecordRetryExhaustionOptions,
): Promise<DeadLetterEntry> {
  if (!Number.isSafeInteger(options.maxAttempts) || options.maxAttempts < 1) {
    throw new Error('Cannot dead-letter automation action: maxAttempts must be at least 1');
  }
  if (!Number.isSafeInteger(options.attempts) || options.attempts < 0) {
    throw new Error('Cannot dead-letter automation action: attempts must be a non-negative safe integer');
  }
  if (options.attempts > options.maxAttempts) {
    throw new Error('Cannot dead-letter automation action: attempts cannot exceed maxAttempts');
  }
  if (options.attempts < options.maxAttempts) {
    throw new Error('Cannot dead-letter automation action: retry limit has not been exhausted');
  }
  if (!options.actionClass.trim()) throw new Error('Cannot dead-letter automation action: actionClass is required');
  if (!options.target.trim()) throw new Error('Cannot dead-letter automation action: target is required');
  if (!options.lastError.trim()) throw new Error('Cannot dead-letter automation action: lastError is required');

  const exhaustedAt = options.exhaustedAt ?? new Date().toISOString();
  const entry: DeadLetterEntry = {
    id: entryIdFor(options, exhaustedAt),
    actionClass: options.actionClass,
    target: options.target,
    attempts: options.attempts,
    maxAttempts: options.maxAttempts,
    lastError: options.lastError,
    firstAttemptedAt: options.firstAttemptedAt ?? exhaustedAt,
    lastAttemptedAt: exhaustedAt,
    createdAt: exhaustedAt,
    replaySafety: options.replaySafety,
    status: 'open',
    ...(options.payload === undefined ? {} : { payload: options.payload }),
  };

  await appendQueueEntry(options.queuePath, entry);
  return entry;
}

export async function retireDeadLetterEntry(
  queuePath: string,
  entryId: string,
  options: RetireDeadLetterEntryOptions,
): Promise<DeadLetterEntry> {
  if (!options.reason.trim()) throw new Error('Retiring a dead-letter entry requires a reason');
  const queue = await readQueue(queuePath);
  let updated: DeadLetterEntry | undefined;
  const entries = queue.entries.map((entry) => {
    if (entry.id !== entryId) return entry;
    if (entry.status === 'retired') {
      updated = entry;
      return entry;
    }
    updated = {
      ...entry,
      status: 'retired',
      retiredAt: options.retiredAt ?? new Date().toISOString(),
      retiredReason: options.reason,
    };
    return updated;
  });
  if (!updated) throw new Error(`Dead-letter entry not found: ${entryId}`);
  await writeQueue(queuePath, { schemaVersion: 1, entries });
  return updated;
}

export async function dryRunReplayDeadLetterEntry(
  queuePath: string,
  entryId: string,
  options: DryRunReplayOptions = {},
): Promise<DeadLetterReplayDryRunReport> {
  const entry = await inspectDeadLetterEntry(queuePath, entryId);
  const base = {
    entryId: entry.id,
    dryRun: true as const,
    requestedAt: options.requestedAt ?? new Date().toISOString(),
    replaySafety: entry.replaySafety,
    actionClass: entry.actionClass,
    target: entry.target,
    attempts: entry.attempts,
    lastError: entry.lastError,
  };
  if (entry.status === 'retired') {
    return {
      ...base,
      wouldReplay: false,
      requiresApproval: false,
      retired: true,
      ...(entry.retiredReason === undefined ? {} : { retiredReason: entry.retiredReason }),
    };
  }
  if (entry.replaySafety === 'side-effect-approval-required') {
    return {
      ...base,
      wouldReplay: false,
      requiresApproval: true,
      approvalRequired: 'side-effect replay requires explicit operator approval before execution',
    };
  }
  if (entry.replaySafety === 'unsafe') {
    return {
      ...base,
      wouldReplay: false,
      requiresApproval: true,
      blockedReason: 'entry is classified unsafe for automated replay',
    };
  }
  return {
    ...base,
    wouldReplay: true,
    requiresApproval: false,
  };
}
