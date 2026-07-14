import { describe, expect, it } from 'vitest';
import { buildWizardLaunchConfig } from '../../../src/components/beasts/wizard-launch-config';
import type { BeastCatalogEntry } from '../../../src/lib/beast-api';

const catalogWithUnavailableContainerDefault: BeastCatalogEntry[] = [
  {
    id: 'container-default-beast',
    label: 'Container Default Beast',
    description: 'Defaults to a container runtime that is unavailable',
    executionModeDefault: 'container',
    containerRuntime: { available: false, reason: 'Docker daemon is offline' },
    interviewPrompts: [],
  },
];

describe('buildWizardLaunchConfig', () => {
  it('falls back to process when stale wizard state requests an unavailable default container runtime', () => {
    const config = buildWizardLaunchConfig({
      1: { workflowType: 'container-default-beast', executionMode: 'container' },
    }, catalogWithUnavailableContainerDefault);

    expect(config.executionMode).toBe('process');
  });

  it('falls back to process when only global container runtime status is unavailable', () => {
    const config = buildWizardLaunchConfig({
      1: { workflowType: 'container-default-beast', executionMode: 'container' },
    }, [{
      id: 'container-default-beast',
      label: 'Container Default Beast',
      description: 'Production catalog entry without embedded runtime status',
      executionModeDefault: 'container',
      interviewPrompts: [],
    }], { available: false, reason: 'Docker daemon is offline' });

    expect(config.executionMode).toBe('process');
  });

  it('sanitizes positive-only module numeric values before launch', () => {
    const config = buildWizardLaunchConfig({
      3: {
        planner: true,
        plannerConfig: { maxDagDepth: 0, parallelTaskLimit: '99' },
        critique: true,
        critiqueConfig: { maxIterations: '' },
        heartbeat: true,
        heartbeatConfig: { reflectionInterval: 0 },
      },
    });

    expect(config.modules).toMatchObject({
      plannerConfig: { maxDagDepth: 1, parallelTaskLimit: 20 },
      critiqueConfig: {},
      heartbeatConfig: { reflectionInterval: 10 },
    });
  });

  it('includes selected prompt files in the launch prompt frontload text', () => {
    const config = buildWizardLaunchConfig({
      5: {
        promptText: 'Use the attached context.',
        files: [
          { name: 'context.txt', content: 'Project context' },
          { name: 'empty.md', content: '' },
        ],
      },
    });

    expect(config.prompts).toBeUndefined();
    expect(config.promptConfig).toEqual({
      text: 'Use the attached context.\n\n---\n\nAttached file: context.txt\n\nProject context',
    });
  });
});
