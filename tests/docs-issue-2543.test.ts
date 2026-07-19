import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const onboardingDir = resolve(ROOT, 'docs/onboarding');

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

describe('issue #2543 onboarding guide index', () => {
  it('is linked from both public onboarding entrypoints', () => {
    expect(readText('README.md')).toContain('[onboarding guide index](docs/onboarding/README.md)');
    expect(readText('ONBOARDING.md')).toContain('[Onboarding guide index](docs/onboarding/README.md)');
  });

  it('routes first-time users by goal and provides a fallback chooser', () => {
    const index = readText('docs/onboarding/README.md');

    for (const expected of [
      '# Onboarding guide index',
      '## Choose by goal',
      'Run Frankenbeast locally',
      'Make a first code or docs contribution',
      'Take one issue through a first PR',
      'Practice before editing production code',
      'Find the package that owns a change',
      'Assign or recover agent work',
      'Understand merge, release, and deployment ownership',
      '## Still unsure?',
      '[persona chooser](persona-quickstart-tracks.md#persona-chooser)',
    ]) {
      expect(index).toContain(expected);
    }
  });

  it('lists every onboarding guide so new references remain discoverable', () => {
    const index = readText('docs/onboarding/README.md');
    const guideFiles = readdirSync(onboardingDir)
      .filter((name) => name.endsWith('.md') && name !== 'README.md')
      .sort();

    expect(guideFiles.length).toBeGreaterThan(0);
    for (const guideFile of guideFiles) {
      expect(index, `Missing onboarding index link for ${guideFile}`).toContain(`](${guideFile})`);
    }
  });
});