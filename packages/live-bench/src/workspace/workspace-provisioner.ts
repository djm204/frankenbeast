import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, parse, relative, resolve, sep } from 'node:path';
import type { BenchmarkMatrixRow, BenchmarkTask } from '../types.js';
import type { FixtureStore } from './fixture-store.js';

export interface WorkspaceProvisionerConfig {
  readonly fixtures: FixtureStore;
  readonly runsRoot: string;
}

export interface ProvisionedWorkspace {
  readonly runDir: string;
  readonly workspaceDir: string;
  readonly evidenceDir: string;
  readonly environmentPath: string;
}

export interface BenchmarkEnvironmentSnapshot {
  readonly version: 1;
  readonly runId: string;
  readonly taskId: string;
  readonly fixture: string;
  readonly commitSha: string;
  readonly client: BenchmarkMatrixRow['client'];
  readonly mode: BenchmarkMatrixRow['mode'];
  readonly fbeastTopology: BenchmarkMatrixRow['fbeastTopology'];
  readonly model: string;
  readonly clientVersion: string;
  readonly hostClass: string;
  readonly runTimestamp: string;
  readonly provisionedAt: string;
}

export class WorkspaceProvisioner {
  private readonly fixtures: FixtureStore;
  private readonly runsRoot: string;
  private readonly runsRootReal: string;

  constructor(config: WorkspaceProvisionerConfig) {
    this.fixtures = config.fixtures;
    this.runsRoot = resolve(config.runsRoot);
    ensureNoSymlinkPathPrefix(this.runsRoot, 'runs root');
    ensureSafeExistingDirectory(this.runsRoot, 'runs root');
    mkdirSync(this.runsRoot, { recursive: true });
    this.runsRootReal = realpathSync(this.runsRoot);
  }

  provision(row: BenchmarkMatrixRow, task: BenchmarkTask): ProvisionedWorkspace {
    assertSafePathSegment(row.runId, 'run id');
    assertSafePathSegment(row.taskId, 'task id');
    assertSafePathSegment(row.client, 'client');
    assertSafePathSegment(row.mode, 'mode');
    assertSafePathSegment(row.fbeastTopology, 'fbeast topology');
    const modelSegment = modelPathSegment(row.model);
    if (row.taskId !== task.taskId) {
      throw new Error(`Benchmark row taskId ${row.taskId} does not match task ${task.taskId}`);
    }

    const fixtureDir = this.fixtures.resolveFixture(task.projectFixture);
    const runDate = dateSegment(row.runTimestamp);
    const dateDir = resolve(this.runsRoot, runDate);
    ensureContained(dateDir, this.runsRoot, 'run date directory');
    ensureSafeExistingDirectory(dateDir, 'run date directory');
    mkdirSync(dateDir, { recursive: true });
    ensureContained(realpathSync(dateDir), this.runsRootReal, 'run date real directory');

    const runDir = resolve(dateDir, row.runId, row.taskId, row.client, row.mode, row.fbeastTopology, modelSegment);
    const workspaceDir = join(runDir, 'workspace');
    const evidenceDir = join(runDir, 'evidence');
    const environmentPath = join(runDir, 'environment.json');

    ensureContained(runDir, dateDir, 'run directory');
    ensureContained(runDir, this.runsRoot, 'run directory');
    ensureNoSymlinkPathComponents(dateDir, runDir, 'run directory');
    ensureSafeExistingDirectory(runDir, 'run directory');
    rmSync(runDir, { recursive: true, force: true });
    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(evidenceDir, { recursive: true });

    assertNoSymlinksInTree(fixtureDir);
    cpSync(fixtureDir, workspaceDir, { recursive: true });
    if (row.mode === 'baseline') {
      rmSync(join(workspaceDir, '.fbeast'), { recursive: true, force: true });
    }

    const environment: BenchmarkEnvironmentSnapshot = {
      version: 1,
      runId: row.runId,
      taskId: row.taskId,
      fixture: task.projectFixture,
      commitSha: row.commitSha,
      client: row.client,
      mode: row.mode,
      fbeastTopology: row.fbeastTopology,
      model: row.model,
      clientVersion: row.clientVersion,
      hostClass: row.hostClass,
      runTimestamp: row.runTimestamp,
      provisionedAt: new Date().toISOString(),
    };
    writeFileSync(environmentPath, `${JSON.stringify(environment, null, 2)}\n`, 'utf8');

    return { runDir, workspaceDir, evidenceDir, environmentPath };
  }
}

const RUN_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(Z|[+-]\d{2}:\d{2})$/;

function dateSegment(timestamp: string): string {
  const match = RUN_TIMESTAMP_PATTERN.exec(timestamp);
  if (!match) {
    throw new Error(`Invalid runTimestamp: ${timestamp}`);
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, millisecondText = '000'] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(millisecondText);

  if (
    month < 1
    || month > 12
    || day < 1
    || day > daysInMonth(year, month)
    || hour > 23
    || minute > 59
    || second > 59
    || millisecond > 999
  ) {
    throw new Error(`Invalid runTimestamp: ${timestamp}`);
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid runTimestamp: ${timestamp}`);
  }
  const normalized = parsed.toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T/.test(normalized)) {
    throw new Error(`Invalid runTimestamp: ${timestamp}`);
  }
  return normalized.slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function modelPathSegment(model: string): string {
  const codeUnits = Buffer.alloc(model.length * 2);
  for (let index = 0; index < model.length; index += 1) {
    codeUnits.writeUInt16BE(model.charCodeAt(index), index * 2);
  }
  return `model-${codeUnits.toString('hex')}`;
}

function assertSafePathSegment(value: string, label: string): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(value) || value.includes('..')) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function ensureContained(child: string, root: string, label: string): void {
  const rel = relative(root, child);
  if (rel === '' || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || rel.includes(':')) {
    throw new Error(`${label} escapes runs root: ${child}`);
  }
}

function ensureSafeExistingDirectory(path: string, label: string): void {
  if (!existsSync(path)) {
    return;
  }
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symlink: ${path}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`${label} is not a directory: ${path}`);
  }
}

function ensureNoSymlinkPathPrefix(target: string, label: string): void {
  const absolute = resolve(target);
  const root = parse(absolute).root;
  const parts = relative(root, absolute).split(sep).filter((part) => part.length > 0);
  let current = root;

  for (const part of parts) {
    current = join(current, part);
    if (!existsSync(current)) {
      return;
    }
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`${label} path component must not be a symlink: ${current}`);
    }
  }
}

function ensureNoSymlinkPathComponents(root: string, target: string, label: string): void {
  const rel = relative(root, target);
  const parts = rel.split(sep).filter((part) => part.length > 0);
  let current = root;

  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index]!);
    if (!existsSync(current)) {
      return;
    }
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(`${label} path component must not be a symlink: ${current}`);
    }
    if (index < parts.length - 1 && !stat.isDirectory()) {
      throw new Error(`${label} path component is not a directory: ${current}`);
    }
  }
}

function assertNoSymlinksInTree(root: string): void {
  const stat = lstatSync(root);
  if (stat.isSymbolicLink()) {
    throw new Error(`Fixture contains symlink: ${root}`);
  }
  if (!stat.isDirectory()) {
    return;
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = join(root, entry.name);
    const entryStat = lstatSync(entryPath);
    if (entryStat.isSymbolicLink()) {
      throw new Error(`Fixture contains symlink: ${entryPath}`);
    }
    if (entryStat.isDirectory()) {
      assertNoSymlinksInTree(entryPath);
    }
  }
}
