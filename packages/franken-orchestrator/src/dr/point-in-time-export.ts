import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import Database from 'better-sqlite3';

import { maskOpaqueSecretLiterals, redactLogData, redactSensitiveText } from '../logging/redaction.js';

export const POINT_IN_TIME_EXPORT_SCHEMA_VERSION = 1;
const MAX_LOG_TAIL_LINE_CHARS = 8192;
const MAX_TEXT_EVIDENCE_BYTES = 2 * 1024 * 1024;
const MAX_PENDING_LOG_CHARS = MAX_LOG_TAIL_LINE_CHARS * 2;

export interface PointInTimeExportOptions {
  readonly stateDir: string;
  readonly outputPath: string;
  readonly dryRun?: boolean | undefined;
  readonly generatedAt?: string | undefined;
  readonly logTailLines?: number | undefined;
}

export interface PointInTimeExportReport {
  readonly ok: true;
  readonly command: 'dr export';
  readonly dryRun: boolean;
  readonly wouldWrite: boolean;
  readonly outputPath: string;
  readonly manifest: {
    readonly schemaVersion: number;
    readonly generatedAt: string;
    readonly sourceDir: string;
    readonly sections: Readonly<Record<'approvals' | 'memory' | 'tasks' | 'runs' | 'logs', number>>;
    readonly configChecksums: readonly FileChecksum[];
    readonly files: readonly FileChecksum[];
  };
  readonly evidence: {
    readonly approvals: ReadonlyArray<RedactedRecordSummary | SqliteTableSummary>;
    readonly memory: readonly MemoryMetadataSummary[];
    readonly tasks: ReadonlyArray<RedactedRecordSummary | SqliteTableSummary>;
    readonly runs: ReadonlyArray<RedactedRecordSummary | SqliteTableSummary>;
    readonly logs: readonly LogTailSummary[];
  };
}

export interface FileChecksum {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface RedactedRecordSummary extends FileChecksum {
  readonly records: readonly Record<string, unknown>[];
}

export interface MemoryMetadataSummary extends FileChecksum {
  readonly recordCount: number;
  readonly keys: readonly string[];
  readonly metadata: readonly Record<string, unknown>[];
}

export interface LogTailSummary extends FileChecksum {
  readonly tail: readonly string[];
}

export interface SqliteTableSummary extends FileChecksum {
  readonly table: string;
  readonly rowCount: number;
  readonly records: readonly Record<string, unknown>[];
}

type EvidenceSection = 'approvals' | 'memory' | 'tasks' | 'runs' | 'logs' | 'config' | 'other';
type SqliteEvidenceSection = 'approvals' | 'tasks' | 'runs';

function sha256(data: Buffer | string): string {
  return `sha256:${createHash('sha256').update(data).digest('hex')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function pathIsFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files.sort();
}

function normalizeRelative(root: string, absolutePath: string): string {
  const rel = relative(root, absolutePath).split(sep).join('/');
  if (!rel || rel.startsWith('../') || rel === '..' || rel.startsWith('/')) {
    throw new Error(`Unsafe DR export source path: ${absolutePath}`);
  }
  return rel;
}

function classifyExportPath(path: string): EvidenceSection {
  const normalized = path.toLowerCase();
  const base = basename(normalized);
  if (/\.log(?:\.\d+)?$/iu.test(base) || normalized.startsWith('logs/') || normalized.includes('/logs/')) return 'logs';
  if (normalized.includes('pendingapproval') || normalized.includes('pending_approval') || normalized.includes('approval') || normalized.includes('ledger')) return 'approvals';
  if (normalized.includes('memory')) return 'memory';
  if (base === 'kanban.db' || normalized.includes('kanban') || normalized.includes('/tasks/') || normalized.includes('task')) return 'tasks';
  if (base === 'beast.db' || normalized.startsWith('runs/') || normalized.includes('/runs/') || normalized.includes('run-metadata') || normalized.includes('attempt')) return 'runs';
  if (/config\.(?:json|ya?ml|toml|ini)$/iu.test(base) || base === '.env' || base.startsWith('.env.')) return 'config';
  return 'other';
}

function classifySqliteTable(table: string): SqliteEvidenceSection | undefined {
  const normalized = table.toLowerCase();
  if (normalized.includes('approval')) return 'approvals';
  if (normalized.includes('task') || normalized.includes('card') || normalized.includes('issue')) return 'tasks';
  if (normalized.includes('run') || normalized.includes('attempt') || normalized.includes('event') || normalized.includes('tracked_agent') || normalized === 'agents') return 'runs';
  return undefined;
}

function isMemoryStorePath(path: string): boolean {
  const normalized = path.toLowerCase();
  return normalized.includes('/memory') || basename(normalized) === 'memory.db';
}

function isWithinDirectory(root: string, candidate: string): boolean {
  const rel = relative(root, candidate).split(sep).join('/');
  return rel !== '' && !rel.startsWith('../') && rel !== '..' && !rel.startsWith('/');
}

function quoteSqliteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/gu, '""')}"`;
}

function resolvePointInTimeSourceDir(input: string): string {
  const resolved = resolve(input);
  if (basename(resolved).toLowerCase() === 'state' && basename(dirname(resolved)).toLowerCase() === '.fbeast') {
    return dirname(resolved);
  }
  return resolved;
}

function parseJsonObjectOrArray(text: string): unknown[] {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return parsed;
    if (!isRecord(parsed)) return [];
    for (const candidate of ['approvals', 'tasks', 'runs', 'memories', 'records', 'entries']) {
      const value = parsed[candidate];
      if (Array.isArray(value)) return value;
    }
    return [parsed];
  } catch {
    return [];
  }
}

function sanitizeRecord(value: unknown): Record<string, unknown> {
  const redacted = redactLogData(value);
  if (!isRecord(redacted)) return {};
  const summary: Record<string, unknown> = {};
  for (const key of [
    'id', 'task_id', 'taskId', 'run_id', 'runId', 'state', 'status', 'created_at', 'createdAt', 'updated_at', 'updatedAt',
    'started_at', 'startedAt', 'finished_at', 'finishedAt', 'completed_at', 'completedAt', 'definition_id', 'tracked_agent_id',
    'action_class', 'actionClass', 'target', 'description', 'requestedAt', 'command', 'tool', 'risk', 'affectedFiles', 'sessionId',
  ]) {
    if (redacted[key] !== undefined) summary[key] = redacted[key];
  }
  return summary;
}

function sanitizeRecords(text: string): Record<string, unknown>[] {
  return parseJsonObjectOrArray(text)
    .map(sanitizeRecord)
    .filter((record) => Object.keys(record).length > 0);
}

function sanitizeApprovalRecord(value: unknown): Record<string, unknown> {
  const record = sanitizeRecord(value);
  if (typeof record.id === 'string') {
    record.id = sha256(Buffer.from(record.id, 'utf8'));
  }
  return record;
}

function sanitizeApprovalRecords(text: string): Record<string, unknown>[] {
  return parseJsonObjectOrArray(text)
    .map(sanitizeApprovalRecord)
    .filter((record) => Object.keys(record).length > 0);
}

function sanitizeMemory(text: string): { recordCount: number; keys: string[]; metadata: Record<string, unknown>[] } {
  const records = parseJsonObjectOrArray(text);
  const keys: string[] = [];
  const metadata: Record<string, unknown>[] = [];
  for (const record of records) {
    if (!isRecord(record)) continue;
    if (typeof record.key === 'string') keys.push(redactSensitiveText(record.key));
    const rawMetadata = record.metadata;
    if (isRecord(rawMetadata)) {
      const redactedMetadata = redactLogData(rawMetadata);
      if (isRecord(redactedMetadata)) metadata.push(redactedMetadata);
    }
    const working = record.working;
    if (isRecord(working)) {
      const workingKeys = Object.keys(working).map(redactSensitiveText).sort();
      keys.push(...workingKeys.map((key) => `working.${key}`));
      metadata.push({ section: 'working', recordCount: workingKeys.length });
    } else if (typeof record.key !== 'string' && rawMetadata === undefined) {
      const objectKeys = Object.keys(record).map(redactSensitiveText).sort();
      keys.push(...objectKeys);
      metadata.push({ section: 'object', recordCount: objectKeys.length });
    }
  }
  return { recordCount: records.length, keys: keys.sort(), metadata };
}

function boundPendingLogLine(pending: string): string {
  const redacted = redactSensitiveText(pending);
  if (redacted.length <= MAX_PENDING_LOG_CHARS) return redacted;
  return `${redacted.slice(0, MAX_LOG_TAIL_LINE_CHARS)}${redacted.slice(-MAX_LOG_TAIL_LINE_CHARS)}`;
}

function summarizeSqliteMemoryStore(absolutePath: string, checksum: FileChecksum): MemoryMetadataSummary | undefined {
  let db: Database.Database | undefined;
  try {
    db = new Database(absolutePath, { readonly: true, fileMustExist: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>;
    const metadata: Record<string, unknown>[] = [];
    let recordCount = 0;
    for (const { name } of tables) {
      const quoted = quoteSqliteIdentifier(name);
      const countRow = db.prepare(`SELECT COUNT(*) AS count FROM ${quoted}`).get() as { count: number };
      recordCount += countRow.count;
      metadata.push({ table: name, rowCount: countRow.count });
    }
    return { ...checksum, recordCount, keys: [], metadata };
  } catch {
    return undefined;
  } finally {
    db?.close();
  }
}

async function checksumForPath(root: string, absolutePath: string): Promise<FileChecksum> {
  const hasher = createHash('sha256');
  let bytes = 0;
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(absolutePath);
    stream.on('data', (chunk: Buffer) => {
      bytes += chunk.byteLength;
      hasher.update(chunk);
    });
    stream.on('error', reject);
    stream.on('end', resolvePromise);
  });
  return {
    path: normalizeRelative(root, absolutePath),
    bytes,
    sha256: `sha256:${hasher.digest('hex')}`,
  };
}

async function checksumAndTextFor(root: string, absolutePath: string): Promise<{ checksum: FileChecksum; text: string }> {
  const data = await readFile(absolutePath);
  return {
    checksum: {
      path: normalizeRelative(root, absolutePath),
      bytes: data.byteLength,
      sha256: sha256(data),
    },
    text: data.toString('utf8'),
  };
}

async function checksumAndTailFor(root: string, absolutePath: string, limit: number): Promise<LogTailSummary> {
  const hasher = createHash('sha256');
  const lines: string[] = [];
  let bytes = 0;
  let pending = '';
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(absolutePath);
    stream.on('data', (chunk: Buffer) => {
      bytes += chunk.byteLength;
      hasher.update(chunk);
      const text = chunk.toString('utf8');
      const parts = `${pending}${text}`.split(/\r?\n/u);
      pending = boundPendingLogLine(parts.pop() ?? '');
      for (const line of parts) {
        const redacted = redactSensitiveText(line);
        lines.push(redacted.slice(-MAX_LOG_TAIL_LINE_CHARS));
        if (lines.length > limit) lines.splice(0, lines.length - limit);
      }
    });
    stream.on('error', reject);
    stream.on('end', () => {
      if (pending.length > 0) {
        const redacted = redactSensitiveText(pending);
        lines.push(redacted.slice(-MAX_LOG_TAIL_LINE_CHARS));
      }
      if (lines.length > limit) lines.splice(0, lines.length - limit);
      resolvePromise();
    });
  });
  return {
    path: normalizeRelative(root, absolutePath),
    bytes,
    sha256: `sha256:${hasher.digest('hex')}`,
    tail: lines,
  };
}

function summarizeSqliteTables(absolutePath: string, checksum: FileChecksum): Record<SqliteEvidenceSection, SqliteTableSummary[]> {
  const result: Record<SqliteEvidenceSection, SqliteTableSummary[]> = { approvals: [], tasks: [], runs: [] };
  if (isMemoryStorePath(checksum.path)) return result;
  let db: Database.Database | undefined;
  try {
    db = new Database(absolutePath, { readonly: true, fileMustExist: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>;
    for (const { name } of tables) {
      const section = classifySqliteTable(name);
      if (section === undefined) continue;
      const quoted = quoteSqliteIdentifier(name);
      const countRow = db.prepare(`SELECT COUNT(*) AS count FROM ${quoted}`).get() as { count: number };
      const columns = db.prepare(`PRAGMA table_info(${quoted})`).all() as Array<{ name: string }>;
      const preferred = [
        'id', 'task_id', 'taskId', 'run_id', 'runId', 'status', 'state', 'created_at', 'createdAt', 'updated_at', 'updatedAt',
        'started_at', 'startedAt', 'finished_at', 'finishedAt', 'completed_at', 'completedAt', 'definition_id', 'tracked_agent_id',
        'action_class', 'actionClass', 'target', 'description', 'requestedAt', 'command', 'tool', 'risk', 'affectedFiles', 'sessionId',
      ];
      const selected = preferred.filter((column) => columns.some((candidate) => candidate.name === column));
      const records = selected.length === 0
        ? []
        : (db.prepare(`SELECT ${selected.map(quoteSqliteIdentifier).join(', ')} FROM ${quoted} ORDER BY rowid DESC LIMIT 25`).all() as Array<Record<string, unknown>>)
          .map((record) => section === 'approvals' ? sanitizeApprovalRecord(record) : sanitizeRecord(record))
          .filter((record) => Object.keys(record).length > 0);
      result[section].push({ ...checksum, table: name, rowCount: countRow.count, records });
    }
  } catch {
    // Keep the checksum evidence for malformed or non-SQLite .db files; do not fail an incident export.
  } finally {
    db?.close();
  }
  return result;
}

function splitChatPendingApprovals(checksum: FileChecksum, text: string): RedactedRecordSummary | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed) || parsed.pendingApproval == null) return undefined;
    return { ...checksum, records: [sanitizeRecord(parsed.pendingApproval)] };
  } catch {
    return undefined;
  }
}

export async function createPointInTimeExport(options: PointInTimeExportOptions): Promise<PointInTimeExportReport> {
  const sourceDir = resolvePointInTimeSourceDir(options.stateDir);
  const outputPath = resolve(options.outputPath);
  const dryRun = options.dryRun === true;
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const logTailLimit = options.logTailLines ?? 50;
  const sourceStats = await stat(sourceDir);
  if (!sourceStats.isDirectory()) throw new Error(`DR export source must be a directory: ${options.stateDir}`);
  if (isWithinDirectory(sourceDir, outputPath) && await pathIsFile(outputPath)) {
    throw new Error(`DR export output path must not overwrite an existing source file: ${options.outputPath}`);
  }

  const discovered = await walkFiles(sourceDir);
  const configChecksums: FileChecksum[] = [];
  const files: FileChecksum[] = [];
  const approvals: Array<RedactedRecordSummary | SqliteTableSummary> = [];
  const memory: MemoryMetadataSummary[] = [];
  const tasks: Array<RedactedRecordSummary | SqliteTableSummary> = [];
  const runs: Array<RedactedRecordSummary | SqliteTableSummary> = [];
  const logs: LogTailSummary[] = [];

  for (const absolutePath of discovered) {
    const resolved = resolve(absolutePath);
    if (resolved === outputPath || !await pathIsFile(resolved)) continue;
    const relativePath = normalizeRelative(sourceDir, resolved);
    const section = classifyExportPath(relativePath);
    if (section === 'logs') {
      let logSummary: LogTailSummary;
      try {
        logSummary = await checksumAndTailFor(sourceDir, resolved, logTailLimit);
      } catch (error) {
        if (isRecord(error) && error.code === 'ENOENT') continue;
        throw error;
      }
      files.push({ path: logSummary.path, bytes: logSummary.bytes, sha256: logSummary.sha256 });
      logs.push(logSummary);
      continue;
    }

    let checksum: FileChecksum;
    let text: string | undefined;
    try {
      const fileStats = await stat(resolved);
      const couldReadText = fileStats.size <= MAX_TEXT_EVIDENCE_BYTES
        && (relativePath.endsWith('.json') || section === 'approvals' || section === 'memory' || section === 'tasks' || section === 'runs');
      if (couldReadText) {
        const textEvidence = await checksumAndTextFor(sourceDir, resolved);
        checksum = textEvidence.checksum;
        text = textEvidence.text;
      } else {
        checksum = await checksumForPath(sourceDir, resolved);
      }
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') continue;
      throw error;
    }
    files.push(checksum);

    if (basename(checksum.path).endsWith('.db')) {
      const sqlite = summarizeSqliteTables(resolved, checksum);
      approvals.push(...sqlite.approvals);
      tasks.push(...sqlite.tasks);
      runs.push(...sqlite.runs);
      const memorySummary = isMemoryStorePath(checksum.path) ? summarizeSqliteMemoryStore(resolved, { ...checksum }) : undefined;
      if (memorySummary !== undefined) memory.push(memorySummary);
    }

    if (section === 'config') {
      configChecksums.push({ ...checksum });
      continue;
    }

    if (text === undefined) continue;

    const pendingApprovalSummary = splitChatPendingApprovals(checksum, text);
    if (pendingApprovalSummary !== undefined) approvals.push(pendingApprovalSummary);

    if (section === 'approvals') {
      const records = sanitizeApprovalRecords(text);
      if (records.length > 0) approvals.push({ ...checksum, records });
    } else if (section === 'memory') {
      memory.push({ ...checksum, ...sanitizeMemory(text) });
    } else if (section === 'tasks') {
      const records = sanitizeRecords(text);
      if (records.length > 0) tasks.push({ ...checksum, records });
    } else if (section === 'runs') {
      const records = sanitizeRecords(text);
      if (records.length > 0) runs.push({ ...checksum, records });
    }
  }

  const report: PointInTimeExportReport = {
    ok: true,
    command: 'dr export',
    dryRun,
    wouldWrite: !dryRun,
    outputPath,
    manifest: {
      schemaVersion: POINT_IN_TIME_EXPORT_SCHEMA_VERSION,
      generatedAt,
      sourceDir,
      sections: {
        approvals: approvals.length,
        memory: memory.length,
        tasks: tasks.length,
        runs: runs.length,
        logs: logs.length,
      },
      configChecksums,
      files,
    },
    evidence: { approvals, memory, tasks, runs, logs },
  };

  const serialized = `${maskOpaqueSecretLiterals(JSON.stringify(redactLogData(report), null, 2))}\n`;
  if (!dryRun) {
    await mkdir(dirname(outputPath), { recursive: true });
    const tmpPath = join(dirname(outputPath), `.${basename(outputPath)}.tmp-${process.pid}-${Date.now()}`);
    await writeFile(tmpPath, serialized, { encoding: 'utf8', mode: 0o600 });
    await rename(tmpPath, outputPath).catch(async (error: unknown) => {
      await rm(tmpPath, { force: true });
      throw error;
    });
  }
  return JSON.parse(serialized) as PointInTimeExportReport;
}
