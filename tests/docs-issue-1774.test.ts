import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readDoc = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');

const guidePath = 'docs/guides/troubleshooting-stalled-workers.md';

describe('issue #1774 stalled-worker onboarding guide', () => {
  it('links the dedicated stalled-worker troubleshooting guide from onboarding', () => {
    const onboarding = readDoc('ONBOARDING.md');

    expect(onboarding).toContain('[troubleshooting guide for stalled workers](docs/guides/troubleshooting-stalled-workers.md)');
    expect(onboarding).toContain('before respawning or deleting worktrees');
  });

  it('documents deterministic evidence, classifications, and handoff fields for stalled workers', () => {
    const guide = readDoc(guidePath);

    for (const requiredHeading of [
      '# Troubleshooting stalled workers',
      '## Fast triage checklist',
      '## Classification table',
      '## Read-only evidence to collect first',
      '## Recovery actions by outcome',
      '## Handoff template',
    ]) {
      expect(guide).toContain(requiredHeading);
    }

    for (const classification of [
      'Active worker',
      'Blocked worker',
      'Stale worker',
      'In-flight recovery',
      'Unsafe to touch',
    ]) {
      expect(guide).toContain(classification);
    }

    for (const evidence of [
      'Kanban task id',
      'heartbeat timestamp',
      'open PRs',
      'worktree',
      'Codex',
      'statusCheckRollup',
    ]) {
      expect(guide).toContain(evidence);
    }

    expect(guide).toContain('Classification: active | blocked | stale | in-flight recovery | unsafe');
    expect(guide).toContain('Next safe command:');
  });

  it('keeps negative recovery guidance explicit so stale checks do not create duplicate work', () => {
    const guide = readDoc(guidePath);

    for (const guardrail of [
      'Do not create a duplicate card, branch, worktree, or PR.',
      'Do not merge on Codex silence, usage-limit text, or an all-clear from an older head.',
      'Do not respawn a worker just because a PM liveness file is stale',
      'Do not delete dirty worktrees until their commits are pushed',
      'Do not broaden a one-issue worker into adjacent issues while recovering it.',
    ]) {
      expect(guide).toContain(guardrail);
    }
  });
});
