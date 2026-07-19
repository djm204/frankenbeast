import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

function runFixture(scenario: string): unknown {
  const output = execFileSync('node', ['scripts/provider-outage-drill-fixture.mjs', '--scenario', scenario], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return JSON.parse(output) as unknown;
}

describe('issue #1722 provider outage recovery drill docs', () => {
  it('documents all required provider outage drill phases and safeguards', () => {
    const doc = readText('docs/dr/provider-outage-recovery-drill.md');

    for (const requiredText of [
      '# Provider outage recovery drill',
      '## Drill goals',
      '## Preconditions',
      '## Read-only fixture commands',
      '### Phase 1 — Primary failure declared',
      '### Phase 2 — Fallback-only mode',
      '### Phase 3 — Recovery probe',
      '### Phase 4 — Resume order',
      '## Expected fixture output',
      '## Decision log',
      '## Pass/fail criteria',
      'Fresh issue starts did not starve in-flight backlog.',
      'High-risk work stayed parked until explicit recovery or human approval.',
    ]) {
      expect(doc).toContain(requiredText);
    }
  });

  it('keeps default commands read-only or fixture/sandbox-based', () => {
    const doc = readText('docs/dr/provider-outage-recovery-drill.md');

    expect(doc).toContain('do not start workers, modify Kanban state, post to GitHub, trigger Codex, merge PRs, or replay approvals');
    expect(doc).toContain('node scripts/provider-outage-drill-fixture.mjs --scenario provider-outage');
    expect(doc).toContain('node scripts/provider-outage-drill-fixture.mjs --scenario recovery');
    expect(doc).toContain('Optional read-only live inventory commands');
    expect(doc).toContain('Do not run commands that start, unblock, merge, force-push, delete branches, replay approvals, or post `@codex review`');
  });

  it('links the drill from adjacent availability and DR docs', () => {
    const issueGuide = readText('docs/guides/fix-github-issues.md');
    const incidentChecklist = readText('docs/dr/incident-command-checklist.md');
    const coordinationGlossary = readText('docs/onboarding/agent-coordination-runtime-glossary.md');
    const drill = readText('docs/dr/provider-outage-recovery-drill.md');

    expect(issueGuide).toContain('docs/dr/provider-outage-recovery-drill.md');
    expect(incidentChecklist).toContain('provider-outage-recovery-drill.md');
    expect(coordinationGlossary).toContain('../dr/provider-outage-recovery-drill.md');
    expect(drill).toContain('../guides/fix-github-issues.md#backpressure');
    expect(drill).toContain('incident-command-checklist.md');
    expect(drill).toContain('../onboarding/agent-coordination-runtime-glossary.md');
    expect(drill).toContain('../guides/add-llm-provider.md');
  });

  it('prints deterministic fixture output for outage and recovery comparisons', () => {
    const outage = runFixture('provider-outage') as {
      scenario: string;
      safety: { mutatesState: boolean };
      events: Array<{ type: string; routes?: Array<{ route: string }> }>;
      failureInterpretations: string[];
    };
    const recovery = runFixture('recovery') as {
      scenario: string;
      safety: { mutatesState: boolean };
      events: Array<{ type: string; steps?: string[] }>;
      failureInterpretations: string[];
    };

    expect(outage.scenario).toBe('provider-outage');
    expect(outage.safety.mutatesState).toBe(false);
    expect(outage.events.map((event) => event.type)).toEqual([
      'provider_outage_declared',
      'fresh_start_freeze',
      'fallback_only_mode',
      'backlog_routes',
    ]);
    expect(outage.events.at(-1)?.routes?.map((route) => route.route)).toEqual([
      'resume-checkpointed',
      'complete-checkpointed',
      'defer-fresh-start',
    ]);
    expect(outage.failureInterpretations.join('\n')).toContain('backlog-starvation');
    expect(outage.failureInterpretations.join('\n')).toContain('unsafe gate bypass');

    expect(recovery.scenario).toBe('recovery');
    expect(recovery.safety.mutatesState).toBe(false);
    expect(recovery.events.map((event) => event.type)).toEqual([
      'recovery_probe_started',
      'recovery_probe_passed',
      'resume_order',
      'normal_refill_restored',
    ]);
    expect(recovery.events[2]?.steps).toContain('finish or harden in-flight backlog before fresh issues');
    expect(recovery.failureInterpretations.join('\n')).toContain('aggressive resume ordering');
  });

  it('covers issue #1681 fallback paths without live provider calls', () => {
    const drill = runFixture('fallback-paths') as {
      scenario: string;
      safety: { mutatesState: boolean; liveProviderCalls: boolean };
      fixtures: Array<{ name: string }>;
      transitions: Array<{
        from: string;
        to: string;
        trigger: string;
        route: string;
        workerCounts: { primary: number; spark: number; ollama: number; parked: number };
        parkedBacklog?: string[];
        toolRestrictions?: string[];
        refillDecision?: string;
        resumeOrdering?: string[];
      }>;
      summaryLines: string[];
    };

    expect(drill.scenario).toBe('fallback-paths');
    expect(drill.safety.mutatesState).toBe(false);
    expect(drill.safety.liveProviderCalls).toBe(false);
    expect(drill.fixtures.map((fixture) => fixture.name)).toEqual([
      'primary-unavailable',
      'spark-budget-exhausted',
      'ollama-only-continuity',
      'primary-restored',
    ]);
    expect(drill.transitions.map((transition) => transition.trigger)).toEqual([
      'primary unavailable',
      'Spark budget exhausted',
      'Ollama fallback continuity',
      'primary restored',
    ]);
    expect(drill.transitions[0]?.parkedBacklog).toEqual(['fresh-issue-starts', 'unsafe-merge-gates']);
    expect(drill.transitions[1]?.refillDecision).toBe('do-not-refill-spark; keep backlog parked');
    expect(drill.transitions[2]?.toolRestrictions).toEqual([
      'read-only-inventory',
      'docs-only-updates',
      'status-summary',
      'checkpointed-closeout-only',
    ]);
    expect(drill.transitions[2]?.workerCounts).toEqual({ primary: 0, spark: 0, ollama: 5, parked: 12 });
    expect(drill.transitions[3]?.resumeOrdering).toEqual([
      'unpark-provider-blocked-active-owners',
      'finish-in-flight-before-fresh-issues',
      'rerun-current-head-gates',
      'restore-primary-refill-after-stability-tick',
    ]);
    expect(drill.summaryLines.join('\n')).toContain('primary=0 spark=0 ollama=5 parked=12');
  });
});
