import { describe, expect, it } from 'vitest';
import { buildWizardLaunchConfig } from './wizard-launch-config';

describe('buildWizardLaunchConfig', () => {
  it('maps design interview fields to backend init config keys', () => {
    expect(buildWizardLaunchConfig({
      1: { workflowType: 'design-interview', topic: 'Draft a billing design', outputPath: 'docs/billing.md' },
    })).toMatchObject({
      workflow: { workflowType: 'design-interview', topic: 'Draft a billing design', outputPath: 'docs/billing.md' },
      executionMode: 'process',
      goal: 'Draft a billing design',
      outputPath: 'docs/billing.md',
    });
  });

  it('frontloads prompt text and attached files into run config promptConfig', () => {
    const config = buildWizardLaunchConfig({
      1: { workflowType: 'design-interview', topic: 'Draft a billing design', outputPath: 'docs/billing.md' },
      5: {
        promptText: 'Consider enterprise billing.',
        files: [{ name: 'notes.md', content: 'Existing constraints.' }],
      },
    });

    expect(config).toMatchObject({
      goal: 'Draft a billing design',
      promptConfig: { text: 'Consider enterprise billing.\n\n---\n\nAttached file: notes.md\n\nExisting constraints.' },
    });
    expect(config).not.toHaveProperty('prompts');
  });

  it('maps martin loop fields to backend init config keys', () => {
    expect(buildWizardLaunchConfig({
      1: { workflowType: 'martin-loop', provider: 'codex', objective: 'Implement chunks', chunkDir: 'tasks/chunks' },
    })).toMatchObject({
      workflow: { workflowType: 'martin-loop', provider: 'codex', objective: 'Implement chunks', chunkDir: 'tasks/chunks' },
      executionMode: 'process',
      provider: 'codex',
      objective: 'Implement chunks',
      chunkDirectory: 'tasks/chunks',
    });
  });

  it('leaves martin objective as a CLI-safe scalar and carries attached files in promptConfig', () => {
    expect(buildWizardLaunchConfig({
      1: { workflowType: 'martin-loop', provider: 'codex', objective: 'Implement chunks', chunkDir: 'tasks/chunks' },
      5: { files: [{ name: 'context.txt', content: 'Use this context.' }] },
    })).toMatchObject({
      objective: 'Implement chunks',
      promptConfig: { text: 'Attached file: context.txt\n\nUse this context.' },
    });
  });
});
