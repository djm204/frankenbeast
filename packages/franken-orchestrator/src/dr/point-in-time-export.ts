import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import { redactLogData, redactSensitiveText } from '../logging/redaction.js';

export const POINT_IN_TIME_EXPORT_SCHEMA_VERSION = 1;

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
    readonly approvals: readonly RedactedRecordSummary[];
    readonly memory: readonly MemoryMetadataSummary[];
    readonly tasks: readonly RedactedRecordSummary[];
    readonly runs: readonly RedactedRecordSummary[];
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

type EvidenceSection = 'approvals' | 'memory' | 'tasks' | 'runs' | 'logs' | 'config' | 'other';

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
  if (base.endsWith('.log') || normalized.includes('/logs/')) return 'logs';
  if (normalized.includes('approval') || normalized.includes('ledger')) return 'approvals';
  if (normalized.includes('memory')) return 'memory';
  if (base === 'kanban.db' || normalized.includes('kanban') || normalized.includes('/tasks/') || normalized.includes('task')) return 'tasks';
  if (normalized.startsWith('runs/') || normalized.includes('/runs/') || normalized.includes('run-metadata') || normalized.includes('attempt')) return 'runs';
  if (/config\.(?:json|ya?ml|toml|ini)$/iu.test(base) || base === '.env' || base.startsWith('.env.')) return 'config';
  return 'other';
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
  for (const key of ['id', 'taskId', 'runId', 'state', 'status', 'createdAt', 'updatedAt', 'startedAt', 'completedAt', 'actionClass', 'target']) {
    if (redacted[key] !== undefined) summary[key] = redacted[key];
  }
  return summary;
}

function sanitizeRecords(text: string): Record<string, unknown>[] {
  return parseJsonObjectOrArray(text)
    .map(sanitizeRecord)
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
  }
  return { recordCount: records.length, keys: keys.sort(), metadata };
}

function tailLines(text: string, limit: number): string[] {
  return text.split(/\r?\n/u).slice(-limit).map((line) => redactSensitiveText(line));
}

async function checksumFor(root: string, absolutePath: string, data: Buffer): Promise<FileChecksum> {
  return {
    path: normalizeRelative(root, absolutePath),
    bytes: data.byteLength,
    sha256: sha256(data),
  };
}

export async function createPointInTimeExport(options: PointInTimeExportOptions): Promise<PointInTimeExportReport> {
  const sourceDir = resolve(options.stateDir);
  const outputPath = resolve(options.outputPath);
  const dryRun = options.dryRun === true;
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const logTailLimit = options.logTailLines ?? 50;
  const sourceStats = await stat(sourceDir);
  if (!sourceStats.isDirectory()) throw new Error(`DR export source must be a directory: ${options.stateDir}`);

  const discovered = await walkFiles(sourceDir);
  const configChecksums: FileChecksum[] = [];
  const files: FileChecksum[] = [];
  const approvals: RedactedRecordSummary[] = [];
  const memory: MemoryMetadataSummary[] = [];
  const tasks: RedactedRecordSummary[] = [];
  const runs: RedactedRecordSummary[] = [];
  const logs: LogTailSummary[] = [];

  for (const absolutePath of discovered) {
    const resolved = resolve(absolutePath);
    if (resolved === outputPath || !await pathIsFile(resolved)) continue;
    const data = await readFile(resolved);
    const text = data.toString('utf8');
    const checksum = await checksumFor(sourceDir, resolved, data);
    const section = classifyExportPath(checksum.path);
    files.push(checksum);
    if (section === 'config') {
      configChecksums.push(checksum);
    } else if (section === 'approvals') {
      approvals.push({ ...checksum, records: sanitizeRecords(text) });
    } else if (section === 'memory') {
      memory.push({ ...checksum, ...sanitizeMemory(text) });
    } else if (section === 'tasks') {
      tasks.push({ ...checksum, records: sanitizeRecords(text) });
    } else if (section === 'runs') {
      runs.push({ ...checksum, records: sanitizeRecords(text) });
    } else if (section === 'logs') {
      logs.push({ ...checksum, tail: tailLines(text, logTailLimit) });
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

  const serialized = `${JSON.stringify(redactLogData(report), null, 2)}\n`;
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
