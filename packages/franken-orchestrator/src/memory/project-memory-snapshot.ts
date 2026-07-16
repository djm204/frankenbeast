export type ProjectMemorySensitivity = 'public' | 'internal' | 'sensitive' | 'secret';

export interface ProjectMemorySnapshotProvenance {
  readonly source: string;
  readonly observedAt: string;
  readonly evidenceId?: string | undefined;
}

export interface ProjectMemoryRecord {
  readonly id: string;
  readonly text: string;
  readonly projects?: readonly string[] | undefined;
  readonly repos?: readonly string[] | undefined;
  readonly taskTypes?: readonly string[] | undefined;
  readonly roles?: readonly string[] | undefined;
  readonly confidence?: number | undefined;
  readonly sensitivity?: ProjectMemorySensitivity | undefined;
  readonly provenance: ProjectMemorySnapshotProvenance;
}

export interface ProjectMemorySnapshotSelector {
  readonly projectId: string;
  readonly repo?: string | undefined;
  readonly taskType?: string | undefined;
  readonly role?: string | undefined;
  readonly minConfidence?: number | undefined;
  readonly allowedSensitivity?: readonly ProjectMemorySensitivity[] | undefined;
}

export interface BuildProjectMemorySnapshotInput {
  readonly selector: ProjectMemorySnapshotSelector;
  readonly memories: readonly ProjectMemoryRecord[];
  readonly now?: string | Date | undefined;
  readonly maxEntries?: number | undefined;
}

export interface ProjectMemorySnapshotEntry {
  readonly id: string;
  readonly text: string;
  readonly confidence: number;
  readonly sensitivity: ProjectMemorySensitivity;
  readonly provenance: ProjectMemorySnapshotEntryProvenance;
}

export interface ProjectMemorySnapshotEntryProvenance extends ProjectMemorySnapshotProvenance {
  readonly ageDays: number;
}

export interface ProjectMemorySnapshot {
  readonly projectId: string;
  readonly generatedAt: string;
  readonly selector: ProjectMemorySnapshotSelector;
  readonly entries: readonly ProjectMemorySnapshotEntry[];
  readonly excludedCount: number;
  readonly text: string;
}

const DEFAULT_ALLOWED_SENSITIVITY: readonly ProjectMemorySensitivity[] = ['public', 'internal'];
const DEFAULT_MIN_CONFIDENCE = 0;
const DEFAULT_MAX_ENTRIES = 20;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function buildProjectMemorySnapshot(input: BuildProjectMemorySnapshotInput): ProjectMemorySnapshot {
  const generatedAt = normalizeDate(input.now ?? new Date(), 'now').toISOString();
  const nowMs = Date.parse(generatedAt);
  const maxEntries = normalizePositiveInteger(input.maxEntries ?? DEFAULT_MAX_ENTRIES, 'maxEntries');
  const allowedSensitivity = new Set(input.selector.allowedSensitivity ?? DEFAULT_ALLOWED_SENSITIVITY);
  const minConfidence = normalizeConfidence(input.selector.minConfidence ?? DEFAULT_MIN_CONFIDENCE, 'minConfidence');

  const matchingEntries = input.memories
    .filter((memory) => matchesSelector(memory, input.selector, minConfidence, allowedSensitivity))
    .map((memory) => toSnapshotEntry(memory, nowMs))
    .sort(compareSnapshotEntries)
    .slice(0, maxEntries);

  const eligibleCount = input.memories.filter((memory) => matchesSelector(memory, input.selector, minConfidence, allowedSensitivity)).length;
  const excludedCount = input.memories.length - matchingEntries.length;
  const snapshot: Omit<ProjectMemorySnapshot, 'text'> = {
    projectId: input.selector.projectId,
    generatedAt,
    selector: input.selector,
    entries: matchingEntries,
    excludedCount,
  };

  return {
    ...snapshot,
    excludedCount: input.memories.length - Math.min(eligibleCount, maxEntries),
    text: renderProjectMemorySnapshotText(snapshot),
  };
}

function matchesSelector(
  memory: ProjectMemoryRecord,
  selector: ProjectMemorySnapshotSelector,
  minConfidence: number,
  allowedSensitivity: ReadonlySet<ProjectMemorySensitivity>,
): boolean {
  if (!matchesRequiredScope(memory.projects, selector.projectId)) return false;
  if (!matchesOptionalScope(memory.repos, selector.repo)) return false;
  if (!matchesOptionalScope(memory.taskTypes, selector.taskType)) return false;
  if (!matchesOptionalScope(memory.roles, selector.role)) return false;

  const sensitivity = memory.sensitivity;
  if (sensitivity === undefined) return false;
  if (!allowedSensitivity.has(sensitivity)) return false;

  const confidence = normalizeConfidence(memory.confidence ?? 1, `confidence for memory ${memory.id}`);
  if (confidence < minConfidence) return false;

  return true;
}

function matchesOptionalScope(values: readonly string[] | undefined, selectorValue: string | undefined): boolean {
  if (values === undefined || values.length === 0 || selectorValue === undefined) return true;
  return values.includes(selectorValue);
}

function matchesRequiredScope(values: readonly string[] | undefined, selectorValue: string): boolean {
  return values !== undefined && values.includes(selectorValue);
}

function toSnapshotEntry(memory: ProjectMemoryRecord, nowMs: number): ProjectMemorySnapshotEntry {
  const observedAt = normalizeDate(memory.provenance.observedAt, `observedAt for memory ${memory.id}`).toISOString();
  const observedMs = Date.parse(observedAt);
  return {
    id: memory.id,
    text: memory.text,
    confidence: normalizeConfidence(memory.confidence ?? 1, `confidence for memory ${memory.id}`),
    sensitivity: memory.sensitivity ?? 'sensitive',
    provenance: {
      ...memory.provenance,
      observedAt,
      ageDays: Math.max(0, Math.floor((nowMs - observedMs) / MS_PER_DAY)),
    },
  };
}

function compareSnapshotEntries(left: ProjectMemorySnapshotEntry, right: ProjectMemorySnapshotEntry): number {
  return right.confidence - left.confidence || left.provenance.ageDays - right.provenance.ageDays || left.id.localeCompare(right.id);
}

function renderProjectMemorySnapshotText(snapshot: Omit<ProjectMemorySnapshot, 'text'>): string {
  const selector = snapshot.selector;
  const scope = [
    selector.repo === undefined ? undefined : `repo=${selector.repo}`,
    selector.taskType === undefined ? undefined : `taskType=${selector.taskType}`,
    selector.role === undefined ? undefined : `role=${selector.role}`,
  ].filter((part): part is string => part !== undefined).join(' ');

  const lines = [
    `Project memory snapshot: ${snapshot.projectId}`,
    scope.length > 0 ? scope : 'scope=project',
    `generatedAt=${snapshot.generatedAt} entries=${snapshot.entries.length} excluded=${snapshot.excludedCount}`,
  ];

  for (const entry of snapshot.entries) {
    const provenance = [
      `source=${quoteSnapshotMetadata(entry.provenance.source)}`,
      entry.provenance.evidenceId === undefined ? undefined : `evidence=${quoteSnapshotMetadata(entry.provenance.evidenceId)}`,
      `age=${entry.provenance.ageDays}d`,
      `confidence=${entry.confidence.toFixed(2)}`,
      `sensitivity=${entry.sensitivity}`,
    ].filter((part): part is string => part !== undefined).join('; ');
    lines.push(`- ${quoteSnapshotMemoryText(entry.text)} [${provenance}]`);
  }

  return lines.join('\n');
}

function quoteSnapshotMemoryText(text: string): string {
  return JSON.stringify(text);
}

function quoteSnapshotMetadata(text: string): string {
  return JSON.stringify(text);
}

function normalizeDate(value: string | Date, fieldName: string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Project memory snapshot ${fieldName} must be a valid date or ISO timestamp`);
  }
  return date;
}

function normalizeConfidence(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Project memory snapshot ${fieldName} must be a finite number between 0 and 1`);
  }
  return value;
}

function normalizePositiveInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Project memory snapshot ${fieldName} must be a positive integer`);
  }
  return value;
}
