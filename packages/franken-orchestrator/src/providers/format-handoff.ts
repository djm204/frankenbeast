import type { BrainSnapshot, EpisodicEvent } from '@franken/types';

/** Rough char-to-token ratio (1 token ≈ 4 chars) */
const CHARS_PER_TOKEN = 4;
const MAX_RUBRIC_EVIDENCE_CHARS = 120;
const CHILD_HEADING_LABEL_PREFIX = '__handoff_child_heading__ ';

export type PmHandoffRubricStatus = 'pass' | 'needs-attention';

export interface PmHandoffRubricCriterion {
  readonly id: string;
  readonly label: string;
  readonly guidance: string;
  readonly evidencePatterns: readonly RegExp[];
  readonly requiredEvidencePatterns?: readonly RegExp[];
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

export type AgentHandoffTemplateSectionId =
  'scope' | 'state' | 'verification' | 'blockers' | 'artifacts' | 'learning';

export type AgentHandoffTemplateFindingStatus =
  'pass' | 'missing' | 'placeholder';

export interface AgentHandoffTemplateRequirement {
  readonly id: AgentHandoffTemplateSectionId;
  readonly label: string;
  readonly headingPatterns: readonly RegExp[];
  readonly guidance: string;
  readonly requiredContentPatterns: readonly RegExp[];
}

export interface AgentHandoffTemplateFinding {
  readonly id: AgentHandoffTemplateSectionId;
  readonly label: string;
  readonly status: AgentHandoffTemplateFindingStatus;
  readonly guidance: string;
  readonly matchedHeading?: string;
}

export interface AgentHandoffTemplateValidation {
  readonly valid: boolean;
  readonly passed: number;
  readonly total: number;
  readonly missingSections: readonly AgentHandoffTemplateSectionId[];
  readonly findings: readonly AgentHandoffTemplateFinding[];
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
    guidance:
      'Name the issue/task, business goal, and out-of-scope boundaries so the next PM does not re-discover intent.',
    evidencePatterns: [
      /\b(issue|task|goal|objective|scope|out[- ]of[- ]scope|boundary|boundaries)\b/i,
    ],
    requiredEvidencePatterns: [
      /\b(issue|task|scope)\b/i,
      /\b(goal|objective)\b/i,
      /\b(out[- ]of[- ]scope|boundary|boundaries)\b/i,
    ],
  },
  {
    id: 'state',
    label: 'Current state and decisions',
    guidance:
      'Preserve completed work, current phase, and key decisions with enough context for a fresh worker to resume safely.',
    evidencePatterns: [
      /\b(decision|phase|status|completed|remaining|checkpoint|current state)\b/i,
    ],
  },
  {
    id: 'verification',
    label: 'Verification evidence',
    guidance:
      'Include deterministic test, lint, build, or verifier commands and their outcome before promotion or retirement.',
    evidencePatterns: [
      /\b(test|lint|typecheck|build|verified|verification|pass(?:ed)?|fail(?:ed)?|fixture|npm|pnpm|yarn|vitest|tsc|eslint|pytest)\b/i,
    ],
    requiredEvidencePatterns: [
      /\b(test|lint|typecheck|build|verified|verification|fixture|npm|pnpm|yarn|vitest|tsc|eslint|pytest)\b/i,
      /\b(pass(?:ed)?|fail(?:ed)?|exit|0 errors|green|succeed(?:ed)?)\b/i,
    ],
  },
  {
    id: 'blockers',
    label: 'Blockers and next action',
    guidance:
      'Make blockers, owner, and next action explicit instead of leaving the receiving PM to infer what to do.',
    evidencePatterns: [
      /\b(blocker|blockers|blocked|risk|next action|next step|next steps|owner|assignee|needs review|follow[- ]?up)\b/i,
    ],
  },
  {
    id: 'artifacts',
    label: 'Artifacts and links',
    guidance:
      'Point to concrete artifacts such as branch, PR, worktree, diff, docs, or telemetry records that the next PM can inspect.',
    evidencePatterns: [
      /\b(branch|pr|pull request|worktree|diff|artifact|doc|url|https?:\/\/|telemetry)\b/i,
    ],
  },
  {
    id: 'learning',
    label: 'Learning and reuse',
    guidance:
      'Capture reusable lessons, retrospective notes, Codex/CI feedback, or promotion/retirement rationale without one-off noise.',
    evidencePatterns: [
      /\b(lesson|learning|retrospective|retro|rubric|codex|ci feedback|reuse|promot(?:e|ion)|retir(?:e|ement))\b/i,
    ],
  },
];

export const AGENT_HANDOFF_TEMPLATE_REQUIREMENTS: readonly AgentHandoffTemplateRequirement[] =
  [
    {
      id: 'scope',
      label: 'Scope and objective',
      headingPatterns: [/\bscope\b/i, /\bobjective\b/i, /\bgoal\b/i],
      guidance:
        'Add a section that names the issue/task, business goal, and out-of-scope boundaries.',
      requiredContentPatterns: [
        /\b(issue|task)\b/i,
        /\b(goal|objective|business goal)\b/i,
        /\b(out[- ]of[- ]scope|boundary|boundaries)\b/i,
      ],
    },
    {
      id: 'state',
      label: 'Current state and decisions',
      headingPatterns: [/\bcurrent state\b/i, /\bstatus\b/i, /\bdecisions?\b/i],
      guidance:
        'Add a section for completed work, current phase, key decisions, and remaining work.',
      requiredContentPatterns: [
        /\b(completed|done|current|phase|status)\b/i,
        /\b(decision|decisions|decided)\b/i,
        /\b(remaining|next|todo|pending)\b/i,
      ],
    },
    {
      id: 'verification',
      label: 'Verification evidence',
      headingPatterns: [/\bverification\b/i, /\btests?\b/i, /\bvalidation\b/i],
      guidance:
        'Add a section for deterministic test, lint, build, or verifier commands and outcomes.',
      requiredContentPatterns: [
        /\b(test|lint|typecheck|build|verify|verification|npm|pnpm|yarn|vitest|tsc|eslint|pytest)\b/i,
        /\b(pass(?:ed)?|fail(?:ed)?|exit|outcome|green|succeed(?:ed)?|0 errors)\b/i,
      ],
    },
    {
      id: 'blockers',
      label: 'Blockers and next action',
      headingPatterns: [
        /\bblockers?\b/i,
        /\bnext action\b/i,
        /\bnext steps?\b/i,
      ],
      guidance:
        'Add a section that makes blockers, owner, and the next action explicit.',
      requiredContentPatterns: [
        /(?:\b(blocker|blockers|blocked|risk|risks)\b|\b(?:no|none)\s+(?:blocker|blockers|risk|risks)\b|\b(?:blocker|blockers|risk|risks)\s*[:=-]?\s*(?:none|no)\b)/i,
        /\b(owner|assignee|responsible)\b/i,
        /\b(next action|next step|next steps|follow[- ]?up|continue)\b/i,
      ],
    },
    {
      id: 'artifacts',
      label: 'Artifacts and links',
      headingPatterns: [
        /\bartifacts?\b/i,
        /\blinks?\b/i,
        /\bbranches?\b/i,
        /\bbranch\b/i,
        /\bpr\b/i,
        /\bpull requests?\b/i,
        /\bworktrees?\b/i,
        /\bdiffs?\b/i,
        /\bdocs?\b/i,
        /\btelemetry\b/i,
      ],
      guidance:
        'Add a section for concrete artifacts such as branch, PR, worktree, docs, or telemetry links.',
      requiredContentPatterns: [
        /(?:\b(branch|pr|pull request|worktree|diff|doc|docs|telemetry|artifact|artifacts)\b|https?:\/\/|#\d+)/i,
      ],
    },
    {
      id: 'learning',
      label: 'Learning and reuse',
      headingPatterns: [
        /\blearnings?\b/i,
        /\blessons?\b/i,
        /\bretrospective\b/i,
        /\breuse\b/i,
      ],
      guidance:
        'Add a section for durable lessons, review feedback, and reusable follow-up guidance.',
      requiredContentPatterns: [
        /\b(lesson|lessons|learning|retrospective|reuse|reusable|codex|ci feedback|review feedback)\b/i,
      ],
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
  while (trimmed.episodic.length > 0 && estimateChars(trimmed) > maxChars) {
    trimmed = {
      ...trimmed,
      episodic: trimmed.episodic.slice(1),
    };
  }

  // Phase 2: trim working memory (largest values first)
  if (estimateChars(trimmed) > maxChars) {
    const entries = Object.entries(trimmed.working as Record<string, unknown>);
    entries.sort(
      (a, b) => JSON.stringify(b[1]).length - JSON.stringify(a[1]).length,
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
        criterion.evidencePatterns.some((pattern) =>
          pattern.test(entry.searchable),
        ),
      )
      .map((entry) => entry.display)
      .slice(0, 1);
    return {
      id: criterion.id,
      label: criterion.label,
      status: criterionPasses(criterion, evidenceCorpus)
        ? 'pass'
        : 'needs-attention',
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
 * Validate a markdown handoff template before it is promoted to PM/worker use.
 * The validator checks for the same durable handoff dimensions as the runtime
 * rubric while keeping output structured for liveness/onboarding tooling.
 */
export function validateAgentHandoffTemplate(
  template: string,
): AgentHandoffTemplateValidation {
  const sections = extractMarkdownSections(template);
  const usedSectionIndexes = new Set<number>();
  const findings = AGENT_HANDOFF_TEMPLATE_REQUIREMENTS.map(
    (requirement, requirementIndex) => {
      const candidates = sections
        .map((section, index) => ({ section, index }))
        .filter(
          ({ section, index }) =>
            !usedSectionIndexes.has(index) &&
            requirement.headingPatterns.some((pattern) =>
              pattern.test(section.heading),
            ),
        );
      const usableCandidate = candidates.find(({ section }) =>
        sectionSatisfiesRequirement(section, requirement),
      );

      if (usableCandidate) {
        usedSectionIndexes.add(usableCandidate.index);
        return {
          id: requirement.id,
          label: requirement.label,
          status: 'pass',
          guidance: requirement.guidance,
          matchedHeading: usableCandidate.section.heading,
        } satisfies AgentHandoffTemplateFinding;
      }

      const placeholderCandidate = candidates.find(
        ({ section }) =>
          !AGENT_HANDOFF_TEMPLATE_REQUIREMENTS.slice(requirementIndex + 1).some(
            (futureRequirement) =>
              futureRequirement.headingPatterns.some((pattern) =>
                pattern.test(section.heading),
              ),
          ),
      );
      if (placeholderCandidate) {
        usedSectionIndexes.add(placeholderCandidate.index);
        return {
          id: requirement.id,
          label: requirement.label,
          status: 'placeholder',
          guidance: `${requirement.guidance} The section exists but only contains placeholders or empty guidance.`,
          matchedHeading: placeholderCandidate.section.heading,
        } satisfies AgentHandoffTemplateFinding;
      }

      return {
        id: requirement.id,
        label: requirement.label,
        status: 'missing',
        guidance: requirement.guidance,
      } satisfies AgentHandoffTemplateFinding;
    },
  );
  const passed = findings.filter((finding) => finding.status === 'pass').length;
  const missingSections = findings
    .filter((finding) => finding.status !== 'pass')
    .map((finding) => finding.id);
  const valid = missingSections.length === 0;

  return {
    valid,
    passed,
    total: AGENT_HANDOFF_TEMPLATE_REQUIREMENTS.length,
    missingSections,
    findings,
    operatorGuidance: valid
      ? 'Agent handoff template includes actionable guidance for every required section.'
      : `Agent handoff template is missing or underspecifies: ${missingSections.join(', ')}.`,
  };
}

function criterionPasses(
  criterion: PmHandoffRubricCriterion,
  evidenceCorpus: readonly HandoffEvidenceEntry[],
): boolean {
  if (criterion.requiredEvidencePatterns) {
    return criterion.requiredEvidencePatterns.every((pattern) =>
      evidenceCorpus.some((entry) => pattern.test(entry.searchable)),
    );
  }
  return evidenceCorpus.some((entry) =>
    criterion.evidencePatterns.some((pattern) =>
      pattern.test(entry.searchable),
    ),
  );
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
    ...snapshot.episodic
      .slice(-10)
      .map((event: EpisodicEvent) => `  [${event.type}] ${event.summary}`),
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
    `PM rubric: ${assessment.passed}/${assessment.total} (${assessment.score})`,
    ...assessment.results.map((result) => {
      const evidence =
        result.evidence.length > 0
          ? result.evidence.join('; ')
          : 'missing evidence';
      return `  - ${result.id}: ${result.status} — ${evidence}`;
    }),
    `PM guidance: ${assessment.passed === assessment.total ? 'complete' : 'add missing evidence before promotion/retirement'}`,
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

interface MarkdownSection {
  readonly heading: string;
  readonly level: number;
  readonly content: string;
}

function sectionSatisfiesRequirement(
  section: MarkdownSection,
  requirement: AgentHandoffTemplateRequirement,
): boolean {
  const contentWithPopulatedChildHeadingLabels =
    stripUnpopulatedChildHeadingLabels(section.content);
  const headingContentPrefix =
    requirement.id === 'artifacts'
      ? artifactHeadingContentPrefix(section.heading)
      : '';
  const searchableContent = normalizeEvidence(
    `${headingContentPrefix} ${stripPlaceholderOnlyTemplateFields(contentWithPopulatedChildHeadingLabels)}`,
  );
  return (
    hasSubstantiveTemplateGuidance(contentWithPopulatedChildHeadingLabels) &&
    requirement.requiredContentPatterns.every((pattern) =>
      pattern.test(searchableContent),
    )
  );
}

function extractMarkdownSections(template: string): MarkdownSection[] {
  const sections: Array<{ heading: string; level: number; content: string[] }> =
    [];
  const openSectionIndexes: number[] = [];
  const lines = template.split(/\r?\n/);
  let activeFence: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const activeSectionIndex =
        openSectionIndexes[openSectionIndexes.length - 1] ?? -1;
      for (const sectionIndex of openSectionIndexes) {
        const section = sections[sectionIndex];
        if (
          section &&
          (sectionIndex === activeSectionIndex ||
            isExplicitRequiredHandoffSectionHeading(section.heading))
        ) {
          section.content.push(line);
        }
      }
      const marker = fence[1] ?? '';
      if (activeFence === null) {
        activeFence = marker;
      } else if (
        marker[0] === activeFence[0] &&
        marker.length >= activeFence.length
      ) {
        activeFence = null;
      }
      continue;
    }

    const nextLine = lines[index + 1] ?? '';
    const setextHeading =
      activeFence === null &&
      line.trim().length > 0 &&
      !line.includes('|') &&
      /^\s*(=+|-+)\s*$/.test(nextLine)
        ? /^\s*(=+|-+)\s*$/.exec(nextLine)
        : null;
    if (setextHeading) {
      const level = setextHeading[1]?.startsWith('=') ? 1 : 2;
      while (openSectionIndexes.length > 0) {
        const current =
          sections[openSectionIndexes[openSectionIndexes.length - 1]!];
        if (current && current.level < level) {
          break;
        }
        openSectionIndexes.pop();
      }
      const section = {
        heading: normalizeEvidence(line),
        level,
        content: [] as string[],
      };
      for (const sectionIndex of openSectionIndexes) {
        sections[sectionIndex]?.content.push(
          `${CHILD_HEADING_LABEL_PREFIX}${section.heading}`,
        );
      }
      sections.push(section);
      openSectionIndexes.push(sections.length - 1);
      index += 1;
      continue;
    }

    const heading = activeFence
      ? null
      : /^\s{0,3}(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      while (openSectionIndexes.length > 0) {
        const current =
          sections[openSectionIndexes[openSectionIndexes.length - 1]!];
        if (current && current.level < level) {
          break;
        }
        openSectionIndexes.pop();
      }
      const section = {
        heading: normalizeEvidence(heading[2] ?? ''),
        level,
        content: [] as string[],
      };
      for (const sectionIndex of openSectionIndexes) {
        sections[sectionIndex]?.content.push(
          `${CHILD_HEADING_LABEL_PREFIX}${section.heading}`,
        );
      }
      sections.push(section);
      openSectionIndexes.push(sections.length - 1);
      continue;
    }

    const activeSectionIndex =
      openSectionIndexes[openSectionIndexes.length - 1] ?? -1;
    for (const sectionIndex of openSectionIndexes) {
      const section = sections[sectionIndex];
      if (
        section &&
        (section.level > 1 ||
          sectionIndex === activeSectionIndex ||
          isExplicitRequiredHandoffSectionHeading(section.heading))
      ) {
        section.content.push(line);
      }
    }
  }

  return sections.map((section) => ({
    heading: section.heading,
    level: section.level,
    content: section.content.join('\n'),
  }));
}

function hasSubstantiveTemplateGuidance(content: string): boolean {
  const contentWithoutChildHeadingLabels = stripChildHeadingLabels(content);
  const normalized = normalizeEvidence(
    stripPlaceholderOnlyTemplateFields(contentWithoutChildHeadingLabels),
  );
  return (
    /[A-Za-z0-9]/.test(normalized) &&
    normalized.split(' ').some((token) => token.length >= 4)
  );
}

function stripChildHeadingLabels(content: string): string {
  return content.replace(
    new RegExp(`^${escapeRegExp(CHILD_HEADING_LABEL_PREFIX)}.*$`, 'gim'),
    ' ',
  );
}

function stripUnpopulatedChildHeadingLabels(content: string): string {
  const lines = content.split(/\r?\n/);
  const kept: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!line.startsWith(CHILD_HEADING_LABEL_PREFIX)) {
      kept.push(line);
      continue;
    }

    const childBody: string[] = [];
    for (let lookahead = index + 1; lookahead < lines.length; lookahead += 1) {
      const bodyLine = lines[lookahead] ?? '';
      if (bodyLine.startsWith(CHILD_HEADING_LABEL_PREFIX)) {
        break;
      }
      childBody.push(bodyLine);
    }

    const childBodyText = childBody.join('\n');
    if (hasSubstantiveTemplateGuidance(childBodyText)) {
      kept.push(`${line.replace(CHILD_HEADING_LABEL_PREFIX, ' ')} ${childBodyText}`);
    }
  }
  return kept.join('\n');
}

function stripPlaceholderOnlyTemplateFields(content: string): string {
  const lines = content.split(/\r?\n/);
  const stripped: string[] = [];
  let activeFence: string | null = null;
  let activeFencePreservesCommands = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const marker = fence[1] ?? '';
      if (activeFence === null) {
        activeFence = marker;
        activeFencePreservesCommands =
          /\b(?:bash|sh|shell|zsh|fish|console)\b/i.test(line) ||
          (/^\s*(`{3,}|~{3,})\s*$/.test(line) &&
            unlabeledFenceContainsVerificationCommand(lines, index + 1, marker));
      } else if (
        marker[0] === activeFence[0] &&
        marker.length >= activeFence.length
      ) {
        activeFence = null;
        activeFencePreservesCommands = false;
      }
      continue;
    }
    if (activeFence !== null) {
      if (activeFencePreservesCommands &&
        (looksLikeVerificationCommand(line) || looksLikeVerificationOutcome(line))
      ) {
        stripped.push(line);
      }
      continue;
    }
    if (isNoBlockerOrRiskStateLine(line)) {
      stripped.push(line);
      continue;
    }
    if (
      /^\s*(?:[-*]\s*)?(?:todo|tbd|placeholder|please\s+fill\s+in)(?:\s*:|\b)/i.test(
        line,
      ) ||
      (!isNoBlockerOrRiskFieldLine(line) && isPlaceholderOnlyFieldLine(line)) ||
      isOrderedListTemplateLabelLine(line) ||
      isEmptyTemplateLabel(line) ||
      isCombinedSkeletonLabelLine(line)
    ) {
      continue;
    }

    const nextLine = lines[index + 1] ?? '';
    const isPopulatedTableHeader =
      isMarkdownTableHeader(line, nextLine) &&
      hasPopulatedTableRows(lines, index + 2);
    if (isMarkdownTableHeader(line, nextLine) && !isPopulatedTableHeader) {
      index += 1;
      continue;
    }
    if (isMarkdownTableSeparator(line)) {
      continue;
    }

    const effectiveLine = isPopulatedTableHeader
      ? populatedTableHeaderLabels(line, lines, index + 2)
      : line;
    if (isNoBlockerOrRiskFieldLine(effectiveLine)) {
      stripped.push(effectiveLine);
      continue;
    }
    const withoutPlaceholderFragments = effectiveLine
      .replace(
        /\b[A-Za-z0-9 /_-]+(?:\s+-\s+|:)\s*(?:<(?!(?:https?:\/\/|\.\.?\/|#))[^>]*>|\{\{[^}]*\}\}|\{[^}]*\}|\[[^\]]*\](?!\(|\[)|[-–—]+|\b(?:none|tbd|todo|n\/?a|unknown|placeholder|please\s+fill\s+in|fill\s+in|to\s+be\s+decided)\b)\s*(?:[;,.]|$)/gi,
        ' ',
      )
      .replace(/^```.*$/g, ' ')
      .replace(/\[([^\]]+)\]\(([^)]*)\)/g, '$1 $2')
      .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/<((?:https?:\/\/|\.\.?\/|#)[^>\s]+)>/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\{\{[^}]*\}\}/g, ' ')
      .replace(/\{[^}]*\}/g, ' ')
      .replace(
        /\b(?:none|tbd|todo|n\/?a|unknown|placeholder|please\s+fill\s+in|fill\s+in|to\s+be\s+decided)\b/gi,
        ' ',
      )
      .replace(/[_.-]{2,}/g, ' ');
    if (
      isEmptyTemplateLabel(withoutPlaceholderFragments) ||
      (!isPopulatedTableHeader && isEmptyTableRow(withoutPlaceholderFragments))
    ) {
      continue;
    }
    stripped.push(withoutPlaceholderFragments);
  }

  return stripped.join('\n');
}

function normalizeTemplateLabelKey(value: string): string {
  return normalizeEvidence(
    value
      .replace(/^\s*(?:[-*]|\d+[.)])\s*/, '')
      .replace(/\[[ x-]\]/gi, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\b(?:required|optional)\b/gi, ' ')
      .replace(/[^A-Za-z0-9 /_:-]/g, ' ')
      .replace(/[\/_:-]+/g, ' '),
  ).toLowerCase();
}

function isKnownTemplateLabel(label: string): boolean {
  return /^(?:issue(?: details)?|issue task|task|business goal|business objective|goal|objective|out of scope boundaries|boundary notes|boundaries|completed work|current phase|key decisions|status|current status|decisions|remaining work|blocker|blockers|blocked|risk|risks|command|commands|test command|test commands|outcome|result|owner|responsible|assignee|next action|next step|next steps|follow up|continue|artifact|artifacts|link|links|worktree|worktrees|diff|diffs|doc|docs|telemetry|lesson|lessons)$/.test(
    normalizeTemplateLabelKey(label),
  );
}

function isKnownTemplateLabelCombination(label: string): boolean {
  const parts = normalizeEvidence(label)
    .split(/\s*(?:,|;|\/|\band\b)\s*/i)
    .map((part) => normalizeTemplateLabelKey(part))
    .filter((part) => part.length > 0);
  return parts.length > 1 && parts.every(isKnownTemplateLabel);
}

function isEmptyTemplateLabel(line: string): boolean {
  if (hasParenthesizedFieldValue(line)) {
    return false;
  }
  const normalizedLabel = line
    .replace(/\[[ x-]\]/gi, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(?:required|optional)\b/gi, ' ')
    .replace(/[^A-Za-z0-9 ,/_:-]/g, ' ');
  const normalizedLabelKey = normalizeTemplateLabelKey(normalizedLabel);
  return (
    /^\s*(?:[-*]\s*)?[A-Za-z0-9 /_-]+:\s*$/.test(normalizedLabel) ||
    isKnownTemplateLabel(normalizedLabelKey) ||
    isKnownTemplateLabelCombination(normalizedLabel)
  );
}

function isOrderedListTemplateLabelLine(line: string): boolean {
  const match = /^\s*\d+[.)]\s*(.+?)\s*$/.exec(line);
  return match ? isKnownTemplateLabel(match[1] ?? '') : false;
}

function isPlaceholderOnlyFieldLine(line: string): boolean {
  const normalized = normalizeEvidence(line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, ''));
  const field = /^([A-Za-z0-9 /_-]+)(?::|\s+-\s+)(.+)$/i.exec(normalized);
  if (field) {
    const label = normalizeTemplateLabelKey(field[1] ?? '');
    const value = normalizeTemplateLabelKey(field[2] ?? '');
    if (!isNoBlockerOrRiskLabelValue(label, value) && (value === label || isPlaceholderValue(value))) {
      return true;
    }
  }
  return /^[A-Za-z0-9 /_-]+(?::|\s+-\s+)(?:<(?!(?:https?:\/\/|\.\.?\/|#))[^>]*>|\{\{[^}]*\}\}|\{[^}]*\}|\[[^\]]*\](?!\(|\[)|[-–—]+|\b(?:none|tbd|todo|n\/?a|unknown|placeholder|please\s+fill\s+in|fill\s+in|to\s+be\s+decided)\b)\s*$/i.test(
    normalized,
  );
}

function isNoBlockerOrRiskFieldLine(line: string): boolean {
  const normalized = normalizeEvidence(line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, ''));
  const field = /^([A-Za-z0-9 /_-]+)(?::|\s+-\s+)(.+)$/i.exec(normalized);
  if (!field) {
    return false;
  }
  return isNoBlockerOrRiskLabelValue(
    normalizeTemplateLabelKey(field[1] ?? ''),
    normalizeTemplateLabelKey(field[2] ?? ''),
  );
}

function isNoBlockerOrRiskStateLine(line: string): boolean {
  return /(?:\b(?:blocker|blockers|blocked|risk|risks)\b\s*[:=-]?\s*(?:none|no)\b|\b(?:no|none)\s+(?:blocker|blockers|risk|risks)\b)/i.test(
    line,
  );
}

function isNoBlockerOrRiskLabelValue(label: string, value: string): boolean {
  return /^(?:blocker|blockers|blocked|risk|risks)$/.test(label) &&
    /^(?:no|none|no blockers|no blocker|no risks|no risk)$/.test(value);
}

function isPlaceholderValue(value: string): boolean {
  return /^(?:no|none|tbd|todo|n a|na|unknown|placeholder|please fill in|fill in|to be decided)$/.test(
    value,
  );
}

function isRequiredHandoffSectionHeading(heading: string): boolean {
  if (/\bagent\s+handoff\b/i.test(heading)) {
    return false;
  }
  return AGENT_HANDOFF_TEMPLATE_REQUIREMENTS.some((requirement) =>
    requirement.headingPatterns.some((pattern) => pattern.test(heading)),
  );
}

function isExplicitRequiredHandoffSectionHeading(heading: string): boolean {
  return (
    /\bscope\b/i.test(heading) ||
    /\bcurrent\s+state\b/i.test(heading) ||
    /\bstatus\b/i.test(heading) ||
    /\bdecisions?\b/i.test(heading) ||
    /\bverification\b/i.test(heading) ||
    /\btests?\b/i.test(heading) ||
    /\bvalidation\b/i.test(heading) ||
    /\bblockers?\b/i.test(heading) ||
    /\bnext action\b/i.test(heading) ||
    /\bnext steps?\b/i.test(heading) ||
    /\bartifacts?\b/i.test(heading) ||
    /\blinks?\b/i.test(heading) ||
    /\bbranches?\b/i.test(heading) ||
    /\bpr\b/i.test(heading) ||
    /\bpull requests?\b/i.test(heading) ||
    /\bworktrees?\b/i.test(heading) ||
    /\bdiffs?\b/i.test(heading) ||
    /\bdocs?\b/i.test(heading) ||
    /\btelemetry\b/i.test(heading) ||
    /\blearnings?\b/i.test(heading) ||
    /\blessons?\b/i.test(heading) ||
    /\bretrospective\b/i.test(heading) ||
    /\breuse\b/i.test(heading)
  )
    ? isRequiredHandoffSectionHeading(heading)
    : false;
}

function artifactHeadingContentPrefix(_heading: string): string {
  return '';
}

function unlabeledFenceContainsVerificationCommand(
  lines: readonly string[],
  startIndex: number,
  marker: string,
): boolean {
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (
      fence &&
      (fence[1]?.[0] ?? '') === marker[0] &&
      (fence[1]?.length ?? 0) >= marker.length
    ) {
      return false;
    }
    if (looksLikeVerificationCommand(line)) {
      return true;
    }
  }
  return false;
}

function looksLikeVerificationCommand(line: string): boolean {
  return /\b(?:npm|pnpm|yarn|vitest|tsc|eslint|pytest|test|lint|typecheck|build)\b/i.test(
    line,
  );
}

function looksLikeVerificationOutcome(line: string): boolean {
  return /\b(?:pass(?:ed|es)?|fail(?:ed|ure|ures)?|success(?:ful)?|ok|green|red|\d+\s+passed|\d+\s+failed)\b/i.test(
    line,
  );
}

function isCombinedSkeletonLabelLine(line: string): boolean {
  const parts = line
    .replace(/^\s*[-*]\s*/, '')
    .split(/[,;/]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 && parts.every((part) => isEmptyTemplateLabel(part));
}

function hasParenthesizedFieldValue(line: string): boolean {
  const match = /^\s*(?:[-*]\s*)?[A-Za-z0-9 /_-]+\s+\(([^)]*[A-Za-z0-9][^)]*)\)\s*$/.exec(
    line,
  );
  if (!match) {
    return false;
  }
  const value = normalizeEvidence(match[1] ?? '');
  return (
    value.length > 0 &&
    !/^(?:required|optional|tbd|todo|n\/?a|unknown|placeholder|please fill in|fill in|to be decided)$/i.test(
      value,
    ) &&
    !isKnownTemplateLabel(value)
  );
}

function isMarkdownTableHeader(line: string, nextLine: string): boolean {
  return line.includes('|') && isMarkdownTableSeparator(nextLine);
}

function isMarkdownTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function hasPopulatedTableRows(lines: readonly string[], startIndex: number): boolean {
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!line.includes('|')) {
      break;
    }
    if (isMarkdownTableSeparator(line)) {
      continue;
    }
    const strippedLine = stripPlaceholderOnlyTemplateFields(line);
    if (
      normalizeEvidence(strippedLine).length > 0 &&
      !isEmptyTableRow(strippedLine)
    ) {
      return true;
    }
  }
  return false;
}

function populatedTableHeaderLabels(
  headerLine: string,
  lines: readonly string[],
  startIndex: number,
): string {
  const headers = splitMarkdownTableCells(headerLine);
  const populatedColumns = new Set<number>();
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!line.includes('|')) {
      break;
    }
    if (isMarkdownTableSeparator(line)) {
      continue;
    }
    splitMarkdownTableCells(line).forEach((cell, cellIndex) => {
      if (cellHasPopulatedTemplateValue(cell)) {
        populatedColumns.add(cellIndex);
      }
    });
  }
  return headers.filter((_, index) => populatedColumns.has(index)).join(' ');
}

function splitMarkdownTableCells(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function cellHasPopulatedTemplateValue(cell: string): boolean {
  const stripped = normalizeEvidence(stripPlaceholderOnlyTemplateFields(cell));
  return (
    stripped.length > 0 &&
    !isEmptyTemplateLabel(stripped) &&
    !/^(?:[-–—]+|none|tbd|todo|n\/?a|unknown|placeholder|please\s+fill\s+in|fill\s+in|to\s+be\s+decided)$/i.test(
      stripped,
    )
  );
}

function isEmptyTableRow(line: string): boolean {
  if (!line.includes('|')) {
    return false;
  }
  const cells = line
    .split('|')
    .map((cell) => normalizeTemplateLabelKey(cell))
    .filter((cell) => cell.length > 0);
  return (
    cells.length === 0 ||
    cells.every(
      (cell) =>
        isKnownTemplateLabel(cell) ||
        isKnownTemplateLabelCombination(cell) ||
        /^(?:none|tbd|todo|n\/?a|unknown|placeholder|please\s+fill\s+in|fill\s+in|to\s+be\s+decided|[-–—]+)$/i.test(
          cell,
        ),
    )
  );
}

function formatWorkingEvidence(
  key: string,
  value: unknown,
): HandoffEvidenceEntry | null {
  const valueEvidence = normalizeEvidence(summarizeUnknown(value));
  if (valueEvidence.length === 0) {
    return null;
  }
  const searchable = normalizeEvidence(
    `${splitEvidenceKey(key)} ${valueEvidence}`,
  );
  return {
    searchable,
    display: `working.${key}: ${truncateEvidence(valueEvidence)}`,
  };
}

function formatEpisodicEvidence(event: EpisodicEvent): HandoffEvidenceEntry {
  const details = event.details
    ? ` details=${summarizeUnknown(event.details)}`
    : '';
  const step = event.step ? ` step=${event.step}` : '';
  const searchable = normalizeEvidence(
    `${event.type} ${step} ${event.summary}${details}`,
  );
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
  if (typeof value === 'boolean') {
    return value ? value : undefined;
  }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => pruneEmptyEvidence(item))
      .filter((item) => item !== undefined);
    return items.length === 0 ? undefined : items;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(
        ([key, entryValue]) => [key, pruneEmptyEvidence(entryValue)] as const,
      )
      .filter(([, entryValue]) => entryValue !== undefined);
    return entries.length === 0 ? undefined : Object.fromEntries(entries);
  }
  return value;
}

function splitEvidenceKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
}

function normalizeEvidence(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function truncateEvidence(value: string): string {
  const normalized = normalizeEvidence(value);
  if (normalized.length <= MAX_RUBRIC_EVIDENCE_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_RUBRIC_EVIDENCE_CHARS - 1)}…`;
}
