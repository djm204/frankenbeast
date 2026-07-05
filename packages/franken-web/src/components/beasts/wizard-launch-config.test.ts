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
});
