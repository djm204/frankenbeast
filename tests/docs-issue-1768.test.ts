import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const glossaryPath = 'docs/onboarding/pm-swarm-runtime-glossary.md';

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

function sectionBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex, `${start} section is missing`).toBeGreaterThanOrEqual(0);

  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `${end} section is missing after ${start}`).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

describe('issue #1768 PM-swarm runtime glossary', () => {
  it('adds a dedicated glossary with stable runtime terms and operator actions', () => {
    const glossary = readText(glossaryPath);

    for (const heading of [
      '# PM-swarm runtime glossary',
      '## Quick use',
      '## Runtime term table',
      '## Negative and edge-case guidance',
      '## Handoff checklist',
    ]) {
      expect(glossary).toContain(heading);
    }

    for (const term of [
      '| PM shard |',
      '| Worker card |',
      '| Root blackboard |',
      '| Liveness check |',
      '| Refill |',
      '| `worker_ids` |',
      '| Active PR guard |',
      '| Codex gate |',
      '| Approval-cop |',
      '| Doctor card |',
      '| Shared lessons file |',
    ]) {
      expect(glossary).toContain(term);
    }

    expect(glossary).toContain('What it means');
    expect(glossary).toContain('What to do when you see it');
  });

  it('documents negative cases so operators do not create duplicate work or stale gates', () => {
    const glossary = readText(glossaryPath);
    const negativeGuidance = sectionBetween(glossary, '## Negative and edge-case guidance', '## Handoff checklist');

    for (const guardrail of [
      'Do not start a second branch, worktree, or PR for the same issue',
      'Do not merge on Codex silence, an eyes reaction, or a clean response from an older head',
      'Do not treat `worker_ids` as a historical audit log',
      'Do not use approval-cop to invent a missing command',
      'Do not roll a completed worker into the next issue',
    ]) {
      expect(negativeGuidance).toContain(guardrail);
    }
  });

  it('links the glossary from onboarding and the README onboarding entrypoint', () => {
    const onboarding = readText('ONBOARDING.md');
    const readme = readText('README.md');

    expect(onboarding).toContain('[PM-swarm runtime glossary](docs/onboarding/pm-swarm-runtime-glossary.md)');
    expect(onboarding).toContain('decode liveness, refill, Codex, approval-cop, and worker handoff terms');
    expect(readme).toContain('[PM-swarm runtime glossary](ONBOARDING.md#pm-swarm-runtime-glossary)');
  });
});
