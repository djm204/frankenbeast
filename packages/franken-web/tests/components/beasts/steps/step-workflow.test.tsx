import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { StepWorkflow } from '../../../../src/components/beasts/steps/step-workflow';
import { useBeastStore } from '../../../../src/stores/beast-store';

afterEach(cleanup);

describe('StepWorkflow', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
  });

  it('renders 4 workflow cards', () => {
    render(<StepWorkflow />);
    expect(screen.getByText('Design Interview')).toBeTruthy();
    expect(screen.getByText('Chunk Design Doc')).toBeTruthy();
    expect(screen.getByText('Issues Agent')).toBeTruthy();
    expect(screen.getByText('Run Chunked Project')).toBeTruthy();
  });

  it('selecting a card highlights it and stores in Zustand', () => {
    render(<StepWorkflow />);
    fireEvent.click(screen.getByText('Design Interview'));
    expect(useBeastStore.getState().stepValues[1]?.workflowType).toBe('design-interview');
  });

  it('shows workflow-specific fields after selection', () => {
    useBeastStore.getState().setStepValues(1, { workflowType: 'design-interview' });
    render(<StepWorkflow />);
    expect(screen.getByPlaceholderText(/topic|context/i)).toBeTruthy();
  });

  it('collects both required chunk-plan launch fields', () => {
    useBeastStore.getState().setStepValues(1, { workflowType: 'chunk-plan' });
    render(<StepWorkflow />);

    fireEvent.change(screen.getByLabelText('Design Doc Path'), { target: { value: 'docs/design.md' } });
    fireEvent.change(screen.getByLabelText('Output Directory'), { target: { value: 'tasks/chunks' } });

    expect(useBeastStore.getState().stepValues[1]).toEqual({
      workflowType: 'chunk-plan',
      docPath: 'docs/design.md',
      outputDir: 'tasks/chunks',
    });
  });

  it('stores selected container execution mode when runtime is available', () => {
    render(<StepWorkflow containerRuntime={{ available: true }} />);

    fireEvent.click(screen.getByLabelText('Container execution mode'));

    expect(useBeastStore.getState().stepValues[1]?.executionMode).toBe('container');
  });

  it('disables container execution mode with backend reason when unavailable', () => {
    render(<StepWorkflow containerRuntime={{ available: false, reason: 'Docker daemon is offline' }} />);

    const containerMode = screen.getByLabelText('Container execution mode') as HTMLInputElement;
    expect(containerMode.disabled).toBe(true);
    expect(screen.getByText(/Container mode unavailable: Docker daemon is offline/i)).toBeTruthy();
  });

  it('resets stale container execution mode when runtime becomes unavailable', async () => {
    useBeastStore.getState().setStepValues(1, { workflowType: 'design-interview', executionMode: 'container' });

    render(<StepWorkflow containerRuntime={{ available: false, reason: 'Docker daemon is offline' }} />);

    expect(screen.getByLabelText('Process execution mode')).toHaveProperty('checked', true);
    expect(screen.getByLabelText('Container execution mode')).toHaveProperty('checked', false);
    await waitFor(() => {
      expect(useBeastStore.getState().stepValues[1]?.executionMode).toBe('process');
    });
  });
});
