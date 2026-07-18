import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

function readDoc(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

describe('issue #1733 issue complexity rubric docs', () => {
  it('defines at least five routing levels with examples, toolsets, model lanes, and escalation triggers', () => {
    const rubric = readDoc('docs/onboarding/issue-complexity-rubric.md');

    const levelMatches = [...rubric.matchAll(/^\| C[0-5] — /gm)];
    expect(levelMatches.length).toBeGreaterThanOrEqual(5);

    expect(rubric).toContain('| Level | Use when | Examples | Allowed toolsets | Recommended model lane | Verification depth | Escalate when |');
    expect(rubric).toContain('C0 — Triage / no-code');
    expect(rubric).toContain('C5 — System / agent coordination / release-critical');
    expect(rubric).toContain('Low-risk fallback agents must not implement C3–C5 work.');
  });

  it('explains label mapping without treating priority as complexity', () => {
    const rubric = readDoc('docs/onboarding/issue-complexity-rubric.md');

    for (const label of ['docs', 'documentation', 'dx', 'security', 'availability', 'stability', 'dr', 'memory', 'learning']) {
      expect(rubric).toContain(label);
    }

    expect(rubric).toContain('Priority labels (`P0`, `P1`, `P2`, etc.)');
    expect(rubric).toContain('Priority controls ordering; complexity controls lane assignment and verification depth.');
  });

  it('classifies one existing issue from each strategic issue topic', () => {
    const rubric = readDoc('docs/onboarding/issue-complexity-rubric.md');

    for (const issue of ['#1733', '#1739', '#1740', '#1745', '#1750', '#1752', '#1758', '#1762']) {
      expect(rubric).toContain(issue);
    }

    for (const topic of [
      'Onboarding',
      'Security',
      'Vulnerabilities',
      'Stability',
      'Availability',
      'Disaster recovery',
      'Persistent memory for agents',
      'Learning for agents',
    ]) {
      expect(rubric).toContain(`| ${topic} |`);
    }
  });

  it('links the rubric from onboarding and issue workflow entrypoints', () => {
    const onboarding = readDoc('ONBOARDING.md');
    const rampUp = readDoc('docs/RAMP_UP.md');
    const issueGuide = readDoc('docs/guides/fix-github-issues.md');

    expect(onboarding).toContain('docs/onboarding/issue-complexity-rubric.md');
    expect(rampUp).toContain('issue complexity rubric');
    expect(issueGuide).toContain('../onboarding/issue-complexity-rubric.md');
  });
});
