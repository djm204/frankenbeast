import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { BenchmarkTaskSchema } from './schema.js';
import type { BenchmarkTask, CorpusTier } from '../types.js';

export interface QuarantinedCorpusTask {
  path: string;
  tier: 'candidate';
  error: string;
}

export interface CorpusLoadDiagnostics {
  tasks: BenchmarkTask[];
  quarantined: QuarantinedCorpusTask[];
}

export interface CorpusLoadOptions {
  maxDepth?: number;
  maxFiles?: number;
}

const DEFAULT_MAX_CORPUS_DEPTH = 32;
const DEFAULT_MAX_CORPUS_FILES = 10_000;

interface CorpusTraversalState {
  fileCount: number;
  maxDepth: number;
  maxFiles: number;
}

export function loadTaskFile(path: string): BenchmarkTask {
  try {
    const parsed = readTaskJson(path);
    return BenchmarkTaskSchema.parse(parsed) as BenchmarkTask;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid benchmark task ${path}: ${detail}`);
  }
}

export function loadCorpus(
  root: string,
  tiers?: readonly CorpusTier[],
  options: CorpusLoadOptions = {},
): BenchmarkTask[] {
  const allowed = tiers ? new Set<CorpusTier>(tiers) : undefined;
  const tasks = taskFiles(root, options)
    .filter((path) => !allowed || allowed.has(readValidatedTaskTier(path)))
    .map((path) => loadTaskFile(path))
    .filter((task) => !allowed || allowed.has(task.tier));

  assertUniqueTaskIds(tasks);
  return tasks.sort((a, b) => a.taskId.localeCompare(b.taskId));
}

export function loadCorpusWithDiagnostics(
  root: string,
  tiers?: readonly CorpusTier[],
  options: CorpusLoadOptions = {},
): CorpusLoadDiagnostics {
  const allowed = tiers ? new Set<CorpusTier>(tiers) : undefined;
  const tasks: BenchmarkTask[] = [];
  const quarantined: QuarantinedCorpusTask[] = [];

  for (const path of taskFiles(root, options).sort((a, b) => a.localeCompare(b))) {
    let parsed: unknown;
    try {
      parsed = readTaskJson(path);
    } catch (error) {
      if (isCandidatePath(root, path)) {
        quarantined.push(candidateQuarantine(path, error));
        continue;
      }
      throw invalidTaskError(path, error);
    }

    let tier: CorpusTier;
    try {
      tier = validatedTaskTier(parsed);
    } catch (error) {
      if (isCandidatePath(root, path)) {
        quarantined.push(candidateQuarantine(path, error));
        continue;
      }
      throw invalidTaskError(path, error);
    }
    if (allowed && !allowed.has(tier)) {
      continue;
    }

    try {
      tasks.push(BenchmarkTaskSchema.parse(parsed) as BenchmarkTask);
    } catch (error) {
      if (tier === 'candidate') {
        quarantined.push(candidateQuarantine(path, error));
        continue;
      }
      throw invalidTaskError(path, error);
    }
  }

  assertUniqueTaskIds(tasks);
  return {
    tasks: tasks.sort((a, b) => a.taskId.localeCompare(b.taskId)),
    quarantined,
  };
}

function assertUniqueTaskIds(tasks: readonly BenchmarkTask[]): void {
  const seen = new Set<string>();
  for (const task of tasks) {
    if (seen.has(task.taskId)) {
      throw new Error(`Duplicate benchmark task id: ${task.taskId}`);
    }
    seen.add(task.taskId);
  }
}

function readTaskJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function readValidatedTaskTier(path: string): CorpusTier {
  try {
    return validatedTaskTier(readTaskJson(path));
  } catch (error) {
    throw invalidTaskError(path, error);
  }
}

function validatedTaskTier(parsed: unknown): CorpusTier {
  const tier = (parsed as { tier?: unknown }).tier;
  if (tier === 'core' || tier === 'candidate' || tier === 'stress') {
    return tier;
  }
  throw new Error(`Invalid benchmark task tier: ${String(tier)}`);
}

function isCandidatePath(root: string, path: string): boolean {
  return relative(root, path).split(sep)[0] === 'candidate';
}

function candidateQuarantine(path: string, error: unknown): QuarantinedCorpusTask {
  return {
    path,
    tier: 'candidate',
    error: invalidTaskError(path, error).message,
  };
}

function invalidTaskError(path: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`Invalid benchmark task ${path}: ${detail}`);
}

function taskFiles(
  dir: string,
  options: CorpusLoadOptions,
  depth = 0,
  existingState?: CorpusTraversalState,
): string[] {
  const state = existingState ?? {
    fileCount: 0,
    maxDepth: corpusLoadLimit('maxDepth', options.maxDepth, DEFAULT_MAX_CORPUS_DEPTH),
    maxFiles: corpusLoadLimit('maxFiles', options.maxFiles, DEFAULT_MAX_CORPUS_FILES),
  };
  if (depth > state.maxDepth) {
    throw new Error(`Corpus directory depth limit of ${state.maxDepth} exceeded at ${dir}`);
  }

  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...taskFiles(path, options, depth + 1, state));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    state.fileCount += 1;
    if (state.fileCount > state.maxFiles) {
      throw new Error(`Corpus file count limit of ${state.maxFiles} exceeded at ${path}`);
    }
    if (entry.name.endsWith('.task.json') && statSync(path).isFile()) {
      out.push(path);
    }
  }
  return out;
}

function corpusLoadLimit(name: keyof CorpusLoadOptions, value: number | undefined, fallback: number): number {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new Error(`Corpus load option ${name} must be a non-negative safe integer`);
  }
  return limit;
}
