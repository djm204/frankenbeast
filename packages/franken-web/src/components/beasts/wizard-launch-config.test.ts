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

  it('splits module toggles into backend-consumed moduleConfig without deep module settings', () => {
    const config = buildWizardLaunchConfig({
      3: {
        firewall: true,
        skills: false,
        firewallConfig: { ruleSet: 'strict' },
        customFlag: true,
      },
    });

    expect(config.moduleConfig).toEqual({
      firewall: true,
      skills: false,
    });
    expect(config.modules).toEqual({
      firewall: true,
      skills: false,
      firewallConfig: { ruleSet: 'strict' },
      customFlag: true,
    });
  });

  it('maps selected skills, llm targets, and git workflow settings into backend-consumed run config keys', () => {
    expect(buildWizardLaunchConfig({
      2: {
        defaultProvider: 'openai',
        defaultModel: 'gpt-5.3-codex-spark',
        overrides: {
          planning: { provider: 'anthropic', model: 'claude-sonnet-4-6', useDefault: false },
          critique: { provider: 'openai', model: 'gpt-5.5', useDefault: true },
        },
      },
      4: { selectedSkills: ['code-review', 'testing'] },
      6: {
        preset: 'feature-branch-worktree',
        baseBranch: 'develop',
        branchPattern: 'fix/{agent-name}/{id}',
        prCreation: true,
        commitConvention: 'conventional',
        mergeStrategy: 'squash',
      },
    })).toMatchObject({
      llmConfig: {
        default: { provider: 'codex', model: 'gpt-5.3-codex-spark' },
        overrides: {
          'plan-build': { provider: 'claude', model: 'claude-sonnet-4-6' },
          'issue-triage': { provider: 'claude', model: 'claude-sonnet-4-6' },
          'issue-graph': { provider: 'claude', model: 'claude-sonnet-4-6' },
        },
      },
      skills: ['code-review', 'testing'],
      gitConfig: {
        preset: 'feature-branch-worktree',
        baseBranch: 'develop',
        branchPattern: 'fix/',
        prCreation: 'auto',
        commitConvention: 'conventional',
        mergeStrategy: 'squash',
      },
    });
  });

  it('preserves an intentionally blank branch pattern so users can clear the default prefix', () => {
    expect(buildWizardLaunchConfig({
      6: { branchPattern: '   ' },
    })).toMatchObject({
      gitConfig: { branchPattern: '' },
    });
  });

  it('normalizes an emptied skills step to an empty run-config skills array', () => {
    expect(buildWizardLaunchConfig({
      4: { selectedSkills: [] },
    })).toMatchObject({ skills: [] });
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
