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

  it('does not store blank or above-maximum planner numbers as module config', () => {
    render(<StepModules />);

    fireEvent.click(screen.getByRole('button', { name: /Planner DAG-based task planning/ }));
    fireEvent.click(screen.getByRole('button', { name: /Planner Configuration/ }));

    const maxDepth = screen.getByLabelText('Max DAG Depth') as HTMLInputElement;
    fireEvent.change(maxDepth, { target: { value: '12' } });
    expect((useBeastStore.getState().stepValues[3]?.plannerConfig as Record<string, unknown>).maxDagDepth).toBe(12);

    fireEvent.change(maxDepth, { target: { value: '' } });
    expect((useBeastStore.getState().stepValues[3]?.plannerConfig as Record<string, unknown>).maxDagDepth).toBe(12);

    fireEvent.change(maxDepth, { target: { value: '51' } });
    expect((useBeastStore.getState().stepValues[3]?.plannerConfig as Record<string, unknown>).maxDagDepth).toBe(12);
  });

  it('allows intermediate heartbeat prefixes while final validation blocks too-low values', () => {
    render(<StepModules />);

    fireEvent.click(screen.getByRole('button', { name: /Heartbeat Periodic reflection/ }));
    fireEvent.click(screen.getByRole('button', { name: /Heartbeat Configuration/ }));

    const reflectionInterval = screen.getByLabelText('Reflection Interval (seconds)') as HTMLInputElement;
    fireEvent.change(reflectionInterval, { target: { value: '3' } });
    expect((useBeastStore.getState().stepValues[3]?.heartbeatConfig as Record<string, unknown>).reflectionInterval).toBe(3);
    expect(validateWizardStep(3, useBeastStore.getState().stepValues)['heartbeatConfig.reflectionInterval']).toContain('Reflection Interval');

    fireEvent.change(reflectionInterval, { target: { value: '30' } });
    expect((useBeastStore.getState().stepValues[3]?.heartbeatConfig as Record<string, unknown>).reflectionInterval).toBe(30);
    expect(validateWizardStep(3, useBeastStore.getState().stepValues)['heartbeatConfig.reflectionInterval']).toBeUndefined();
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

  it('rejects malformed config sections without throwing', () => {
    const errors = validateWizardStep(3, {
      3: {
        plannerConfig: true,
        heartbeatConfig: 'bad',
      },
    });

    expect(errors.plannerConfig).toContain('malformed');
    expect(errors.heartbeatConfig).toContain('malformed');
  });
});
