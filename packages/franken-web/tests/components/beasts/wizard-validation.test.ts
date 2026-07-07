import { describe, expect, it } from 'vitest';
import { validateWizardStep } from '../../../src/components/beasts/wizard-validation';

describe('wizard validation', () => {
  it('accepts repo-relative Markdown chunk-plan design docs', () => {
    const errors = validateWizardStep(1, {
      1: { workflowType: 'chunk-plan', docPath: 'docs/design.md', outputDir: 'tasks/chunks' },
    });

    expect(errors).toEqual({});
  });

  it.each([
    '/tmp/design.md',
    'C:\\tmp\\design.md',
    '../secret.md',
    'docs/../secret.md',
    'docs/design.txt',
    'docs/design.md\0',
  ])('rejects unsafe chunk-plan design doc path %s', (docPath) => {
    const errors = validateWizardStep(1, {
      1: { workflowType: 'chunk-plan', docPath, outputDir: 'tasks/chunks' },
    });

    expect(errors.docPath).toBe('Design doc path must be a repo-relative Markdown file without traversal.');
  });
});
