import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BenchmarkTaskSchema } from './schema.js';
import type { BenchmarkTask, CorpusTier } from '../types.js';

export function loadTaskFile(path: string): BenchmarkTask {
  try {
    const parsed = readTaskJson(path);
    return BenchmarkTaskSchema.parse(parsed) as BenchmarkTask;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid benchmark task ${path}: ${detail}`);
  }
}

export function loadCorpus(root: string, tiers?: readonly CorpusTier[]): BenchmarkTask[] {
  const allowed = tiers ? new Set<CorpusTier>(tiers) : undefined;
  return taskFiles(root)
    .filter((path) => !allowed || allowed.has(readValidatedTaskTier(path)))
    .map((path) => loadTaskFile(path))
    .filter((task) => !allowed || allowed.has(task.tier))
    .sort((a, b) => a.taskId.localeCompare(b.taskId));
}

function readTaskJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function readValidatedTaskTier(path: string): CorpusTier {
  try {
    const parsed = readTaskJson(path) as { tier?: unknown };
    const tier = parsed.tier;
    if (tier === 'core' || tier === 'candidate' || tier === 'stress') {
      return tier;
    }
    throw new Error(`Invalid benchmark task tier: ${String(tier)}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid benchmark task ${path}: ${detail}`);
  }
}

function taskFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...taskFiles(path));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.task.json') && statSync(path).isFile()) {
      out.push(path);
    }
  }
  return out;
}
