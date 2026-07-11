import type { BrainSnapshot } from '@franken/types';

export type PmHandoffRubricCriterionId =
  | 'issue-and-outcome'
  | 'scope-control'
  | 'verification-evidence'
  | 'blocker-disclosure'
  | 'operator-continuity';

export interface PmHandoffRubricCriterion {
  readonly id: PmHandoffRubricCriterionId;
  readonly label: string;
  readonly guidance: string;
}

export interface PmHandoffSummary {
  readonly issueNumber?: number;
  readonly branch?: string;
  readonly prUrl?: string | null;
  readonly changedFiles?: readonly string[];
  readonly verificationCommands?: readonly string[];
  readonly blockers?: readonly string[];
  readonly scopeNotes?: readonly string[];
  readonly nextSteps?: readonly string[];
  readonly diskFree?: string;
}

export interface PmHandoffQualityCriterionResult extends PmHandoffRubricCriterion {
  readonly passed: boolean;
}

export interface PmHandoffQualityReport {
  readonly score: number;
  readonly passed: boolean;
  readonly criteria: readonly PmHandoffQualityCriterionResult[];
  readonly failedCriteria: readonly PmHandoffRubricCriterionId[];
}

export const PM_HANDOFF_QUALITY_RUBRIC: readonly PmHandoffRubricCriterion[] = [
  {
    id: 'issue-and-outcome',
    label: 'Issue and outcome are explicit',
    guidance: 'Name the issue number and the shipped or intentionally-not-shipped outcome.',
  },
  {
    id: 'scope-control',
    label: 'Scope is bounded',
    guidance: 'List changed files or scope notes so PM can distinguish intended work from drift.',
  },
  {
    id: 'verification-evidence',
    label: 'Verification evidence is concrete',
    guidance: 'Include exact commands or deterministic verifier output, not just “tested”.',
  },
  {
    id: 'blocker-disclosure',
    label: 'Blockers are disclosed',
    guidance: 'State blockers explicitly; use an empty blockers list only when there were none.',
  },
  {
    id: 'operator-continuity',
    label: 'Operator continuity is preserved',
    guidance: 'Include PR URL, next steps, or handoff notes plus disk/resource status when relevant.',
  },
];

export function formatPmHandoffQualityRubric(): string {
  return [
    'PM handoff quality rubric:',
    ...PM_HANDOFF_QUALITY_RUBRIC.map(
      (criterion) => `  - ${criterion.id}: ${criterion.guidance}`,
    ),
  ].join('\n');
}

export function scorePmHandoffQuality(summary: PmHandoffSummary): PmHandoffQualityReport {
  const criteria: readonly PmHandoffQualityCriterionResult[] = PM_HANDOFF_QUALITY_RUBRIC.map(
    (criterion) => ({
      ...criterion,
      passed: evaluatePmHandoffCriterion(criterion.id, summary),
    }),
  );
  const failedCriteria = criteria
    .filter((criterion) => !criterion.passed)
    .map((criterion) => criterion.id);

  return {
    score: criteria.filter((criterion) => criterion.passed).length / criteria.length,
    passed: failedCriteria.length === 0,
    criteria,
    failedCriteria,
  };
}

function evaluatePmHandoffCriterion(
  criterionId: PmHandoffRubricCriterionId,
  summary: PmHandoffSummary,
): boolean {
  switch (criterionId) {
    case 'issue-and-outcome':
      return isPositiveInteger(summary.issueNumber) && hasAnyText(summary.scopeNotes);
    case 'scope-control':
      return hasText(summary.branch) && (hasAnyText(summary.changedFiles) || hasAnyText(summary.scopeNotes));
    case 'verification-evidence':
      return hasAnyText(summary.verificationCommands);
    case 'blocker-disclosure':
      return Array.isArray(summary.blockers);
    case 'operator-continuity':
      return hasText(summary.prUrl ?? undefined) || hasAnyText(summary.nextSteps) || hasText(summary.diskFree);
  }

  const exhaustive: never = criterionId;
  return exhaustive;
}

function isPositiveInteger(value: number | undefined): value is number {
  if (typeof value !== 'number') {
    return false;
  }
  return Number.isInteger(value) && value > 0;
}

function hasText(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasAnyText(values: readonly string[] | undefined): boolean {
  return Array.isArray(values) && values.some((value) => hasText(value));
}

/** Rough char-to-token ratio (1 token ≈ 4 chars) */
const CHARS_PER_TOKEN = 4;

/**
 * Truncate a BrainSnapshot to fit within a token budget.
 * Removes episodic events (oldest first) and working memory entries
 * (largest values first) until the rendered size fits.
 * Returns a new snapshot — does not mutate the original.
 */
export function truncateSnapshot(
  snapshot: BrainSnapshot,
  maxTokens: number,
): BrainSnapshot {
  const maxChars = maxTokens * CHARS_PER_TOKEN;

  // Start with full snapshot, progressively trim
  let trimmed: BrainSnapshot = {
    ...snapshot,
    episodic: [...snapshot.episodic],
    working: { ...snapshot.working },
  };

  // Phase 1: trim episodic events (oldest first, keep most recent)
  while (
    trimmed.episodic.length > 0 &&
    estimateChars(trimmed) > maxChars
  ) {
    trimmed = {
      ...trimmed,
      episodic: trimmed.episodic.slice(1),
    };
  }

  // Phase 2: trim working memory (largest values first)
  if (estimateChars(trimmed) > maxChars) {
    const entries = Object.entries(trimmed.working as Record<string, unknown>);
    entries.sort(
      (a, b) =>
        JSON.stringify(b[1]).length - JSON.stringify(a[1]).length,
    );
    const working = { ...trimmed.working } as Record<string, unknown>;
    for (const [key] of entries) {
      if (estimateChars({ ...trimmed, working }) <= maxChars) break;
      delete working[key];
    }
    trimmed = { ...trimmed, working };
  }

  return trimmed;
}

function estimateChars(snapshot: BrainSnapshot): number {
  return formatHandoff(snapshot).length;
}

/**
 * Format a BrainSnapshot as human-readable text for provider handoff.
 * Shared across all adapters — each injects this via their own mechanism
 * (CLI flag, system prompt, GEMINI.md, etc.).
 */
export function formatHandoff(snapshot: BrainSnapshot): string {
  const recentEvents = snapshot.episodic
    .slice(-10)
    .map((event: BrainSnapshot['episodic'][number]) => `  [${event.type}] ${event.summary}`);
  const lines = [
    '--- BRAIN STATE HANDOFF ---',
    `Previous provider: ${snapshot.metadata.lastProvider}`,
    `Switch reason: ${snapshot.metadata.switchReason}`,
    `Tokens used so far: ${snapshot.metadata.totalTokensUsed}`,
    '',
    'Working memory:',
    JSON.stringify(snapshot.working, null, 2),
    '',
    `Recent events (${snapshot.episodic.length}):`,
    ...recentEvents,
    '',
    formatPmHandoffQualityRubric(),
  ];

  if (snapshot.checkpoint) {
    lines.push(
      '',
      `Last checkpoint: phase=${snapshot.checkpoint.phase}, step=${snapshot.checkpoint.step}`,
    );
  }

  lines.push('--- END HANDOFF ---');
  return lines.join('\n');
}
