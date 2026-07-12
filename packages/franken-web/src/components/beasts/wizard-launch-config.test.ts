import { describe, expect, it } from 'vitest';
import type { BeastCatalogEntry } from '../../lib/beast-api';
import { buildWizardLaunchConfig } from './wizard-launch-config';

describe('buildWizardLaunchConfig', () => {
  it('maps design interview fields to backend init config keys', () => {
    expect(buildWizardLaunchConfig({
      1: { workflowType: 'design-interview', goal: 'Draft a billing design', outputPath: 'docs/billing.md' },
    })).toMatchObject({
      workflow: { workflowType: 'design-interview', goal: 'Draft a billing design', outputPath: 'docs/billing.md' },
      executionMode: 'process',
      goal: 'Draft a billing design',
      outputPath: 'docs/billing.md',
    });
  });

  it('normalizes path-style fields before launch submission', () => {
    expect(buildWizardLaunchConfig({
      1: {
        workflowType: 'chunk-plan',
        designDocPath: 'docs//./design.md',
        outputDir: 'tasks/./chunks',
      },
    })).toMatchObject({
      workflow: {
        designDocPath: 'docs/design.md',
        outputDir: 'tasks/chunks',
      },
      designDocPath: 'docs/design.md',
      outputDir: 'tasks/chunks',
    });
  });

  it('rejects unsafe path-style fields before launch submission', () => {
    expect(() => buildWizardLaunchConfig({
      1: { workflowType: 'design-interview', goal: 'Draft a billing design', outputPath: '../secret.md' },
    })).toThrow(/outputPath: Path traversal is not allowed/i);

    expect(() => buildWizardLaunchConfig({
      1: { workflowType: 'chunk-plan', designDocPath: '/etc/passwd', outputDir: 'tasks/chunks' },
    })).toThrow(/designDocPath must be a repo-relative path without traversal/i);
  });

  it('frontloads prompt text and attached files into run config promptConfig', () => {
    const config = buildWizardLaunchConfig({
      1: { workflowType: 'design-interview', goal: 'Draft a billing design', outputPath: 'docs/billing.md' },
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
      1: { workflowType: 'martin-loop', provider: 'codex', objective: 'Implement chunks', chunkDirectory: 'tasks/chunks' },
    })).toMatchObject({
      workflow: { workflowType: 'martin-loop', provider: 'codex', objective: 'Implement chunks', chunkDirectory: 'tasks/chunks' },
      executionMode: 'process',
      provider: 'codex',
      objective: 'Implement chunks',
      chunkDirectory: 'tasks/chunks',
    });
  });

  it('leaves martin objective as a CLI-safe scalar and carries attached files in promptConfig', () => {
    expect(buildWizardLaunchConfig({
      1: { workflowType: 'martin-loop', provider: 'codex', objective: 'Implement chunks', chunkDirectory: 'tasks/chunks' },
      5: { files: [{ name: 'context.txt', content: 'Use this context.' }] },
    })).toMatchObject({
      objective: 'Implement chunks',
      promptConfig: { text: 'Attached file: context.txt\n\nUse this context.' },
    });
  });

  it('flattens backend catalog prompt keys into launch config for custom definitions', () => {
    const catalog: BeastCatalogEntry[] = [{
      id: 'custom-beast',
      label: 'Custom Backend Beast',
      description: 'Served by backend catalog',
      executionModeDefault: 'process',
      interviewPrompts: [
        { key: 'objective', prompt: 'What should it do?', kind: 'string', required: true },
        { key: 'provider', prompt: 'Which provider?', kind: 'string', required: true },
      ],
    }];

    expect(buildWizardLaunchConfig({
      1: { workflowType: 'custom-beast', objective: 'Ship catalog UX', provider: 'codex' },
    }, catalog)).toMatchObject({
      workflow: { workflowType: 'custom-beast', objective: 'Ship catalog UX', provider: 'codex' },
      objective: 'Ship catalog UX',
      provider: 'codex',
    });
  });

  it('keeps legacy wizard aliases compatible while preferring backend field names', () => {
    expect(buildWizardLaunchConfig({
      1: {
        workflowType: 'chunk-plan',
        docPath: 'legacy/design.md',
        designDocPath: 'docs/design.md',
        outputDir: 'tasks/chunks',
      },
    })).toMatchObject({
      designDocPath: 'docs/design.md',
      outputDir: 'tasks/chunks',
    });

    expect(buildWizardLaunchConfig({
      1: {
        workflowType: 'martin-loop',
        provider: 'codex',
        objective: 'Implement chunks',
        chunkDir: 'legacy/chunks',
        chunkDirectory: 'tasks/chunks',
      },
    })).toMatchObject({
      chunkDirectory: 'tasks/chunks',
    });

    expect(buildWizardLaunchConfig({
      1: { workflowType: 'design-interview', topic: 'Legacy topic', outputPath: 'docs/design.md' },
    })).toMatchObject({
      goal: 'Legacy topic',
      outputPath: 'docs/design.md',
    });
  });
});
