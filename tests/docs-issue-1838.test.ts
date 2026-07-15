import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');

describe('issue #1838 disaster tabletop exercise template', () => {
  const template = () => read('docs/dr/tabletop-exercise-template.md');

  it('documents a complete operator tabletop workflow for restore-preview exercises', () => {
    const doc = template();

    for (const section of [
      '# Disaster tabletop exercise template',
      '## Exercise metadata',
      '## Preconditions',
      '## Scenario prompt',
      '## Injects',
      '## Facilitation steps',
      '## Decision log',
      '## Edge-case checklist',
      '## After-action summary',
      '## Pass/fail criteria',
    ]) {
      expect(doc).toContain(section);
    }

    for (const requiredField of [
      'Backup manifest',
      'Live manifest',
      'Communication channel',
      'restore',
      'merge',
      'skip',
      'quarantine',
    ]) {
      expect(doc).toContain(requiredField);
    }
  });

  it('covers success and fail-closed edge cases without allowing destructive restore practice', () => {
    const doc = template();

    expect(doc).toContain('Backup-only cron job');
    expect(doc).toContain('Corrupt backup manifest');
    expect(doc).toContain('fails closed');
    expect(doc).toContain('No production restore, force-push, branch deletion, or secret export occurred during the tabletop.');
    expect(doc).toContain('no restore command will be executed');
    expect(doc).not.toContain('run the restore command against production');
  });

  it('links the template from the restore-preview disaster-recovery documentation', () => {
    const restorePreview = read('docs/dr/restore-preview.md');

    expect(restorePreview).toContain('docs/dr/tabletop-exercise-template.md');
    expect(restorePreview).toContain('read-only');
    expect(restorePreview).toContain('fail-closed edge case');
  });
});
