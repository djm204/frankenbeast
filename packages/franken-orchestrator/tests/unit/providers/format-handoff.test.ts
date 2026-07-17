import { describe, it, expect } from 'vitest';
import type { BrainSnapshot } from '@franken/types';
import {
  assessPmHandoffQuality,
  formatHandoff,
  truncateSnapshot,
  validateAgentHandoffTemplate,
} from '../../../src/providers/format-handoff.js';

function makeSnapshot(overrides: Partial<BrainSnapshot> = {}): BrainSnapshot {
  return {
    version: 1,
    timestamp: '2026-03-22T00:00:00.000Z',
    working: { task: 'fix auth' },
    episodic: [
      {
        type: 'decision',
        summary: 'Refactor auth module',
        createdAt: '2026-03-22T00:00:00.000Z',
      },
    ],
    checkpoint: null,
    metadata: {
      lastProvider: 'claude-cli',
      switchReason: 'rate-limit',
      totalTokensUsed: 5000,
    },
    ...overrides,
  };
}

describe('formatHandoff', () => {
  it('includes provider metadata', () => {
    const text = formatHandoff(makeSnapshot());
    expect(text).toContain('Previous provider: claude-cli');
    expect(text).toContain('Switch reason: rate-limit');
    expect(text).toContain('Tokens used so far: 5000');
  });

  it('includes working memory as JSON', () => {
    const text = formatHandoff(makeSnapshot({ working: { key: 'val' } }));
    expect(text).toContain('"key": "val"');
  });

  it('includes recent events', () => {
    const text = formatHandoff(makeSnapshot());
    expect(text).toContain('[decision] Refactor auth module');
  });

  it('truncates to last 10 events', () => {
    const events = Array.from({ length: 15 }, (_, i) => ({
      type: 'observation' as const,
      summary: `Event ${i}`,
      createdAt: '2026-03-22T00:00:00.000Z',
    }));
    const text = formatHandoff(makeSnapshot({ episodic: events }));
    expect(text).toContain('Event 5');
    expect(text).toContain('Event 14');
    expect(text).not.toContain('Event 4');
  });

  it('includes checkpoint when present', () => {
    const text = formatHandoff(
      makeSnapshot({
        checkpoint: {
          runId: 'run-1',
          phase: 'execution',
          step: 3,
          context: {},
          timestamp: '2026-03-22T00:00:00.000Z',
        },
      }),
    );
    expect(text).toContain('Last checkpoint: phase=execution, step=3');
  });

  it('omits checkpoint line when null', () => {
    const text = formatHandoff(makeSnapshot({ checkpoint: null }));
    expect(text).not.toContain('Last checkpoint');
  });

  it('wraps in HANDOFF delimiters', () => {
    const text = formatHandoff(makeSnapshot());
    expect(text).toMatch(/^--- BRAIN STATE HANDOFF ---/);
    expect(text).toMatch(/--- END HANDOFF ---$/);
  });

  it('includes the PM handoff quality rubric with operator guidance', () => {
    const text = formatHandoff(
      makeSnapshot({
        working: {
          issue:
            '#1862 add PM handoff quality rubric with goal to improve PM handoffs; out-of-scope: unrelated learning changes',
          status: 'completed docs and implementation',
          verification:
            'npm test -- --run tests/unit/providers/format-handoff.test.ts passed',
          blocker: 'needs review before merge PR',
          artifact:
            'branch resolve/issue-1862-feat-learning-add-pm-handoff-quality-rubric',
          lesson: 'Future workers can use this rubric before promotion',
        },
      }),
    );

    expect(text).toContain('PM rubric: 6/6 (1)');
    expect(text).toContain('scope: pass');
    expect(text).toContain('verification: pass');
    expect(text).toContain('PM guidance: complete');
  });
});

describe('assessPmHandoffQuality', () => {
  it('scores a complete PM handoff with deterministic evidence for every criterion', () => {
    const assessment = assessPmHandoffQuality(
      makeSnapshot({
        working: {
          goal: 'Resolve issue #1862 without broadening scope; out-of-scope: unrelated learning changes',
          status: 'implementation completed with decisions recorded',
          verificationCommand:
            'npm test --workspace @franken/orchestrator -- --run tests/unit/providers/format-handoff.test.ts passed',
          blocker: 'needs review before merge',
          pr: 'https://github.com/djm204/frankenbeast/pull/9999',
          retrospective: 'lesson captured for PM handoffs',
        },
      }),
    );

    expect(assessment.score).toBe(1);
    expect(assessment.passed).toBe(6);
    expect(assessment.results.every((result) => result.status === 'pass')).toBe(
      true,
    );
  });

  it('flags sparse handoffs instead of inventing missing evidence', () => {
    const assessment = assessPmHandoffQuality(
      makeSnapshot({
        working: {},
        episodic: [
          {
            type: 'observation',
            summary: 'Agent said hello',
            createdAt: '2026-03-22T00:00:00.000Z',
          },
        ],
      }),
    );

    expect(assessment.score).toBe(0);
    expect(assessment.results.map((result) => result.status)).toEqual(
      Array.from({ length: 6 }, () => 'needs-attention'),
    );
    expect(assessment.operatorGuidance).toContain(
      'missing one or more rubric criteria',
    );
  });

  it('ignores empty placeholder fields when scoring evidence', () => {
    const assessment = assessPmHandoffQuality(
      makeSnapshot({
        working: {
          verification: '',
          blocker: null,
          pr: undefined,
          issue: '   ',
          handoff: { verification: '', blocker: null, nested: { pr: ' ' } },
          absentSignals: { verification: false, blocker: false, pr: false },
        },
        episodic: [
          {
            type: 'observation',
            summary: 'Agent said hello',
            details: { blocker: null, verification: '' },
            createdAt: '2026-03-22T00:00:00.000Z',
          },
        ],
        checkpoint: {
          runId: 'run-1',
          phase: '2',
          step: 0,
          context: { pr: '', verification: null },
          timestamp: '2026-03-22T00:00:00.000Z',
        },
      }),
    );

    expect(assessment.score).toBe(0.17);
    expect(
      assessment.results.find((result) => result.id === 'state')?.status,
    ).toBe('pass');
    expect(
      assessment.results
        .filter((result) => result.id !== 'state')
        .every((result) => result.evidence.length === 0),
    ).toBe(true);
  });

  it('counts checkpoint labels as current-state evidence', () => {
    const assessment = assessPmHandoffQuality(
      makeSnapshot({
        working: {},
        episodic: [],
        checkpoint: {
          runId: 'run-1',
          phase: 'execution',
          step: 4,
          context: {},
          timestamp: '2026-03-22T00:00:00.000Z',
        },
      }),
    );

    const state = assessment.results.find((result) => result.id === 'state');
    expect(state?.status).toBe('pass');
    expect(state?.evidence.join(' ')).toContain('checkpoint: phase=execution');
  });

  it('accepts plural blocker and next-step headings', () => {
    const assessment = assessPmHandoffQuality(
      makeSnapshot({
        working: {
          blockers: 'none',
          nextSteps: 'run tests',
        },
        episodic: [],
      }),
    );

    expect(
      assessment.results.find((result) => result.id === 'blockers')?.status,
    ).toBe('pass');
  });

  it('requires command and outcome signals for verification evidence', () => {
    const missingOutcome = assessPmHandoffQuality(
      makeSnapshot({
        working: { task: 'build login page' },
        episodic: [],
      }),
    );
    expect(
      missingOutcome.results.find((result) => result.id === 'verification')
        ?.status,
    ).toBe('needs-attention');

    const verified = assessPmHandoffQuality(
      makeSnapshot({
        working: { verification: 'npm test passed' },
        episodic: [],
      }),
    );
    expect(
      verified.results.find((result) => result.id === 'verification')?.status,
    ).toBe('pass');
  });

  it('bounds large checkpoint context evidence in the formatted rubric', () => {
    const text = formatHandoff(
      makeSnapshot({
        working: {},
        episodic: [],
        checkpoint: {
          runId: 'run-1',
          phase: 'decision',
          step: 2,
          context: { huge: 'verified '.repeat(200) },
          timestamp: '2026-03-22T00:00:00.000Z',
        },
      }),
    );

    const checkpointEvidence = text
      .split('\n')
      .find((line) => line.includes('checkpoint: phase=decision'));
    expect(checkpointEvidence).toBeTruthy();
    expect(checkpointEvidence!.length).toBeLessThan(360);
    expect(checkpointEvidence).toContain('…');
  });
});

describe('validateAgentHandoffTemplate', () => {
  const completeTemplate = `# Agent handoff

## Scope and objective
Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.

## Current state and decisions
Summarize completed work, current phase, key decisions, and remaining work.

## Verification evidence
List deterministic commands such as tests, lint, typecheck, or build plus their pass/fail outcomes.

## Blockers and next action
State blockers, owner, exact next action, and when the receiving worker should stop.

## Artifacts and links
Point to branch, PR, worktree, diff, docs, telemetry, or other concrete artifacts.

## Learning and reuse
Capture durable lessons, Codex or CI feedback, and reusable notes for future handoffs.
`;

  it('accepts a complete markdown handoff template with actionable guidance', () => {
    const validation = validateAgentHandoffTemplate(completeTemplate);

    expect(validation.valid).toBe(true);
    expect(validation.passed).toBe(6);
    expect(validation.missingSections).toEqual([]);
    expect(
      validation.findings.every((finding) => finding.status === 'pass'),
    ).toBe(true);
    expect(validation.operatorGuidance).toContain('every required section');
  });

  it('accepts setext-style headings for required sections', () => {
    const setextTemplate = completeTemplate
      .replace('## Scope and objective', 'Scope and objective\n---')
      .replace('## Current state and decisions', 'Current state and decisions\n---')
      .replace('## Verification evidence', 'Verification evidence\n---')
      .replace('## Blockers and next action', 'Blockers and next action\n---')
      .replace('## Artifacts and links', 'Artifacts and links\n---');

    const validation = validateAgentHandoffTemplate(setextTemplate);

    expect(validation.valid).toBe(true);
  });

  it('accepts headings indented by up to three spaces', () => {
    const indentedTemplate = completeTemplate.replace(/^## /gm, '   ## ');

    const validation = validateAgentHandoffTemplate(indentedTemplate);

    expect(validation.valid).toBe(true);
  });

  it('accepts level-one headings as required sections when they contain body guidance', () => {
    const h1Template = completeTemplate.replace(/^## /gm, '# ');

    const validation = validateAgentHandoffTemplate(h1Template);

    expect(validation.valid).toBe(true);
  });

  it('returns structured missing-section findings for incomplete templates', () => {
    const validation = validateAgentHandoffTemplate(`## Scope
Name issue #1775, business goal, and out-of-scope boundaries.

## Verification
Record npm test passed or failed.
`);

    expect(validation.valid).toBe(false);
    expect(validation.missingSections).toEqual([
      'state',
      'blockers',
      'artifacts',
      'learning',
    ]);
    expect(
      validation.findings.find((finding) => finding.id === 'state')?.status,
    ).toBe('missing');
    expect(validation.operatorGuidance).toContain(
      'state, blockers, artifacts, learning',
    );
  });

  it('flags placeholder-only sections as explicit failures', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'List deterministic commands such as tests, lint, typecheck, or build plus their pass/fail outcomes.',
        '<TBD>',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(validation.missingSections).toContain('verification');
    expect(
      validation.findings.find((finding) => finding.id === 'verification'),
    ).toMatchObject({
      status: 'placeholder',
      matchedHeading: 'Verification evidence',
    });
  });

  it('rejects field labels that only point at placeholders', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        '- Issue: <issue>\n- Goal: <goal>\n- Boundaries: <out-of-scope boundaries>',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope')?.status,
    ).toBe('placeholder');
  });

  it('rejects field labels that only point at single-brace placeholders', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        '- Issue: {issue}\n- Goal: {business goal}\n- Boundaries: {out-of-scope boundaries}',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope')?.status,
    ).toBe('placeholder');
  });

  it('rejects field labels that only point at square-bracket placeholders', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        '- Issue: [issue]\n- Business goal: [goal]\n- Out-of-scope boundaries: [boundaries]',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope')?.status,
    ).toBe('placeholder');
  });

  it('rejects inline placeholder-only field fragments', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        'Issue: TODO; Goal: TODO; Boundaries: TODO',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope')?.status,
    ).toBe('placeholder');
  });

  it('rejects label-only bullet skeletons without colons', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        '- Issue/task\n- Business goal\n- Out-of-scope boundaries',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope')?.status,
    ).toBe('placeholder');
  });

  it('rejects TODO skeleton lines that repeat required keywords', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        'TODO: issue, business goal, and out-of-scope boundaries',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope')?.status,
    ).toBe('placeholder');
  });

  it('rejects dash-separated placeholder-only field fragments', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        '- Issue/task - <issue>\n- Business goal - <goal>\n- Boundaries - <boundaries>',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope')?.status,
    ).toBe('placeholder');
  });

  it('rejects variant label-only bullet skeletons', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        '- Issue details\n- Business objective\n- Boundary notes',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope')?.status,
    ).toBe('placeholder');
  });

  it('rejects combined label-only skeleton lines', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Summarize completed work, current phase, key decisions, and remaining work.',
        'Completed work, decisions, remaining work',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'state')?.status,
    ).toBe('placeholder');
  });

  it('preserves linked field values as actionable content', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        '- Issue/task: [issue #1775](../issues/1775)\n- Business goal: improve onboarding handoffs\n- Boundaries: no unrelated refactors',
      ),
    );

    expect(validation.valid).toBe(true);
  });

  it('preserves child-heading content inside a required parent section', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'List deterministic commands such as tests, lint, typecheck, or build plus their pass/fail outcomes.',
        '### Commands\n`npm test` passed with exit 0.\n### Outcome\nGreen verification evidence is recorded.',
      ),
    );

    expect(validation.valid).toBe(true);
    expect(
      validation.findings.find((finding) => finding.id === 'verification')
        ?.status,
    ).toBe('pass');
  });

  it('preserves populated child-heading labels as required content signals', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        '### Issue/task\nIssue #1775\n### Business goal\nBusiness goal: improve handoff onboarding.\n### Out-of-scope boundaries\nOut-of-scope boundaries: no unrelated refactors.'
      ),
    );

    expect(validation.valid).toBe(true);
    expect(
      validation.findings.find((finding) => finding.id === 'scope')?.status,
    ).toBe('pass');
  });

  it('requires a distinct matched section for each handoff dimension', () => {
    const validation = validateAgentHandoffTemplate(`# Agent handoff

## Scope current state verification blockers artifacts learning
Issue #1775 goal is onboarding; out-of-scope boundaries are unrelated refactors. Completed status and decisions remain pending. npm test passed. No blocker, owner PM, next action continue. PR branch docs artifact. Lesson is reusable.
`);

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope')?.status,
    ).toBe('pass');
    expect(validation.missingSections).toEqual([
      'state',
      'verification',
      'blockers',
      'artifacts',
      'learning',
    ]);
  });

  it('rejects sections that omit required content signals', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        'Write a summary for the next worker.',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope')?.status,
    ).toBe('placeholder');
  });

  it('does not count empty child headings as guidance', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        '### Issue/task\n### Business goal\n### Out-of-scope boundaries',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope')?.status,
    ).toBe('placeholder');
  });

  it('does not count placeholder child heading bodies as guidance', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        '### Issue/task\nPlease fill in\n### Business goal\nTODO\n### Out-of-scope boundaries\n{boundaries}',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope')?.status,
    ).toBe('placeholder');
  });

  it('does not use empty child headings to satisfy required content patterns', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        'Please complete this\n### Issue/task\n### Business goal\n### Out-of-scope boundaries',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope')?.status,
    ).toBe('placeholder');
  });

  it('requires none to be attached to blocker or risk state', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'State blockers, owner, exact next action, and when the receiving worker should stop.',
        'Owner: none. Next action: continue.',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'blockers')?.status,
    ).toBe('placeholder');
  });

  it('ignores fenced example headings when extracting real sections', () => {
    const validation = validateAgentHandoffTemplate(`
# Example handoff

\`\`\`md
## Scope and objective
Name the issue, business goal, and out-of-scope boundaries.
## Current state and decisions
Summarize status.
## Verification evidence
List tests.
## Blockers and next action
State owner and next action.
## Artifacts and links
Link PR.
## Learning and reuse
Capture lesson.
\`\`\`
`);

    expect(validation.valid).toBe(false);
    expect(validation.missingSections).toEqual(
      expect.arrayContaining(['scope', 'state', 'verification']),
    );
  });

  it('does not let a top-level title inherit unrelated child sections', () => {
    const validation = validateAgentHandoffTemplate(`
# Agent handoff objective

## Current state and decisions
Status: implementation done. Decision: keep validator strict.

## Verification evidence
Command: npm test. Outcome: passed.

## Blockers and next action
Owner: next worker. Next action: review the PR.

## Artifacts and links
PR: https://github.com/djm204/frankenbeast/pull/2331. Branch: resolve/issue-1775.

## Learning and reuse
Lesson: placeholder skeletons must fail validation.
`);

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope'),
    ).toMatchObject({ status: 'placeholder' });
  });

  it('ignores fenced example content when checking required section guidance', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'List deterministic commands such as tests, lint, typecheck, or build plus their pass/fail outcomes.',
        '```md\nnpm test passed with exit 0.\n```',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'verification')
        ?.status,
    ).toBe('placeholder');
  });

  it('strips empty table skeletons before checking required content', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        '| Issue | Business goal | Out-of-scope boundaries |\n| --- | --- | --- |',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope')?.status,
    ).toBe('placeholder');
  });

  it('prefers later usable sections over earlier matching placeholders', () => {
    const validation = validateAgentHandoffTemplate(`## Goal
<TBD>

${completeTemplate}`);

    expect(validation.valid).toBe(true);
    expect(
      validation.findings.find((finding) => finding.id === 'scope')
        ?.matchedHeading,
    ).toBe('Scope and objective');
  });

  it('respects the opening fence delimiter when scanning sections', () => {
    const validation = validateAgentHandoffTemplate(
      [
        'Example only:',
        '````md',
        '## Scope and objective',
        'Issue #1775, business goal, and out-of-scope boundaries.',
        '```ts',
        "const heading = '## nested example';",
        '```',
        '````',
        '',
        completeTemplate,
      ].join('\n'),
    );

    expect(validation.valid).toBe(true);
    expect(
      validation.findings.find((finding) => finding.id === 'scope')
        ?.matchedHeading,
    ).toBe('Scope and objective');
  });

  it('rejects decorated label-only fields', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        '- Issue/task (required):\n- Business goal (required):\n- Out-of-scope boundaries (required):',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope')?.status,
    ).toBe('placeholder');
  });

  it('preserves populated table rows as verification evidence', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'List deterministic commands such as tests, lint, typecheck, or build plus their pass/fail outcomes.',
        '| Command | Outcome |\n| --- | --- |\n| npm test | passed |',
      ),
    );

    expect(validation.valid).toBe(true);
  });

  it('preserves populated table headers as required content signals', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        '| Issue/task | Business goal | Boundaries |\n| --- | --- | --- |\n| #1775 | Improve onboarding | No unrelated refactors |',
      ),
    );

    expect(validation.valid).toBe(true);
    expect(
      validation.findings.find((finding) => finding.id === 'scope')?.status,
    ).toBe('pass');
  });

  it('rejects blank table rows with label-only cells regardless of case', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate
        .replace(
          'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
          '| Issue | |\n| Business Goal | |\n| Boundaries | |',
        )
        .replace(
          'List deterministic commands such as tests, lint, typecheck, or build plus their pass/fail outcomes.',
          '| Test Command | |\n| Outcome | |',
        ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope')?.status,
    ).toBe('placeholder');
    expect(
      validation.findings.find((finding) => finding.id === 'verification')
        ?.status,
    ).toBe('placeholder');
  });

  it('rejects populated-looking table rows whose cells are placeholders', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        '| Issue/task | Business goal | Boundaries |\n| --- | --- | --- |\n| <issue> | {goal} | [boundaries] |',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope'),
    ).toMatchObject({ status: 'placeholder' });
  });

  it('rejects dash-only table rows as placeholder values', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        '| Issue/task | Business goal | Boundaries |\n| --- | --- | --- |\n| - | - | - |',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope'),
    ).toMatchObject({ status: 'placeholder' });
  });

  it('requires populated values for every required table field', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        '| Issue/task | Business goal | Boundaries |\n| --- | --- | --- |\n| #1775 | - | - |',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope'),
    ).toMatchObject({ status: 'placeholder' });
  });

  it('rejects table rows that repeat labels as values', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        '| Issue/task | Business goal | Out-of-scope boundaries |\n| --- | --- | --- |\n| Issue/task | Business goal | Out-of-scope boundaries |',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope'),
    ).toMatchObject({ status: 'placeholder' });
  });

  it('accepts a singular Branch heading for artifact guidance', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate
        .replace('## Artifacts and links', '## Branch')
        .replace(
          'Point to branch, PR, worktree, diff, docs, telemetry, or other concrete artifacts.',
          'Record branch resolve/issue-1775, PR #2331, and worktree artifact links.',
        ),
    );

    expect(validation.valid).toBe(true);
    expect(
      validation.findings.find((finding) => finding.id === 'artifacts')
        ?.matchedHeading,
    ).toBe('Branch');
  });

  it('accepts a PR heading for artifact guidance', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate
        .replace('## Artifacts and links', '## PR / diff')
        .replace(
          'Point to branch, PR, worktree, diff, docs, telemetry, or other concrete artifacts.',
          'Record PR #2331, branch resolve/issue-1775, and diff artifact links.',
        ),
    );

    expect(validation.valid).toBe(true);
    expect(
      validation.findings.find((finding) => finding.id === 'artifacts')
        ?.matchedHeading,
    ).toBe('PR / diff');
  });

  it('does not consume an overlapping placeholder heading before a later matching requirement', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate
        .replace(
          '## Current state and decisions\nSummarize completed work, current phase, key decisions, and remaining work.\n\n',
          '',
        )
        .replace(
          '## Blockers and next action\nState blockers, owner, exact next action, and when the receiving worker should stop.',
          '## Status and next steps\nNo blockers; owner PM; next action continue.',
        ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'state')?.status,
    ).toBe('missing');
    expect(
      validation.findings.find((finding) => finding.id === 'blockers')?.status,
    ).toBe('pass');
  });

  it('reserves underspecified overlapping headings for their own requirement', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate
        .replace(
          '## Current state and decisions\nSummarize completed work, current phase, key decisions, and remaining work.\n\n',
          '',
        )
        .replace(
          '## Blockers and next action\nState blockers, owner, exact next action, and when the receiving worker should stop.',
          '## Status and next steps\nNo blockers; next action continue.',
        ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'state')?.status,
    ).toBe('missing');
    expect(
      validation.findings.find((finding) => finding.id === 'blockers'),
    ).toMatchObject({ status: 'placeholder', matchedHeading: 'Status and next steps' });
  });

  it('preserves markdown link text when checking artifact guidance', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Point to branch, PR, worktree, diff, docs, telemetry, or other concrete artifacts.',
        'Link the [PR](../pull/123) and [runbook](../runbook) for inspectable artifacts.',
      ),
    );

    expect(validation.valid).toBe(true);
  });

  it('preserves reference-style markdown link text when checking artifact guidance', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Point to branch, PR, worktree, diff, docs, telemetry, or other concrete artifacts.',
        'See [PR][pr] and [docs][docs] for inspectable artifact references.\n\n[pr]: ../pull/123\n[docs]: ../docs',
      ),
    );

    expect(validation.valid).toBe(true);
  });

  it('preserves markdown autolinks as artifact evidence', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Point to branch, PR, worktree, diff, docs, telemetry, or other concrete artifacts.',
        '<https://github.com/org/repo/pull/123>',
      ),
    );

    expect(validation.valid).toBe(true);
  });

  it('rejects generic filler plus empty child headings as scope guidance', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        'Please complete this.\n\n### Issue/task\n### Business goal\n### Out-of-scope boundaries',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope'),
    ).toMatchObject({ status: 'placeholder' });
  });

  it('accepts required sections written as populated H1 headings', () => {
    const validation = validateAgentHandoffTemplate(`# Scope and objective
Name issue #1775, business goal, and out-of-scope boundaries.

# Current state and decisions
Completed validation change; decisions are documented; remaining work is review.

# Verification evidence
Run npm test and record passed outcome.

# Blockers and next action
Blockers: none. Owner: PM. Next action: continue.

# Artifacts and links
PR #2331 and branch resolve/issue-1775 are artifact links.

# Learning and reuse
Lesson: codex review feedback is reusable.
`);

    expect(validation.valid).toBe(true);
  });

  it('requires none to appear in a blocker or risk context', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'State blockers, owner, exact next action, and when the receiving worker should stop.',
        'Owner: none. Next action: continue.',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'blockers'),
    ).toMatchObject({ status: 'placeholder' });
  });

  it('rejects table rows that repeat field labels as values', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate.replace(
        'Name the issue, business goal, and out-of-scope boundaries so the next worker does not rediscover intent.',
        '| Field | Value |\n| --- | --- |\n| Issue/task | Issue/task |\n| Business goal | Business goal |\n| Out-of-scope boundaries | Out-of-scope boundaries |',
      ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'scope'),
    ).toMatchObject({ status: 'placeholder' });
  });

  it('rejects combined label-only skeleton lines', () => {
    const validation = validateAgentHandoffTemplate(
      completeTemplate
        .replace(
          'Summarize completed work, current phase, key decisions, and remaining work.',
          'Completed work, decisions, remaining work',
        )
        .replace(
          'List deterministic commands such as tests, lint, typecheck, or build plus their pass/fail outcomes.',
          'Test command / outcome',
        ),
    );

    expect(validation.valid).toBe(false);
    expect(
      validation.findings.find((finding) => finding.id === 'state'),
    ).toMatchObject({ status: 'placeholder' });
    expect(
      validation.findings.find((finding) => finding.id === 'verification'),
    ).toMatchObject({ status: 'placeholder' });
  });
});

describe('truncateSnapshot', () => {
  it('returns snapshot unchanged when within budget', () => {
    const snapshot = makeSnapshot();
    const truncated = truncateSnapshot(snapshot, 10_000);
    expect(truncated.episodic).toEqual(snapshot.episodic);
    expect(truncated.working).toEqual(snapshot.working);
  });

  it('trims episodic events oldest-first to fit budget', () => {
    const events = Array.from({ length: 50 }, (_, i) => ({
      type: 'observation' as const,
      summary: `Step ${i}: ${'x'.repeat(200)}`,
      createdAt: '2026-03-22T00:00:00.000Z',
    }));
    const snapshot = makeSnapshot({ episodic: events });
    const truncated = truncateSnapshot(snapshot, 500);

    expect(truncated.episodic.length).toBeLessThan(50);
    // Most recent events are kept
    expect(
      truncated.episodic[truncated.episodic.length - 1]!.summary,
    ).toContain('Step 49');
    // Oldest events are removed
    expect(truncated.episodic[0]!.summary).not.toContain('Step 0');
  });

  it('trims working memory largest-values-first after episodic', () => {
    const snapshot = makeSnapshot({
      episodic: [],
      working: {
        small: 'tiny',
        large: 'x'.repeat(5000),
        medium: 'y'.repeat(500),
      },
    });
    const truncated = truncateSnapshot(snapshot, 500);
    const workingKeys = Object.keys(
      truncated.working as Record<string, unknown>,
    );

    // Largest value should be removed first
    expect(workingKeys).not.toContain('large');
    // Small values preserved
    expect(workingKeys).toContain('small');
  });

  it('preserves version, metadata, and checkpoint', () => {
    const snapshot = makeSnapshot({
      episodic: Array.from({ length: 100 }, (_, i) => ({
        type: 'observation' as const,
        summary: `Step ${i}: ${'x'.repeat(200)}`,
        createdAt: '2026-03-22T00:00:00.000Z',
      })),
      checkpoint: {
        runId: 'run-1',
        phase: 'execution',
        step: 5,
        context: {},
        timestamp: '2026-03-22T00:00:00.000Z',
      },
    });
    const truncated = truncateSnapshot(snapshot, 500);

    expect(truncated.version).toBe(1);
    expect(truncated.metadata.lastProvider).toBe('claude-cli');
    expect(truncated.checkpoint?.phase).toBe('execution');
  });

  it('does not mutate the original snapshot', () => {
    const events = Array.from({ length: 50 }, (_, i) => ({
      type: 'observation' as const,
      summary: `Step ${i}: ${'x'.repeat(200)}`,
      createdAt: '2026-03-22T00:00:00.000Z',
    }));
    const snapshot = makeSnapshot({ episodic: events });
    truncateSnapshot(snapshot, 500);

    expect(snapshot.episodic).toHaveLength(50);
  });

  it('keeps formatted output within a tight 300-token budget after trimming', () => {
    const snapshot = makeSnapshot({
      episodic: Array.from({ length: 50 }, (_, i) => ({
        type: 'observation' as const,
        summary: `Step ${i}: ${'x'.repeat(200)}`,
        createdAt: '2026-03-22T00:00:00.000Z',
      })),
      working: {
        task: 'fix auth',
        huge: 'x'.repeat(5000),
      },
    });
    const text = formatHandoff(truncateSnapshot(snapshot, 300));

    expect(text.length).toBeLessThanOrEqual(300 * 4);
  });

  it('produces valid output that formatHandoff can render', () => {
    const snapshot = makeSnapshot({
      episodic: Array.from({ length: 50 }, (_, i) => ({
        type: 'observation' as const,
        summary: `Step ${i}: ${'x'.repeat(200)}`,
        createdAt: '2026-03-22T00:00:00.000Z',
      })),
    });
    const truncated = truncateSnapshot(snapshot, 500);
    const text = formatHandoff(truncated);

    expect(text).toContain('--- BRAIN STATE HANDOFF ---');
    expect(text).toContain('--- END HANDOFF ---');
  });
});
