import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  cpSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, parse, relative, resolve, sep } from 'node:path';
import { serializeToolCallEvidence } from '../evidence/tool-call-evidence.js';
import type { BenchmarkMatrixRow, BenchmarkTask } from '../types.js';
import { LIVE_BENCH_TOOL_CALL_EVIDENCE_ARTIFACT } from '../types.js';
import { assertSafeBenchmarkTaskPaths } from './artifact-path.js';
import type { FixtureStore } from './fixture-store.js';
import { isoNow } from '@franken/types';

export interface WorkspaceProvisionerConfig {
  readonly fixtures: FixtureStore;
  readonly runsRoot: string;
}

export interface ProvisionedWorkspace {
  readonly runDir: string;
  readonly workspaceDir: string;
  readonly evidenceDir: string;
  readonly environmentPath: string;
  readonly toolCallEvidencePath: string;
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

interface FileIdentity {
  readonly dev: number;
  readonly ino: number;
}

export class WorkspaceProvisioner {
  private readonly fixtures: FixtureStore;
  private readonly runsRoot: string;
  private readonly runsRootIdentity: FileIdentity;

  constructor(config: WorkspaceProvisionerConfig) {
    this.fixtures = config.fixtures;
    this.runsRoot = resolve(config.runsRoot);
    ensureNoSymlinkPathPrefix(this.runsRoot, 'runs root');
    ensureSafeExistingDirectory(this.runsRoot, 'runs root');
    mkdirSync(this.runsRoot, { recursive: true });
    this.runsRootIdentity = fileIdentity(lstatSync(realpathSync(this.runsRoot)));
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
    assertSafeBenchmarkTaskPaths(task);

    const fixtureDir = this.fixtures.resolveFixture(task.projectFixture);
    const runDate = dateSegment(row.runTimestamp);
    const dateDir = resolve(this.runsRoot, runDate);
    ensureContained(dateDir, this.runsRoot, 'run date directory');

    const runDir = resolve(dateDir, row.runId, row.taskId, row.client, row.mode, row.fbeastTopology, modelSegment);
    const workspaceDir = join(runDir, 'workspace');
    const evidenceDir = join(runDir, 'evidence');
    const environmentPath = join(runDir, 'environment.json');
    const toolCallEvidencePath = join(evidenceDir, LIVE_BENCH_TOOL_CALL_EVIDENCE_ARTIFACT);

    ensureContained(runDir, dateDir, 'run directory');
    ensureContained(runDir, this.runsRoot, 'run directory');

    const preparedRun = prepareRunDirectorySafely(runDir, this.runsRoot, this.runsRootIdentity);
    try {
      preparedRun.verifyLocation();
      const anchoredWorkspaceDir = join(preparedRun.anchoredRunDir, 'workspace');
      const anchoredEvidenceDir = join(preparedRun.anchoredRunDir, 'evidence');
      mkdirSync(anchoredWorkspaceDir, { mode: 0o700 });
      mkdirSync(anchoredEvidenceDir, { mode: 0o700 });

      assertNoSymlinksInTree(fixtureDir);
      cpSync(fixtureDir, anchoredWorkspaceDir, { recursive: true });
      if (row.mode === 'baseline') {
        rmSync(join(anchoredWorkspaceDir, '.fbeast'), { recursive: true, force: true });
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
        provisionedAt: isoNow(),
      };
      writeFileSync(join(preparedRun.anchoredRunDir, 'environment.json'), `${JSON.stringify(environment, null, 2)}\n`, 'utf8');
      writeFileSync(
        join(anchoredEvidenceDir, LIVE_BENCH_TOOL_CALL_EVIDENCE_ARTIFACT),
        serializeToolCallEvidence([]),
        'utf8',
      );
      preparedRun.verifyLocation();
    } finally {
      preparedRun.close();
    }

    return { runDir, workspaceDir, evidenceDir, environmentPath, toolCallEvidencePath };
  }
}

interface PreparedRunDirectory {
  readonly anchoredRunDir: string;
  verifyLocation(): void;
  close(): void;
}

/**
 * Walks the run path through no-follow directory descriptors, quarantines any
 * previous leaf, and returns an fd-relative path that stays anchored while the
 * workspace is populated.
 */
export function prepareRunDirectorySafely(
  runDir: string,
  runsRoot: string,
  expectedRunsRootIdentity = fileIdentity(lstatSync(realpathSync(runsRoot))),
): PreparedRunDirectory {
  ensureContained(runDir, runsRoot, 'run directory');
  if (process.platform !== 'linux') {
    throw new Error('Secure live-bench workspace provisioning requires Linux fd-relative paths');
  }
  const rel = relative(runsRoot, runDir);
  const segments = rel.split(sep).filter((segment) => segment.length > 0);
  const leaf = segments.pop();
  if (!leaf) {
    throw new Error(`Invalid run directory: ${runDir}`);
  }

  const directoryFlags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
  const rootFd = openSync(runsRoot, directoryFlags);
  let parentFd = rootFd;
  let runFd: number | undefined;
  const componentIdentities: FileIdentity[] = [];

  try {
    if (!sameFileIdentity(fileIdentity(fstatSync(rootFd)), expectedRunsRootIdentity)) {
      throw new Error(`Runs root identity changed during cleanup: ${runsRoot}`);
    }

    for (const [index, segment] of segments.entries()) {
      const child = join(fdPath(parentFd), segment);
      mkdirExclusiveOrVerifyDirectory(
        child,
        directoryFlags,
        index === 0 ? 'run date directory' : 'run directory path component',
      );
      const childFd = openSync(child, directoryFlags);
      componentIdentities.push(fileIdentity(fstatSync(childFd)));
      if (parentFd !== rootFd) {
        closeSync(parentFd);
      }
      parentFd = childFd;
    }

    const anchoredRunPath = join(fdPath(parentFd), leaf);
    removeAnchoredRunDirectory(anchoredRunPath, fdPath(parentFd), runDir, directoryFlags);
    mkdirSync(anchoredRunPath, { mode: 0o700 });
    runFd = openSync(anchoredRunPath, directoryFlags);
    componentIdentities.push(fileIdentity(fstatSync(runFd)));
    const anchoredRunDir = fdPath(runFd);

    let closed = false;
    return {
      anchoredRunDir,
      verifyLocation: () => verifyVisibleRunLocation(
        runsRoot,
        rootFd,
        [...segments, leaf],
        componentIdentities,
        directoryFlags,
        runDir,
      ),
      close: () => {
        if (closed) {
          return;
        }
        closed = true;
        closeSync(runFd!);
        if (parentFd !== rootFd) {
          closeSync(parentFd);
        }
        closeSync(rootFd);
      },
    };
  } catch (error) {
    if (runFd !== undefined) {
      closeSync(runFd);
    }
    if (parentFd !== rootFd) {
      closeSync(parentFd);
    }
    closeSync(rootFd);
    throw error;
  }
}

function verifyVisibleRunLocation(
  runsRoot: string,
  rootFd: number,
  segments: readonly string[],
  expectedIdentities: readonly FileIdentity[],
  directoryFlags: number,
  displayRunDir: string,
): void {
  let visibleRootFd: number | undefined;
  let currentFd = rootFd;
  try {
    visibleRootFd = openSync(runsRoot, directoryFlags);
    if (!sameFileIdentity(fileIdentity(fstatSync(visibleRootFd)), fileIdentity(fstatSync(rootFd)))) {
      throw new Error(`Runs root moved or changed during provisioning: ${runsRoot}`);
    }
    closeSync(visibleRootFd);
    visibleRootFd = undefined;

    for (const [index, segment] of segments.entries()) {
      const childFd = openSync(join(fdPath(currentFd), segment), directoryFlags);
      if (currentFd !== rootFd) {
        closeSync(currentFd);
      }
      currentFd = childFd;
      if (!sameFileIdentity(fileIdentity(fstatSync(childFd)), expectedIdentities[index]!)) {
        throw new Error(`Run directory moved or changed during provisioning: ${displayRunDir}`);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Run directory moved during provisioning: ${displayRunDir}`);
    }
    throw error;
  } finally {
    if (visibleRootFd !== undefined) {
      closeSync(visibleRootFd);
    }
    if (currentFd !== rootFd) {
      closeSync(currentFd);
    }
  }
}

function removeAnchoredRunDirectory(
  anchoredRunPath: string,
  anchoredParent: string,
  displayRunDir: string,
  directoryFlags: number,
): void {
  if (!pathExistsNoFollow(anchoredRunPath)) {
    return;
  }

  const initialStat = lstatSync(anchoredRunPath);
  if (initialStat.isSymbolicLink()) {
    unlinkSync(anchoredRunPath);
    throw new Error(`Run directory changed to a symlink during cleanup: ${displayRunDir}`);
  }
  if (!initialStat.isDirectory()) {
    throw new Error(`Run directory changed to a non-directory during cleanup: ${displayRunDir}`);
  }

  const cleanupRoot = mkdtempSync(join(anchoredParent, '.cleanup-'));
  const cleanupFd = openSync(cleanupRoot, directoryFlags);
  const quarantinedRunDir = join(fdPath(cleanupFd), 'run');
  let removeCleanupRoot = true;

  try {
    renameSync(anchoredRunPath, quarantinedRunDir);
    const quarantinedStat = lstatSync(quarantinedRunDir);
    if (!sameFileIdentity(fileIdentity(quarantinedStat), fileIdentity(initialStat))) {
      removeCleanupRoot = false;
      throw new Error(`Run directory identity changed during cleanup: ${displayRunDir}`);
    }
    if (!quarantinedStat.isDirectory() || quarantinedStat.isSymbolicLink()) {
      throw new Error(`Run directory type changed during cleanup: ${displayRunDir}`);
    }
    rmSync(quarantinedRunDir, { recursive: true, force: false });
  } catch (error) {
    if (pathExistsNoFollow(quarantinedRunDir)) {
      const quarantinedStat = lstatSync(quarantinedRunDir);
      if (quarantinedStat.isSymbolicLink() || !quarantinedStat.isDirectory()) {
        unlinkSync(quarantinedRunDir);
      } else {
        removeCleanupRoot = false;
      }
    }
    throw error;
  } finally {
    closeSync(cleanupFd);
    if (removeCleanupRoot) {
      rmdirSync(cleanupRoot);
    }
  }
}

function fileIdentity(stat: { dev: number; ino: number }): FileIdentity {
  return { dev: stat.dev, ino: stat.ino };
}

function sameFileIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function mkdirExclusiveOrVerifyDirectory(path: string, directoryFlags: number, label: string): void {
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      throw new Error(`${label} must not be a symlink: ${path}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`${label} is not a directory: ${path}`);
    }
    const fd = openSync(path, directoryFlags);
    closeSync(fd);
  }
}

function fdPath(fd: number): string {
  for (const root of ['/proc/self/fd', '/dev/fd']) {
    const candidate = join(root, String(fd));
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('Secure fd-relative live-bench workspace provisioning is unsupported on this platform');
}

const RUN_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(Z|[+-]\d{2}:\d{2})$/;
// Live-bench run directories and retention reports support this inclusive operational window.
const MIN_RUN_TIMESTAMP_YEAR = 2000;
const MAX_RUN_TIMESTAMP_YEAR = 2100;

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
    year < MIN_RUN_TIMESTAMP_YEAR
    || year > MAX_RUN_TIMESTAMP_YEAR
    || month < 1
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
  const normalizedYear = parsed.getUTCFullYear();
  if (normalizedYear < MIN_RUN_TIMESTAMP_YEAR || normalizedYear > MAX_RUN_TIMESTAMP_YEAR) {
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

const MAX_MODEL_PATH_SEGMENT_BYTES = 255;

function modelPathSegment(model: string): string {
  const codeUnits = Buffer.alloc(model.length * 2);
  for (let index = 0; index < model.length; index += 1) {
    codeUnits.writeUInt16BE(model.charCodeAt(index), index * 2);
  }
  const encoded = `model-${codeUnits.toString('hex')}`;
  if (Buffer.byteLength(encoded) <= MAX_MODEL_PATH_SEGMENT_BYTES) {
    return encoded;
  }
  return `model-sha256-${createHash('sha256').update(codeUnits).digest('hex')}`;
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

function pathExistsNoFollow(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function ensureSafeExistingDirectory(path: string, label: string): void {
  if (!pathExistsNoFollow(path)) {
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
    if (!pathExistsNoFollow(current)) {
      return;
    }
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`${label} path component must not be a symlink: ${current}`);
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
