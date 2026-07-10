import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { StepWorkflow } from '../../../../src/components/beasts/steps/step-workflow';
import { useBeastStore } from '../../../../src/stores/beast-store';
import type { BeastCatalogEntry } from '../../../../src/lib/beast-api';

const backendCatalog: BeastCatalogEntry[] = [
  {
    id: 'custom-beast',
    label: 'Custom Backend Beast',
    description: 'Definition served by the backend catalog',
    executionModeDefault: 'process',
    interviewPrompts: [
      { key: 'objective', prompt: 'What should the custom beast do?', kind: 'string', required: true },
      { key: 'provider', prompt: 'Which backend provider should run?', kind: 'string', required: true, options: ['codex', 'claude'] },
    ],
  },
];

afterEach(cleanup);

describe('StepWorkflow', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
  });

  it('renders supported workflow cards', () => {
    render(<StepWorkflow />);
    expect(screen.getByText('Design Interview')).toBeTruthy();
    expect(screen.getByText('Design Doc -> Chunk Creation')).toBeTruthy();
    expect(screen.queryByText('Issues Agent')).toBeNull();
    expect(screen.getByText('Martin Loop')).toBeTruthy();
  });

  it('renders backend catalog definitions instead of static workflow cards when provided', () => {
    render(<StepWorkflow catalog={backendCatalog} />);
    expect(screen.getByText('Custom Backend Beast')).toBeTruthy();
    expect(screen.queryByText('Design Interview')).toBeNull();
  });

  it('renders backend interview prompts for the selected catalog definition', () => {
    useBeastStore.getState().setStepValues(1, { workflowType: 'custom-beast' });
    render(<StepWorkflow catalog={backendCatalog} />);

    fireEvent.change(screen.getByLabelText(/custom beast do/i), { target: { value: 'Ship catalog UX' } });
    fireEvent.change(screen.getByLabelText(/backend provider/i), { target: { value: 'codex' } });

    expect(useBeastStore.getState().stepValues[1]).toMatchObject({
      workflowType: 'custom-beast',
      objective: 'Ship catalog UX',
      provider: 'codex',
    });
  });

  it('selecting a card highlights it and stores in Zustand', () => {
    render(<StepWorkflow />);
    fireEvent.click(screen.getByText('Design Interview'));
    expect(useBeastStore.getState().stepValues[1]?.workflowType).toBe('design-interview');
  });

  it('does not wipe answers when reselecting the selected workflow card', () => {
    useBeastStore.getState().setStepValues(1, {
      workflowType: 'design-interview',
      executionMode: 'container',
      goal: 'Draft billing design',
      outputPath: 'docs/billing.md',
    });
    render(<StepWorkflow containerRuntime={{ available: true }} />);

    fireEvent.click(screen.getByText('Design Interview'));

    expect(useBeastStore.getState().stepValues[1]).toEqual({
      workflowType: 'design-interview',
      executionMode: 'container',
      goal: 'Draft billing design',
      outputPath: 'docs/billing.md',
    });
  });

  it('shows workflow-specific fields after selection', () => {
    useBeastStore.getState().setStepValues(1, { workflowType: 'design-interview' });
    render(<StepWorkflow />);
    expect(screen.getByPlaceholderText(/design interview should produce/i)).toBeTruthy();
    expect(screen.getByLabelText(/design document be written/i)).toBeTruthy();
  });

  it('collects backend design-interview fields', () => {
    useBeastStore.getState().setStepValues(1, { workflowType: 'design-interview' });
    render(<StepWorkflow />);

    fireEvent.change(screen.getByLabelText(/design interview produce/i), { target: { value: 'Draft billing design' } });
    fireEvent.change(screen.getByLabelText(/design document be written/i), { target: { value: 'docs/billing.md' } });

    expect(useBeastStore.getState().stepValues[1]).toEqual({
      workflowType: 'design-interview',
      goal: 'Draft billing design',
      outputPath: 'docs/billing.md',
    });
  });

  it('collects both required chunk-plan launch fields', () => {
    useBeastStore.getState().setStepValues(1, { workflowType: 'chunk-plan' });
    render(<StepWorkflow />);

    fireEvent.change(screen.getByLabelText(/design document should be chunked/i), { target: { value: 'docs/design.md' } });
    fireEvent.change(screen.getByLabelText(/chunk plan be written/i), { target: { value: 'tasks/chunks' } });

    expect(screen.getByLabelText(/chunk plan be written/i).tagName).toBe('INPUT');
    expect(useBeastStore.getState().stepValues[1]).toEqual({
      workflowType: 'chunk-plan',
      designDocPath: 'docs/design.md',
      outputDir: 'tasks/chunks',
    });
  });

  it('collects backend martin-loop fields', () => {
    useBeastStore.getState().setStepValues(1, { workflowType: 'martin-loop' });
    render(<StepWorkflow />);

    fireEvent.change(screen.getByLabelText(/provider should run the martin loop/i), { target: { value: 'codex' } });
    fireEvent.change(screen.getByLabelText(/martin loop accomplish/i), { target: { value: 'Implement chunks' } });
    fireEvent.change(screen.getByLabelText(/chunk directory should MartinLoop execute/i), { target: { value: 'tasks/chunks' } });

    expect(useBeastStore.getState().stepValues[1]).toEqual({
      workflowType: 'martin-loop',
      provider: 'codex',
      objective: 'Implement chunks',
      chunkDirectory: 'tasks/chunks',
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

  it('stores process immediately when selecting a catalog beast whose default container runtime is unavailable', () => {
    render(<StepWorkflow catalog={[{
      id: 'container-default-beast',
      label: 'Container Default Beast',
      description: 'Defaults to an unavailable container runtime',
      executionModeDefault: 'container',
      containerRuntime: { available: false, reason: 'Docker daemon is offline' },
      interviewPrompts: [],
    }]} />);

    fireEvent.click(screen.getByText('Container Default Beast'));

    expect(useBeastStore.getState().stepValues[1]).toMatchObject({
      workflowType: 'container-default-beast',
      executionMode: 'process',
    });
  });
});
