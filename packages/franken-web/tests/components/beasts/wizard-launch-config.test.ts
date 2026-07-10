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
});
