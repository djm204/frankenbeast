import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';

import { redactLogData } from '../logging/redaction.js';

export type StateSnapshotDiffSubsystem = 'tasks' | 'approvals' | 'workerIds' | 'memory' | 'cron';
export type StateSnapshotDiffChangeType = 'added' | 'removed' | 'changed';

export interface StateSnapshotDiffRecord {
  readonly id: string;
  readonly value: unknown;
  readonly compareValue: unknown;
  readonly source: string;
}

export interface StateSnapshotRecordChange {
  readonly type: StateSnapshotDiffChangeType;
  readonly id: string;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly changedFields?: readonly string[];
  readonly beforeSource?: string;
  readonly afterSource?: string;
}

export interface StateSnapshotSubsystemDiff {
  readonly subsystem: StateSnapshotDiffSubsystem;
  readonly added: readonly StateSnapshotRecordChange[];
  readonly removed: readonly StateSnapshotRecordChange[];
  readonly changed: readonly StateSnapshotRecordChange[];
}

export interface StateSnapshotDiffSummary {
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
  readonly bySubsystem: Readonly<Record<StateSnapshotDiffSubsystem, {
    readonly added: number;
    readonly removed: number;
    readonly changed: number;
  }>>;
}

export interface StateSnapshotDirectoryDiffReport {
  readonly command: 'dr snapshot-diff';
  readonly beforePath: string;
  readonly afterPath: string;
  readonly summary: StateSnapshotDiffSummary;
  readonly textSummary: string;
  readonly diffs: readonly StateSnapshotSubsystemDiff[];
}

type MutableSubsystemRecords = Record<StateSnapshotDiffSubsystem, Map<string, StateSnapshotDiffRecord>>;

const SUBSYSTEMS: readonly StateSnapshotDiffSubsystem[] = ['tasks', 'approvals', 'workerIds', 'memory', 'cron'];
const MAX_JSON_FILE_BYTES = 4 * 1024 * 1024;
const MAX_DIRECTORY_FILES = 1_000;

function emptyRecords(): MutableSubsystemRecords {
  return {
    tasks: new Map(),
    approvals: new Map(),
    workerIds: new Map(),
    memory: new Map(),
    cron: new Map(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function redactForOutput(value: unknown): unknown {
  const redacted = redactLogData(value);
  return JSON.parse(maskOpaqueSecretLiterals(JSON.stringify(redacted))) as unknown;
}

function normalizeSnapshotSourcePath(source: string): string {
  return source.replaceAll(sep, '/').replaceAll('\\', '/');
}

export function maskOpaqueSecretLiterals(text: string): string {
  return text
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/gu, '<redacted>')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{12,}\b/gu, '<redacted>')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/gu, '<redacted>')
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gu, '<redacted>')
    .replace(/\b([A-Za-z][A-Za-z0-9+.-]*:\/\/[^:\s"'/@]+):[^@\s"']+@/gu, '$1:<redacted>@')
    .replace(/\b((?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^:\s"']+):[^@\s"']+@/giu, '$1:<redacted>@')
    .replace(/\b(?:Bearer|Basic|Bot)\s+[A-Za-z0-9._~+/=-]{8,}\b/giu, (match) => `${match.split(/\s+/u)[0]} <redacted>`)
    .replace(/((?:^|[\s"'])--(?:api-?key|auth|authorization|bearer|password|secret|token)\s+)[^\s"']+/giu, '$1<redacted>')
    .replace(/((?:^|[\s"'])--(?:api-?key|auth|authorization|bearer|password|secret|token)=)[^\s"']+/giu, '$1<redacted>')
    .replace(/("--(?:api-?key|auth|authorization|bearer|password|secret|token)"\s*,\s*")[^"]+/giu, '$1<redacted>');
}

function shortDigest(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, 16);
}

function safeApprovalId(value: unknown): string {
  return `approval:${shortDigest(value)}`;
}

function recordId(
  record: unknown,
  fallback: string,
  subsystem?: StateSnapshotDiffSubsystem,
  options: { readonly preferFallbackOverMutableDisplayName?: boolean } = {},
): string {
  if (subsystem === 'approvals' && !isRecord(record)) return safeApprovalId(record);
  if (subsystem === 'workerIds' && (typeof record === 'string' || typeof record === 'number')) return String(record);
  if (!isRecord(record)) return fallback;
  const idKeys = subsystem === 'approvals'
    ? ['id', 'tokenId', 'token_id', 'approvalId', 'approval_id', 'token', 'value']
    : options.preferFallbackOverMutableDisplayName
      ? ['id', 'taskId', 'task_id', 'jobId', 'job_id', 'workerId', 'worker_id', 'currentWorkerId', 'current_worker_id', 'cardId', 'card_id', 'memoryKey', 'memory_key', 'key']
      : ['id', 'taskId', 'task_id', 'jobId', 'job_id', 'workerId', 'worker_id', 'currentWorkerId', 'current_worker_id', 'cardId', 'card_id', 'memoryKey', 'memory_key', 'key', 'name'];
  for (const key of idKeys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') {
      const trimmed = value.trim();
      if (subsystem === 'approvals') return safeApprovalId(trimmed);
      return trimmed;
    }
    if (typeof value === 'number' && Number.isSafeInteger(value)) {
      if (subsystem === 'approvals') return safeApprovalId(value);
      return String(value);
    }
  }
  if (subsystem === 'approvals') return safeApprovalId(fallback);
  return fallback;
}

function hasRecordIdentityKey(value: Record<string, unknown>): boolean {
  return [
    'id',
    'taskId',
    'task_id',
    'jobId',
    'job_id',
    'workerId',
    'worker_id',
    'currentWorkerId',
    'current_worker_id',
    'cardId',
    'card_id',
    'memoryKey',
    'memory_key',
    'tokenId',
    'token_id',
    'approvalId',
    'approval_id',
    'key',
    'name',
  ].some((key) => key in value);
}

function sensitiveApprovalValueForComparison(key: string, value: unknown): unknown {
  if (/^(?:id|approval[-_]?id|token|tokens|value|secret|password|credential|bearer|refresh|access|digest|api[-_]?key)$/iu.test(key)) {
    return `<sha256:${shortDigest(value)}>`;
  }
  return value;
}

function scopedRecordValue(subsystem: StateSnapshotDiffSubsystem, value: unknown): unknown {
  if (subsystem !== 'approvals') return value;
  if (!isRecord(value)) {
    return { token: '<redacted>' };
  }
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    /^(?:id|approval[-_]?id|token|tokens|value|secret|password|credential|bearer|refresh|access|digest|api[-_]?key)$/iu.test(key)
      ? '<redacted>'
      : nested,
  ]));
}

function scopedRecordCompareValue(subsystem: StateSnapshotDiffSubsystem, value: unknown): unknown {
  if (subsystem !== 'approvals') return value;
  if (!isRecord(value)) {
    return { token: sensitiveApprovalValueForComparison('token', value) };
  }
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    sensitiveApprovalValueForComparison(key, nested),
  ]));
}

function redactSourceForOutput(subsystem: StateSnapshotDiffSubsystem, source: string): string {
  const masked = normalizeSnapshotSourcePath(maskOpaqueSecretLiterals(source));
  if (subsystem !== 'approvals') return masked;
  return masked.split('/').map((segment) => {
    if (/^(?:approvals?|approval[-_]?tokens?|tokens?|ledger|state|snapshots?)(?:\.jsonl?)?(?::\d+)?(?::approvals?)?$/iu.test(segment)) {
      return segment;
    }
    return `<sha256:${shortDigest(segment)}>`;
  }).join('/');
}

function isGenericCollectionSource(source: string): boolean {
  return /(?:^|\/)(?:state|index|tasks|cards|kanban|approvals?|approval[-_]?tokens?|tokens?|ledger|workers?|memory|memories|cron|jobs)\.jsonl?(?::\d+)?$/iu.test(normalizeSnapshotSourcePath(source));
}

function addRecord(
  records: MutableSubsystemRecords,
  subsystem: StateSnapshotDiffSubsystem,
  id: string,
  value: unknown,
  source: string,
): void {
  const map = records[subsystem];
  if (!map.has(id)) {
    map.set(id, { id, value: scopedRecordValue(subsystem, value), compareValue: scopedRecordCompareValue(subsystem, value), source });
    return;
  }
  let suffix = 2;
  while (map.has(`${id}#${suffix}`)) suffix += 1;
  map.set(`${id}#${suffix}`, { id: `${id}#${suffix}`, value: scopedRecordValue(subsystem, value), compareValue: scopedRecordCompareValue(subsystem, value), source });
}

function addArrayRecords(
  records: MutableSubsystemRecords,
  subsystem: StateSnapshotDiffSubsystem,
  values: readonly unknown[],
  source: string,
): void {
  values.forEach((value, index) => addRecord(records, subsystem, recordId(value, `${source}[${index}]`, subsystem), value, source));
}

function addObjectMapRecords(
  records: MutableSubsystemRecords,
  subsystem: StateSnapshotDiffSubsystem,
  values: Record<string, unknown>,
  source: string,
): void {
  Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, value]) => {
      const fallback = subsystem === 'approvals' ? safeApprovalId(key) : key;
      const recordValue = subsystem === 'approvals' && !isRecord(value) ? { id: key, value } : value;
      const id = subsystem === 'approvals'
        ? fallback
        : recordId(recordValue, fallback, subsystem, { preferFallbackOverMutableDisplayName: true });
      addRecord(records, subsystem, id, recordValue, source);
    });
}

function likelySubsystemFromPath(relativePath: string): StateSnapshotDiffSubsystem | undefined {
  const normalized = normalizeSnapshotSourcePath(relativePath).toLowerCase();
  if (/approvals?|tokens?|ledger/.test(normalized)) return 'approvals';
  if (/tasks?|cards?|kanban/.test(normalized)) return 'tasks';
  if (/workers?/.test(normalized)) return 'workerIds';
  if (/memory|memories/.test(normalized)) return 'memory';
  if (/cron|schedule|jobs?/.test(normalized)) return 'cron';
  return undefined;
}

function extractWorkerIds(value: unknown, output: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) extractWorkerIds(item, output);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (/^(workerIds?|worker_ids?|workerId|worker_id|currentWorkerId|current_worker_id)$/iu.test(key)) {
      if (typeof nested === 'string' && nested.trim() !== '') output.add(nested);
      if (Array.isArray(nested)) {
        for (const item of nested) if (typeof item === 'string' && item.trim() !== '') output.add(item);
      }
    }
    extractWorkerIds(nested, output);
  }
}

function extractRecordsFromJson(records: MutableSubsystemRecords, parsed: unknown, source: string): void {
  const pathSubsystem = likelySubsystemFromPath(source);
  if (Array.isArray(parsed) && pathSubsystem !== undefined) {
    addArrayRecords(records, pathSubsystem, parsed, source);
  } else if (pathSubsystem !== undefined && !isRecord(parsed)) {
    addRecord(records, pathSubsystem, recordId(parsed, source, pathSubsystem), parsed, source);
  }

  if (isRecord(parsed)) {
    const rootArrays: ReadonlyArray<[StateSnapshotDiffSubsystem, readonly string[]]> = [
      ['tasks', ['tasks', 'cards', 'kanbanCards', 'kanban_cards']],
      ['approvals', ['approvals', 'approvalTokens', 'approval_tokens', 'tokens', 'ledger']],
      ['workerIds', ['workerIds', 'worker_ids', 'workers']],
      ['memory', ['memory', 'memories', 'memoryRecords', 'memory_records']],
      ['cron', ['cron', 'cronJobs', 'cron_jobs', 'jobs']],
    ];
    let foundRootCollection = false;
    for (const [subsystem, keys] of rootArrays) {
      if (pathSubsystem !== undefined && !isGenericCollectionSource(source) && subsystem !== pathSubsystem) continue;
      for (const key of keys) {
        const value = parsed[key];
        if (Array.isArray(value)) {
          foundRootCollection = true;
          addArrayRecords(records, subsystem, value, `${source}:${key}`);
        } else if (isRecord(value)) {
          foundRootCollection = true;
          addObjectMapRecords(records, subsystem, value, `${source}:${key}`);
        }
      }
    }

    if (pathSubsystem !== undefined && (!foundRootCollection || hasRecordIdentityKey(parsed))) {
      const values = Object.values(parsed);
      if (values.length > 0 && values.every(isRecord)) {
        addObjectMapRecords(records, pathSubsystem, parsed, source);
      } else if (pathSubsystem !== 'tasks' && !hasRecordIdentityKey(parsed) && values.length > 0 && values.every((value) => !isRecord(value) && !Array.isArray(value))) {
        addObjectMapRecords(records, pathSubsystem, parsed, source);
      } else {
        addRecord(records, pathSubsystem, recordId(parsed, source, pathSubsystem), parsed, source);
      }
    }
  }

  const workerIds = new Set<string>();
  extractWorkerIds(parsed, workerIds);
  for (const workerId of workerIds) {
    if (!records.workerIds.has(workerId)) addRecord(records, 'workerIds', workerId, { id: workerId }, source);
  }
}

async function collectSnapshotFiles(directory: string, current = directory, collected: string[] = []): Promise<string[]> {
  if (collected.length > MAX_DIRECTORY_FILES) {
    throw new Error(`State snapshot directory has too many files; maximum supported JSON/JSONL files is ${MAX_DIRECTORY_FILES}`);
  }
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      await collectSnapshotFiles(directory, path, collected);
    } else if (entry.isFile() && /\.jsonl?$/iu.test(entry.name)) {
      collected.push(path);
      if (collected.length > MAX_DIRECTORY_FILES) {
        throw new Error(`State snapshot directory has too many files; maximum supported JSON/JSONL files is ${MAX_DIRECTORY_FILES}`);
      }
    }
  }
  return collected;
}

function parseSnapshotFile(raw: string, file: string): ReadonlyArray<{ parsed: unknown; sourceSuffix: string }> {
  if (file.toLowerCase().endsWith('.jsonl')) {
    const records: Array<{ parsed: unknown; sourceSuffix: string }> = [];
    raw.split(/\r?\n/u).forEach((line, index) => {
      if (line.trim() === '') return;
      try {
        records.push({ parsed: JSON.parse(line) as unknown, sourceSuffix: `:${index + 1}` });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to read state snapshot JSONL ${file} line ${index + 1}: ${message}`);
      }
    });
    return records;
  }

  try {
    return [{ parsed: JSON.parse(raw) as unknown, sourceSuffix: '' }];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read state snapshot JSON ${file}: ${message}`);
  }
}

async function loadSnapshotDirectory(directory: string): Promise<MutableSubsystemRecords> {
  const rootStat = await stat(directory);
  if (!rootStat.isDirectory()) throw new Error(`State snapshot path must be a directory: ${directory}`);
  const records = emptyRecords();
  const files = await collectSnapshotFiles(directory);
  for (const file of files.sort()) {
    const fileStat = await stat(file);
    if (fileStat.size > MAX_JSON_FILE_BYTES) {
      throw new Error(`State snapshot file is too large: ${file}`);
    }
    const source = relative(directory, file) || basename(file);
    const parsedRecords = parseSnapshotFile(await readFile(file, 'utf8'), file);
    for (const { parsed, sourceSuffix } of parsedRecords) {
      extractRecordsFromJson(records, parsed, `${source}${sourceSuffix}`);
    }
  }
  return records;
}

function changedFields(before: unknown, after: unknown): readonly string[] {
  if (!isRecord(before) || !isRecord(after)) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].sort().filter((key) => stableStringify(before[key]) !== stableStringify(after[key]));
}

function diffSubsystem(
  subsystem: StateSnapshotDiffSubsystem,
  before: Map<string, StateSnapshotDiffRecord>,
  after: Map<string, StateSnapshotDiffRecord>,
): StateSnapshotSubsystemDiff {
  const added: StateSnapshotRecordChange[] = [];
  const removed: StateSnapshotRecordChange[] = [];
  const changed: StateSnapshotRecordChange[] = [];

  for (const [id, afterRecord] of after) {
    const beforeRecord = before.get(id);
    if (beforeRecord === undefined) {
      added.push({ type: 'added', id, after: redactForOutput(afterRecord.value), afterSource: redactSourceForOutput(subsystem, afterRecord.source) });
    } else if (stableStringify(beforeRecord.compareValue) !== stableStringify(afterRecord.compareValue)) {
      changed.push({
        type: 'changed',
        id,
        before: redactForOutput(beforeRecord.value),
        after: redactForOutput(afterRecord.value),
        changedFields: changedFields(beforeRecord.compareValue, afterRecord.compareValue),
        beforeSource: redactSourceForOutput(subsystem, beforeRecord.source),
        afterSource: redactSourceForOutput(subsystem, afterRecord.source),
      });
    }
  }
  for (const [id, beforeRecord] of before) {
    if (!after.has(id)) {
      removed.push({ type: 'removed', id, before: redactForOutput(beforeRecord.value), beforeSource: redactSourceForOutput(subsystem, beforeRecord.source) });
    }
  }

  const byId = (a: StateSnapshotRecordChange, b: StateSnapshotRecordChange) => a.id.localeCompare(b.id);
  return {
    subsystem,
    added: added.sort(byId),
    removed: removed.sort(byId),
    changed: changed.sort(byId),
  };
}

function summarize(diffs: readonly StateSnapshotSubsystemDiff[]): StateSnapshotDiffSummary {
  const bySubsystem = Object.fromEntries(SUBSYSTEMS.map((subsystem) => [subsystem, { added: 0, removed: 0, changed: 0 }])) as StateSnapshotDiffSummary['bySubsystem'];
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const diff of diffs) {
    const counts = { added: diff.added.length, removed: diff.removed.length, changed: diff.changed.length };
    (bySubsystem as Record<StateSnapshotDiffSubsystem, typeof counts>)[diff.subsystem] = counts;
    added += counts.added;
    removed += counts.removed;
    changed += counts.changed;
  }
  return { added, removed, changed, bySubsystem };
}

function renderTextSummary(summary: StateSnapshotDiffSummary): string {
  const lines = [`State snapshot diff: ${summary.added} added, ${summary.removed} removed, ${summary.changed} changed.`];
  for (const subsystem of SUBSYSTEMS) {
    const counts = summary.bySubsystem[subsystem];
    lines.push(`- ${subsystem}: ${counts.added} added, ${counts.removed} removed, ${counts.changed} changed`);
  }
  return lines.join('\n');
}

export async function diffStateSnapshotDirectories(beforePath: string, afterPath: string): Promise<StateSnapshotDirectoryDiffReport> {
  const [beforeRecords, afterRecords] = await Promise.all([
    loadSnapshotDirectory(beforePath),
    loadSnapshotDirectory(afterPath),
  ]);
  const diffs = SUBSYSTEMS.map((subsystem) => diffSubsystem(subsystem, beforeRecords[subsystem], afterRecords[subsystem]));
  const summary = summarize(diffs);
  return {
    command: 'dr snapshot-diff',
    beforePath,
    afterPath,
    summary,
    textSummary: renderTextSummary(summary),
    diffs,
  };
}
