import { readFile } from 'node:fs/promises';
import { BrainSnapshotSchema, type BrainSnapshot, type EpisodicEvent } from '@franken/types';

export interface SnapshotDiff<T = unknown> {
  readonly added: Record<string, T>;
  readonly removed: Record<string, T>;
  readonly changed: Record<string, { before: T; after: T }>;
  readonly unchanged: string[];
}

export interface MemorySnapshotDiffReport {
  readonly ok: true;
  readonly command: 'memory snapshot-diff';
  readonly before: { readonly path: string; readonly timestamp: string };
  readonly after: { readonly path: string; readonly timestamp: string };
  readonly summary: {
    readonly workingAdded: number;
    readonly workingRemoved: number;
    readonly workingChanged: number;
    readonly episodicAdded: number;
    readonly episodicRemoved: number;
    readonly episodicChanged: number;
    readonly checkpointChanged: boolean;
    readonly metadataChanged: boolean;
  };
  readonly diff: {
    readonly working: SnapshotDiff;
    readonly episodic: SnapshotDiff<EpisodicEvent>;
    readonly checkpoint: { readonly changed: boolean; readonly before: BrainSnapshot['checkpoint']; readonly after: BrainSnapshot['checkpoint'] };
    readonly metadata: SnapshotDiff;
  };
}

export interface MemoryCommandDeps {
  readonly action: 'snapshot-diff' | undefined;
  readonly beforePath?: string | undefined;
  readonly afterPath?: string | undefined;
  readonly print: (message: string) => void;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJsonValue(nested)]),
    );
  }
  return value;
}

function diffRecords<T>(before: Record<string, T>, after: Record<string, T>): SnapshotDiff<T> {
  const added: Record<string, T> = {};
  const removed: Record<string, T> = {};
  const changed: Record<string, { before: T; after: T }> = {};
  const unchanged: string[] = [];
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();

  for (const key of keys) {
    const hasBefore = Object.prototype.hasOwnProperty.call(before, key);
    const hasAfter = Object.prototype.hasOwnProperty.call(after, key);
    if (!hasBefore && hasAfter) {
      added[key] = after[key] as T;
      continue;
    }
    if (hasBefore && !hasAfter) {
      removed[key] = before[key] as T;
      continue;
    }
    const beforeValue = before[key] as T;
    const afterValue = after[key] as T;
    if (stableStringify(beforeValue) === stableStringify(afterValue)) {
      unchanged.push(key);
      continue;
    }
    changed[key] = { before: beforeValue, after: afterValue };
  }

  return { added, removed, changed, unchanged };
}

function eventDiffKey(event: EpisodicEvent, index: number): string {
  if (event.id !== undefined) {
    return `id:${event.id}`;
  }
  return `event:${event.createdAt}:${event.type}:${event.step ?? ''}:${event.summary}:${index}`;
}

function indexEvents(events: EpisodicEvent[]): Record<string, EpisodicEvent> {
  return Object.fromEntries(events.map((event, index) => [eventDiffKey(event, index), event]));
}

export function diffMemorySnapshots(
  beforePath: string,
  before: BrainSnapshot,
  afterPath: string,
  after: BrainSnapshot,
): MemorySnapshotDiffReport {
  const working = diffRecords(before.working, after.working);
  const episodic = diffRecords(indexEvents(before.episodic), indexEvents(after.episodic));
  const checkpointChanged = stableStringify(before.checkpoint) !== stableStringify(after.checkpoint);
  const metadata = diffRecords(before.metadata, after.metadata);

  return {
    ok: true,
    command: 'memory snapshot-diff',
    before: { path: beforePath, timestamp: before.timestamp },
    after: { path: afterPath, timestamp: after.timestamp },
    summary: {
      workingAdded: Object.keys(working.added).length,
      workingRemoved: Object.keys(working.removed).length,
      workingChanged: Object.keys(working.changed).length,
      episodicAdded: Object.keys(episodic.added).length,
      episodicRemoved: Object.keys(episodic.removed).length,
      episodicChanged: Object.keys(episodic.changed).length,
      checkpointChanged,
      metadataChanged: Object.keys(metadata.added).length > 0
        || Object.keys(metadata.removed).length > 0
        || Object.keys(metadata.changed).length > 0,
    },
    diff: {
      working,
      episodic,
      checkpoint: { changed: checkpointChanged, before: before.checkpoint, after: after.checkpoint },
      metadata,
    },
  };
}

async function readSnapshot(path: string): Promise<BrainSnapshot> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read memory snapshot ${path}: ${message}`);
  }

  const result = BrainSnapshotSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid memory snapshot ${path}: ${result.error.issues.map((issue) => issue.path.join('.') + ' ' + issue.message).join('; ')}`);
  }
  return result.data as unknown as BrainSnapshot;
}

export async function handleMemoryCommand(deps: MemoryCommandDeps): Promise<void> {
  const { action, beforePath, afterPath, print } = deps;
  if (action !== 'snapshot-diff') {
    throw new Error('Usage: frankenbeast memory snapshot-diff <before-snapshot.json> <after-snapshot.json>');
  }
  if (!beforePath || !afterPath) {
    throw new Error('memory snapshot-diff requires two BrainSnapshot JSON files: <before> <after>');
  }

  const [before, after] = await Promise.all([
    readSnapshot(beforePath),
    readSnapshot(afterPath),
  ]);
  print(JSON.stringify(diffMemorySnapshots(beforePath, before, afterPath, after), null, 2));
}
