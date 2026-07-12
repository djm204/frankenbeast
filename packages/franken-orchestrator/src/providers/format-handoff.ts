import type { BrainSnapshot, EpisodicEvent } from '@franken/types';

/** Rough char-to-token ratio (1 token ≈ 4 chars) */
const CHARS_PER_TOKEN = 4;
const MAX_RUBRIC_EVIDENCE_CHARS = 240;

export type PmHandoffRubricStatus = 'pass' | 'needs-attention';

export interface PmHandoffRubricCriterion {
  readonly id: string;
  readonly label: string;
  readonly guidance: string;
  readonly evidencePatterns: readonly RegExp[];
}

export interface PmHandoffRubricResult {
  readonly id: string;
  readonly label: string;
  readonly status: PmHandoffRubricStatus;
  readonly evidence: readonly string[];
  readonly guidance: string;
}

export interface PmHandoffQualityAssessment {
  readonly score: number;
  readonly passed: number;
  readonly total: number;
  readonly results: readonly PmHandoffRubricResult[];
  readonly operatorGuidance: string;
}

interface HandoffEvidenceEntry {
  readonly searchable: string;
  readonly display: string;
}

export const PM_HANDOFF_QUALITY_RUBRIC: readonly PmHandoffRubricCriterion[] = [
  {
    id: 'scope',
    label: 'Scope and objective',
    guidance: 'Name the issue/task, business goal, and out-of-scope boundaries so the next PM does not re-discover intent.',
    evidencePatterns: [/\b(issue|task|goal|objective|scope|out[- ]of[- ]scope)\b/i],
  },
  {
    id: 'state',
    label: 'Current state and decisions',
    guidance: 'Preserve completed work, current phase, and key decisions with enough context for a fresh worker to resume safely.',
    evidencePatterns: [/\b(decision|phase|status|completed|remaining|checkpoint|current state)\b/i],
  },
  {
    id: 'verification',
    label: 'Verification evidence',
    guidance: 'Include deterministic test, lint, build, or verifier commands and their outcome before promotion or retirement.',
    evidencePatterns: [/\b(test|lint|typecheck|build|verified|verification|pass(?:ed)?|fail(?:ed)?|fixture)\b/i],
  },
  {
    id: 'blockers',
    label: 'Blockers and next action',
    guidance: 'Make blockers, owner, and next action explicit instead of leaving the receiving PM to infer what to do.',
    evidencePatterns: [/\b(blocker|blocked|risk|next action|next step|owner|assignee|needs review|follow[- ]?up)\b/i],
  },
  {
    id: 'artifacts',
    label: 'Artifacts and links',
    guidance: 'Point to concrete artifacts such as branch, PR, worktree, diff, docs, or telemetry records that the next PM can inspect.',
    evidencePatterns: [/\b(branch|pr|pull request|worktree|diff|artifact|doc|url|https?:\/\/|telemetry)\b/i],
  },
  {
    id: 'learning',
    label: 'Learning and reuse',
    guidance: 'Capture reusable lessons, retrospective notes, Codex/CI feedback, or promotion/retirement rationale without one-off noise.',
    evidencePatterns: [/\b(lesson|learning|retrospective|retro|rubric|codex|ci feedback|reuse|promot(?:e|ion)|retir(?:e|ement))\b/i],
  },
];

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
 * Evaluate the snapshot with a deterministic PM handoff quality rubric.
 * The result is intentionally evidence-based and LLM-readable so PM/liveness
 * tooling can flag missing handoff sections without inventing context.
 */
export function assessPmHandoffQuality(
  snapshot: BrainSnapshot,
): PmHandoffQualityAssessment {
  const evidenceCorpus = buildHandoffEvidenceCorpus(snapshot);
  const results = PM_HANDOFF_QUALITY_RUBRIC.map((criterion) => {
    const evidence = evidenceCorpus
      .filter((entry) =>
        criterion.evidencePatterns.some((pattern) => pattern.test(entry.searchable)),
      )
      .map((entry) => entry.display)
      .slice(0, 3);
    return {
      id: criterion.id,
      label: criterion.label,
      status: evidence.length > 0 ? 'pass' : 'needs-attention',
      evidence,
      guidance: criterion.guidance,
    } satisfies PmHandoffRubricResult;
  });
  const passed = results.filter((result) => result.status === 'pass').length;
  const total = results.length;
  const score = total === 0 ? 0 : Number((passed / total).toFixed(2));

  return {
    score,
    passed,
    total,
    results,
    operatorGuidance:
      passed === total
        ? 'PM handoff includes evidence for every rubric criterion.'
        : 'PM handoff is missing one or more rubric criteria; add the missing evidence before promotion or retirement.',
  };
}

/**
 * Format a BrainSnapshot as human-readable text for provider handoff.
 * Shared across all adapters — each injects this via their own mechanism
 * (CLI flag, system prompt, GEMINI.md, etc.).
 */
export function formatHandoff(snapshot: BrainSnapshot): string {
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
    ...snapshot.episodic.slice(-10).map(
      (e) => `  [${e.type}] ${e.summary}`,
    ),
    '',
    formatPmHandoffQualityRubric(assessPmHandoffQuality(snapshot)),
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

function formatPmHandoffQualityRubric(
  assessment: PmHandoffQualityAssessment,
): string {
  return [
    `PM handoff quality rubric: ${assessment.passed}/${assessment.total} (${assessment.score})`,
    ...assessment.results.map((result) => {
      const evidence = result.evidence.length > 0 ? result.evidence.join('; ') : result.guidance;
      return `  - ${result.label}: ${result.status} — ${evidence}`;
    }),
    `PM guidance: ${assessment.operatorGuidance}`,
  ].join('\n');
}

function buildHandoffEvidenceCorpus(
  snapshot: BrainSnapshot,
): HandoffEvidenceEntry[] {
  const entries = [
    ...Object.entries(snapshot.working)
      .map(([key, value]) => formatWorkingEvidence(key, value))
      .filter((entry): entry is HandoffEvidenceEntry => entry !== null),
    ...snapshot.episodic.map(formatEpisodicEvidence),
  ];

  if (snapshot.checkpoint) {
    const searchable = normalizeEvidence(
      [
        'checkpoint',
        'phase',
        snapshot.checkpoint.phase,
        'step',
        String(snapshot.checkpoint.step),
        summarizeUnknown(snapshot.checkpoint.context),
      ].join(' '),
    );
    if (searchable.length > 0) {
      entries.push({
        searchable,
        display: `checkpoint: phase=${snapshot.checkpoint.phase} step=${snapshot.checkpoint.step} context=${truncateEvidence(searchable)}`,
      });
    }
  }

  return entries;
}

function formatWorkingEvidence(
  key: string,
  value: unknown,
): HandoffEvidenceEntry | null {
  const valueEvidence = normalizeEvidence(summarizeUnknown(value));
  if (valueEvidence.length === 0) {
    return null;
  }
  const searchable = normalizeEvidence(`${splitEvidenceKey(key)} ${valueEvidence}`);
  return {
    searchable,
    display: `working.${key}: ${truncateEvidence(valueEvidence)}`,
  };
}

function formatEpisodicEvidence(event: EpisodicEvent): HandoffEvidenceEntry {
  const details = event.details ? ` details=${summarizeUnknown(event.details)}` : '';
  const step = event.step ? ` step=${event.step}` : '';
  const searchable = normalizeEvidence(`${event.type} ${step} ${event.summary}${details}`);
  return {
    searchable,
    display: `event.${event.type}:${step} ${truncateEvidence(searchable)}`,
  };
}

function summarizeUnknown(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  const pruned = pruneEmptyEvidence(value);
  if (pruned === undefined) {
    return '';
  }
  try {
    return JSON.stringify(pruned);
  } catch {
    return String(value);
  }
}

function pruneEmptyEvidence(value: unknown): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    const normalized = normalizeEvidence(value);
    return normalized.length === 0 ? undefined : normalized;
  }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => pruneEmptyEvidence(item))
      .filter((item) => item !== undefined);
    return items.length === 0 ? undefined : items;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, entryValue]) => [key, pruneEmptyEvidence(entryValue)] as const)
      .filter(([, entryValue]) => entryValue !== undefined);
    return entries.length === 0 ? undefined : Object.fromEntries(entries);
  }
  return value;
}

function splitEvidenceKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ');
}

function normalizeEvidence(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateEvidence(value: string): string {
  const normalized = normalizeEvidence(value);
  if (normalized.length <= MAX_RUBRIC_EVIDENCE_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_RUBRIC_EVIDENCE_CHARS - 1)}…`;
}
