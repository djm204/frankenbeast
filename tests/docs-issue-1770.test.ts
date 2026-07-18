import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const guidePath = 'docs/onboarding/coding-agent-pr-etiquette.md';

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

describe('issue #1770 coding-agent PR etiquette guide', () => {
  it('links the dedicated PR etiquette guide from onboarding and the README onboarding entrypoint', () => {
    const onboarding = readText('ONBOARDING.md');
    const readme = readText('README.md');

    expect(onboarding).toContain('[coding-agent PR etiquette guide](docs/onboarding/coding-agent-pr-etiquette.md)');
    expect(onboarding).toContain('before opening, updating, or merging agent-authored pull requests');
    expect(readme).toContain('[coding-agent PR etiquette guide](docs/onboarding/coding-agent-pr-etiquette.md)');
  });

  it('documents deterministic PR body fields, review flow, and handoff evidence for agents', () => {
    const guide = readText(guidePath);

    for (const requiredHeading of [
      '# Coding-agent PR etiquette guide',
      '## Fast checklist',
      '## Required PR body fields',
      '## Review and update etiquette',
      '## Coordinator and worker handoff notes',
      '## Maintainer review cues',
    ]) {
      expect(guide).toContain(requiredHeading);
    }

    for (const requiredEvidence of [
      'one issue, one branch, and one PR',
      'Conventional Commit',
      'Closes #<issue-number>',
      'Ownership entries:',
      '`onboarding-docs` is the expected ownership surface',
      'Codex: current-head clean | not required | blocked: <reason>',
      'Next safe command:',
      'Verification already run:',
    ]) {
      expect(guide).toContain(requiredEvidence);
    }
  });

  it('keeps negative etiquette cases explicit so agents do not duplicate PRs or merge stale review states', () => {
    const guide = readText(guidePath);

    for (const guardrail of [
      'Do not combine unrelated issues in one PR',
      'Do not open a second PR for the same issue',
      'Do not merge on Codex silence, usage-limit text, an `eyes` reaction, resolved old threads, or an all-clear from an older head.',
      'Do not use vague verification lines',
      'Do not broaden a documentation-only onboarding issue into runtime behavior',
      "Do not delete or overwrite another worker's dirty worktree",
    ]) {
      expect(guide).toContain(guardrail);
    }
  });
});
