import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';

import { redactLogData } from '../logging/redaction.js';

export type StateSnapshotDiffSubsystem = 'tasks' | 'approvals' | 'workerIds' | 'memory' | 'cron';
export type StateSnapshotDiffChangeType = 'added' | 'removed' | 'changed';

export interface StateSnapshotDiffRecord {
  readonly id: string;
  readonly value: unknown;
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

function containsSensitiveIdMarker(value: string): boolean {
  return /(?:token|secret|password|credential|bearer|refresh|access|api[-_]?key)/iu.test(value);
}

function recordId(record: unknown, fallback: string, subsystem?: StateSnapshotDiffSubsystem): string {
  if (!isRecord(record)) return fallback;
  const idKeys = subsystem === 'approvals'
    ? ['id']
    : ['id', 'taskId', 'task_id', 'jobId', 'job_id', 'memoryKey', 'memory_key', 'key', 'name'];
  for (const key of idKeys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') {
      const trimmed = value.trim();
      if (subsystem === 'approvals' && containsSensitiveIdMarker(trimmed)) return fallback;
      return trimmed;
    }
    if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  }
  return fallback;
}

function scopedRecordValue(subsystem: StateSnapshotDiffSubsystem, value: unknown): unknown {
  if (subsystem === 'approvals' && !isRecord(value)) {
    return { token: value };
  }
  return value;
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
    map.set(id, { id, value: scopedRecordValue(subsystem, value), source });
    return;
  }
  let suffix = 2;
  while (map.has(`${id}#${suffix}`)) suffix += 1;
  map.set(`${id}#${suffix}`, { id: `${id}#${suffix}`, value: scopedRecordValue(subsystem, value), source });
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
    .forEach(([key, value], index) => {
      const fallback = subsystem === 'approvals' ? `${source}{${index}}` : key;
      addRecord(records, subsystem, recordId(value, fallback, subsystem), value, source);
    });
}

function likelySubsystemFromPath(relativePath: string): StateSnapshotDiffSubsystem | undefined {
  const normalized = relativePath.toLowerCase().replaceAll(sep, '/');
  if (/tasks?|cards?|kanban/.test(normalized)) return 'tasks';
  if (/approvals?|tokens?|ledger/.test(normalized)) return 'approvals';
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
  }

  if (isRecord(parsed)) {
    const rootArrays: ReadonlyArray<[StateSnapshotDiffSubsystem, readonly string[]]> = [
      ['tasks', ['tasks', 'cards', 'kanbanCards', 'kanban_cards']],
      ['approvals', ['approvals', 'approvalTokens', 'approval_tokens', 'tokens', 'ledger']],
      ['memory', ['memory', 'memories', 'memoryRecords', 'memory_records']],
      ['cron', ['cron', 'cronJobs', 'cron_jobs', 'jobs']],
    ];
    let foundRootCollection = false;
    for (const [subsystem, keys] of rootArrays) {
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

    if (pathSubsystem !== undefined && !foundRootCollection) {
      const values = Object.values(parsed);
      if (values.length > 0 && values.every(isRecord)) {
        addObjectMapRecords(records, pathSubsystem, parsed, source);
      } else {
        addRecord(records, pathSubsystem, recordId(parsed, source, pathSubsystem), parsed, source);
      }
    }
  }

  const workerIds = new Set<string>();
  extractWorkerIds(parsed, workerIds);
  for (const workerId of workerIds) {
    addRecord(records, 'workerIds', workerId, { id: workerId }, source);
  }
}

async function collectJsonFiles(directory: string, current = directory, collected: string[] = []): Promise<string[]> {
  if (collected.length > MAX_DIRECTORY_FILES) {
    throw new Error(`State snapshot directory has too many files; maximum supported JSON files is ${MAX_DIRECTORY_FILES}`);
  }
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      await collectJsonFiles(directory, path, collected);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
      collected.push(path);
      if (collected.length > MAX_DIRECTORY_FILES) {
        throw new Error(`State snapshot directory has too many files; maximum supported JSON files is ${MAX_DIRECTORY_FILES}`);
      }
    }
  }
  return collected;
}

async function loadSnapshotDirectory(directory: string): Promise<MutableSubsystemRecords> {
  const rootStat = await stat(directory);
  if (!rootStat.isDirectory()) throw new Error(`State snapshot path must be a directory: ${directory}`);
  const records = emptyRecords();
  const files = await collectJsonFiles(directory);
  for (const file of files.sort()) {
    const fileStat = await stat(file);
    if (fileStat.size > MAX_JSON_FILE_BYTES) {
      throw new Error(`State snapshot JSON file is too large: ${file}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(file, 'utf8')) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to read state snapshot JSON ${file}: ${message}`);
    }
    extractRecordsFromJson(records, parsed, relative(directory, file) || basename(file));
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
      added.push({ type: 'added', id, after: redactForOutput(afterRecord.value), afterSource: afterRecord.source });
    } else if (stableStringify(beforeRecord.value) !== stableStringify(afterRecord.value)) {
      changed.push({
        type: 'changed',
        id,
        before: redactForOutput(beforeRecord.value),
        after: redactForOutput(afterRecord.value),
        changedFields: changedFields(beforeRecord.value, afterRecord.value),
        beforeSource: beforeRecord.source,
        afterSource: afterRecord.source,
      });
    }
  }
  for (const [id, beforeRecord] of before) {
    if (!after.has(id)) {
      removed.push({ type: 'removed', id, before: redactForOutput(beforeRecord.value), beforeSource: beforeRecord.source });
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
