// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useBeastStore } from '../../../stores/beast-store';
import { validateWizardStep } from '../wizard-validation';
import { StepModules } from './step-modules';

describe('StepModules numeric configuration', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not store blank or out-of-range planner numbers as module config', () => {
    render(<StepModules />);

    fireEvent.click(screen.getByRole('button', { name: /Planner DAG-based task planning/ }));
    fireEvent.click(screen.getByRole('button', { name: /Planner Configuration/ }));

    const maxDepth = screen.getByLabelText('Max DAG Depth') as HTMLInputElement;
    fireEvent.change(maxDepth, { target: { value: '12' } });
    expect((useBeastStore.getState().stepValues[3]?.plannerConfig as Record<string, unknown>).maxDagDepth).toBe(12);

    fireEvent.change(maxDepth, { target: { value: '' } });
    expect((useBeastStore.getState().stepValues[3]?.plannerConfig as Record<string, unknown>).maxDagDepth).toBe(12);

    fireEvent.change(maxDepth, { target: { value: '0' } });
    expect((useBeastStore.getState().stepValues[3]?.plannerConfig as Record<string, unknown>).maxDagDepth).toBe(12);

    fireEvent.change(maxDepth, { target: { value: '51' } });
    expect((useBeastStore.getState().stepValues[3]?.plannerConfig as Record<string, unknown>).maxDagDepth).toBe(12);
  });

  it('rejects invalid planner, critique, and heartbeat numeric config before launch validation passes', () => {
    const stepValues = {
      3: {
        plannerConfig: {
          maxDagDepth: 0,
          parallelTaskLimit: Number.POSITIVE_INFINITY,
        },
        critiqueConfig: {
          maxIterations: 2.5,
        },
        heartbeatConfig: {
          reflectionInterval: 601,
        },
      },
    };

    const errors = validateWizardStep(3, stepValues);

    expect(errors['plannerConfig.maxDagDepth']).toContain('Max DAG Depth');
    expect(errors['plannerConfig.parallelTaskLimit']).toContain('Parallel Task Limit');
    expect(errors['critiqueConfig.maxIterations']).toContain('Max Iterations');
    expect(errors['heartbeatConfig.reflectionInterval']).toContain('Reflection Interval');
  });
});
