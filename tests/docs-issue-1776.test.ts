import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

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

describe('issue #1776 newcomer architecture reading path', () => {
  it('adds a dedicated ordered architecture reading path to onboarding', () => {
    const onboarding = readText('ONBOARDING.md');
    const section = sectionBetween(onboarding, '## Architecture reading path', '## Run UI');

    const orderedSteps = [
      '[`docs/RAMP_UP.md`](docs/RAMP_UP.md)',
      '[`README.md#architecture`](README.md#architecture)',
      '[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)',
      '[`docs/DATA_FLOW.md`](docs/DATA_FLOW.md)',
      '[`docs/CONTRACT_MATRIX.md`](docs/CONTRACT_MATRIX.md)',
      '[ADR-031](docs/adr/031-architecture-consolidation-provider-agnostic.md)',
    ];

    let previousIndex = -1;
    for (const step of orderedSteps) {
      const index = section.indexOf(step);
      expect(index, `${step} is missing from architecture reading path`).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }

    expect(section).toContain('Current implementation before history');
    expect(section).toContain('Use the package inventory tables as authoritative');
  });

  it('documents the edge case for target-state diagrams and historical plans', () => {
    const section = sectionBetween(readText('ONBOARDING.md'), '## Architecture reading path', '## Run UI');

    expect(section).toContain('Do not start with `docs/plans/`');
    expect(section).toContain('target or historical architecture');
    expect(section).toContain('verify it against the current package inventory');
  });

  it('links the newcomer path from the README onboarding entrypoint', () => {
    const readme = readText('README.md');

    expect(readme).toContain('[Architecture reading path](ONBOARDING.md#architecture-reading-path)');
    expect(readme).toContain('current implementation docs before historical plans');
  });
});
