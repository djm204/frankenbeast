import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BrainRegistry } from '@franken/brain';
import type { MemoryCandidate, SqliteBrain } from '@franken/brain';
import Database from 'better-sqlite3';

import type { BrainAction } from './args.js';
import type { BrainRouteContext } from '../http/routes/brain-routes.js';

const MAX_WORKING_MEMORY_KEYS = 100;
const MAX_LESSONS = 10;
const MAX_LESSON_PATTERN_BYTES = 2 * 1024;
const MAX_LESSON_KEY_BYTES = 512;
const LESSON_UNAVAILABLE_REASON = 'Consolidated lessons are not available until the learning faculty is configured';

type BrainRegistryReader = Pick<BrainRegistry, 'getAgentType'>;

export interface BrainInspectionHandle {
  registry: BrainRegistry;
  dispose(): Promise<void>;
}

/** Open a consistent disposable copy so inspection never writes to the source brain. */
export async function createBrainInspectionHandle(
  brainsDir: string,
  agentTypeId: string,
): Promise<BrainInspectionHandle> {
  const snapshotDir = await mkdtemp(join(tmpdir(), 'franken-brain-inspect-'));
  const registry = new BrainRegistry(snapshotDir);
  try {
    // Validate with BrainRegistry's canonical portable-id rules before deriving a path.
    registry.getAgentType(agentTypeId);
    const sourcePath = join(brainsDir, `${agentTypeId}.db`);
    if (!existsSync(sourcePath)) {
      throw new Error(`No persisted brain exists for agent type '${agentTypeId}'`);
    }

    const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
    try {
      await source.backup(join(snapshotDir, `${agentTypeId}.db`));
    } finally {
      source.close();
    }
  } catch (error) {
    registry.close();
    await rm(snapshotDir, { recursive: true, force: true });
    if (error instanceof RangeError) {
      throw new Error('Invalid agent type id: use a non-empty portable path-component identifier');
    }
    throw error;
  }

  return {
    registry,
    dispose: async () => {
      registry.close();
      await rm(snapshotDir, { recursive: true, force: true });
    },
  };
}

export interface BrainCommandDeps {
  action: BrainAction;
  target?: string | undefined;
  json?: boolean | undefined;
  registry: BrainRegistryReader;
  resolveContext?: ((agentTypeId: string) => BrainRouteContext | undefined) | undefined;
  print(message: string): void;
}

function truncateUtf8(value: string, maxBytes: number): { value: string; truncated: boolean } {
  const encoded = Buffer.from(value);
  if (encoded.byteLength <= maxBytes) return { value, truncated: false };
  return { value: encoded.subarray(0, maxBytes).toString('utf8'), truncated: true };
}

function resolveBrain(deps: BrainCommandDeps): {
  agentTypeId: string;
  brain: SqliteBrain;
  context: BrainRouteContext | undefined;
} {
  if (!deps.action || !deps.target) {
    throw new Error('Usage: frankenbeast brain <show|lessons> <agentTypeId> [--json]');
  }

  const agentTypeId = deps.target;
  try {
    const context = deps.resolveContext?.(agentTypeId);
    const brain = deps.registry.getAgentType(agentTypeId, context?.dbPath);
    if (!brain) {
      throw new Error(`No persisted brain exists for agent type '${agentTypeId}'`);
    }
    return { agentTypeId, brain, context };
  } catch (error) {
    if (error instanceof RangeError) {
      throw new Error('Invalid agent type id: use a non-empty portable path-component identifier');
    }
    throw error;
  }
}

function brainSummary(agentTypeId: string, brain: SqliteBrain, context: BrainRouteContext | undefined) {
  const allWorkingKeys = brain.working.persistedKeys();
  const lastCheckpoint = brain.recovery.lastCheckpoint();
  const learningConfigured = context?.faculties?.learning ?? brain.learning.configured;
  return {
    agentTypeId,
    workingMemory: {
      keys: allWorkingKeys.slice(0, MAX_WORKING_MEMORY_KEYS),
      total: allWorkingKeys.length,
      truncated: allWorkingKeys.length > MAX_WORKING_MEMORY_KEYS,
    },
    episodic: { eventCount: brain.episodic.count() },
    recovery: { lastCheckpointAt: lastCheckpoint?.timestamp ?? null },
    faculties: {
      planning: { configured: context?.faculties?.planning ?? brain.planning.configured },
      reasoning: { configured: context?.faculties?.reasoning ?? brain.reasoning.configured },
      action: { configured: context?.faculties?.action ?? brain.action.configured },
      learning: { configured: learningConfigured },
    },
    capabilities: {
      memoryReview: true,
      retentionReporting: true,
      recordLearning: true,
    },
    lessons: { available: learningConfigured, count: null },
  };
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function renderSummary(summary: ReturnType<typeof brainSummary>): string {
  const configuredFaculties = Object.entries(summary.faculties)
    .filter(([, state]) => state.configured)
    .map(([name]) => name);
  const keys = summary.workingMemory.keys.length === 0
    ? 'none'
    : summary.workingMemory.keys.join(', ') + (summary.workingMemory.truncated ? ', …' : '');
  return [
    `Brain: ${summary.agentTypeId}`,
    `Working memory: ${plural(summary.workingMemory.total, 'key')} (${keys})`,
    `Episodic memory: ${plural(summary.episodic.eventCount, 'event')}`,
    `Last checkpoint: ${summary.recovery.lastCheckpointAt ?? 'none'}`,
    `Faculties configured: ${configuredFaculties.join(', ') || 'none'}`,
    `Lessons available: ${summary.lessons.available ? 'yes' : 'no'}`,
  ].join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function lessonProjection(candidate: MemoryCandidate) {
  if (!isRecord(candidate.value) || candidate.value.kind !== 'consolidated-lesson') return undefined;
  const pattern = typeof candidate.value.pattern === 'string'
    ? truncateUtf8(candidate.value.pattern, MAX_LESSON_PATTERN_BYTES)
    : undefined;
  const key = truncateUtf8(candidate.key, MAX_LESSON_KEY_BYTES);
  return {
    key: key.value,
    ...(key.truncated ? { keyTruncated: true as const } : {}),
    status: candidate.status,
    kind: 'consolidated-lesson' as const,
    ...(pattern ? { pattern: pattern.value } : {}),
    ...(pattern?.truncated ? { patternTruncated: true as const } : {}),
    ...(typeof candidate.value.occurrenceCount === 'number'
      ? { occurrenceCount: candidate.value.occurrenceCount }
      : {}),
    ...(typeof candidate.confidence === 'number' ? { confidence: candidate.confidence } : {}),
    ...(typeof candidate.value.firstSeenAt === 'string' ? { firstSeenAt: candidate.value.firstSeenAt } : {}),
    ...(typeof candidate.value.lastSeenAt === 'string' ? { lastSeenAt: candidate.value.lastSeenAt } : {}),
  };
}

function lessonsView(brain: SqliteBrain, context: BrainRouteContext | undefined) {
  const facultyConfigured = context?.faculties?.learning ?? brain.learning.configured;
  if (!facultyConfigured) {
    return {
      data: [],
      meta: {
        available: false,
        facultyConfigured: false,
        limit: MAX_LESSONS,
        truncated: false,
        reason: LESSON_UNAVAILABLE_REASON,
      },
    };
  }

  const candidates = (['pending', 'approved'] as const)
    .flatMap((status) => brain.memoryReview.listByKind(status, 'consolidated-lesson', { limit: MAX_LESSONS + 1 }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const projected = candidates
    .map(lessonProjection)
    .filter((lesson): lesson is NonNullable<ReturnType<typeof lessonProjection>> => lesson !== undefined);
  return {
    data: projected.slice(0, MAX_LESSONS),
    meta: {
      available: true,
      facultyConfigured: true,
      limit: MAX_LESSONS,
      truncated: projected.length > MAX_LESSONS,
    },
  };
}

function renderLessons(agentTypeId: string, view: ReturnType<typeof lessonsView>): string {
  if (!view.meta.available) {
    return `Lessons for ${agentTypeId}: not available\n${view.meta.reason}`;
  }
  if (view.data.length === 0) {
    return `Lessons for ${agentTypeId}: no consolidated lesson candidates found`;
  }
  return [
    `Lessons for ${agentTypeId} (${view.data.length}${view.meta.truncated ? '+' : ''} shown):`,
    ...view.data.map((lesson) => (
      `- [${lesson.status}] ${lesson.pattern ?? lesson.key}`
      + (lesson.occurrenceCount === undefined ? '' : ` (${plural(lesson.occurrenceCount, 'occurrence')})`)
    )),
  ].join('\n');
}

export async function handleBrainCommand(deps: BrainCommandDeps): Promise<void> {
  const { agentTypeId, brain, context } = resolveBrain(deps);
  try {
    if (deps.action === 'show') {
      const summary = brainSummary(agentTypeId, brain, context);
      deps.print(deps.json ? JSON.stringify({ data: summary }, null, 2) : renderSummary(summary));
      return;
    }
    if (deps.action === 'lessons') {
      const view = lessonsView(brain, context);
      deps.print(deps.json ? JSON.stringify(view, null, 2) : renderLessons(agentTypeId, view));
      return;
    }
    throw new Error('Usage: frankenbeast brain <show|lessons> <agentTypeId> [--json]');
  } catch (error) {
    if (error instanceof Error && (
      error.message.startsWith('Usage:')
      || error.message.startsWith('No persisted brain')
      || error.message.startsWith('Invalid agent type id')
    )) {
      throw error;
    }
    throw new Error('Brain state could not be read');
  }
}
