import { describe, expect, it } from 'vitest';
import { validateWizardStep } from '../../../src/components/beasts/wizard-validation';

describe('wizard validation', () => {
  it('accepts backend-aligned design-interview fields', () => {
    const errors = validateWizardStep(1, {
      1: { workflowType: 'design-interview', goal: 'Draft billing design', outputPath: 'docs/billing.md' },
    });

    expect(errors).toEqual({});
  });

  it('rejects design-interview when backend-required fields are missing', () => {
    const errors = validateWizardStep(1, {
      1: { workflowType: 'design-interview', goal: '   ' },
    });

    expect(errors).toEqual({
      goal: 'Design interview goal is required.',
      outputPath: 'Design interview output path is required.',
    });
  });

  it('accepts repo-relative Markdown chunk-plan design docs', () => {
    const errors = validateWizardStep(1, {
      1: { workflowType: 'chunk-plan', designDocPath: 'docs/design.md', outputDir: 'tasks/chunks' },
    });

    expect(errors).toEqual({});
  });

  it('accepts legacy design-interview topic alias from restored wizard state', () => {
    const errors = validateWizardStep(1, {
      1: { workflowType: 'design-interview', topic: 'Legacy goal', outputPath: 'docs/design.md' },
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
      1: { workflowType: 'chunk-plan', designDocPath: docPath, outputDir: 'tasks/chunks' },
    });

    expect(errors.designDocPath).toBe('Design doc path must be a repo-relative Markdown file without traversal.');
  });

  it('accepts backend-aligned martin-loop fields', () => {
    const errors = validateWizardStep(1, {
      1: { workflowType: 'martin-loop', provider: 'codex', objective: 'Implement chunks', chunkDirectory: 'tasks/chunks' },
    });

    expect(errors).toEqual({});
  });

  it('rejects martin-loop when backend-required fields are missing', () => {
    const errors = validateWizardStep(1, {
      1: { workflowType: 'martin-loop', provider: '', objective: '   ' },
    });

    expect(errors).toEqual({
      provider: 'Provider is required.',
      objective: 'Objective is required.',
      chunkDir: 'Chunk directory path is required.',
    });
  });
});
