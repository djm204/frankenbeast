import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StepModules } from '../../../../src/components/beasts/steps/step-modules';
import { useBeastStore } from '../../../../src/stores/beast-store';

afterEach(cleanup);

describe('StepModules', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
  });

  it('renders 7 module cards', () => {
    render(<StepModules />);
    expect(screen.getByText('Firewall')).toBeTruthy();
    expect(screen.getByText('Skills')).toBeTruthy();
    expect(screen.getByText('Memory')).toBeTruthy();
    expect(screen.getByText('Planner')).toBeTruthy();
    expect(screen.getByText('Critique')).toBeTruthy();
    expect(screen.getByText('Governor')).toBeTruthy();
    expect(screen.getByText('Heartbeat')).toBeTruthy();
  });

  it('toggling a module stores state in Zustand', () => {
    render(<StepModules />);
    fireEvent.click(screen.getByText('Firewall'));
    const modules = useBeastStore.getState().stepValues[3] as Record<string, boolean>;
    expect(modules?.firewall).toBe(true);
  });

  it('does not save zero when positive planner numeric fields are cleared', () => {
    render(<StepModules />);

    fireEvent.click(screen.getByText('Planner'));
    fireEvent.click(screen.getByRole('button', { name: /planner configuration/i }));
    fireEvent.change(screen.getByLabelText('Max DAG Depth'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Parallel Task Limit'), { target: { value: '' } });

    const modules = useBeastStore.getState().stepValues[3] as Record<string, Record<string, unknown>>;
    expect(modules?.plannerConfig).toEqual({});
    expect(modules?.plannerConfig?.maxDagDepth).not.toBe(0);
    expect(modules?.plannerConfig?.parallelTaskLimit).not.toBe(0);
  });

  it('does not save zero when positive critique and heartbeat numeric fields are cleared', () => {
    render(<StepModules />);

    fireEvent.click(screen.getByText('Critique'));
    fireEvent.click(screen.getByRole('button', { name: /critique configuration/i }));
    fireEvent.change(screen.getByLabelText('Max Iterations'), { target: { value: '' } });

    fireEvent.click(screen.getByText('Heartbeat'));
    fireEvent.click(screen.getByRole('button', { name: /heartbeat configuration/i }));
    fireEvent.change(screen.getByLabelText('Reflection Interval (seconds)'), { target: { value: '' } });

    const modules = useBeastStore.getState().stepValues[3] as Record<string, Record<string, unknown>>;
    expect(modules?.critiqueConfig).toEqual({});
    expect(modules?.heartbeatConfig).toEqual({});
    expect(modules?.critiqueConfig?.maxIterations).not.toBe(0);
    expect(modules?.heartbeatConfig?.reflectionInterval).not.toBe(0);
  });

  it('clamps positive module numeric fields before saving wizard state', () => {
    render(<StepModules />);

    fireEvent.click(screen.getByText('Planner'));
    fireEvent.click(screen.getByRole('button', { name: /planner configuration/i }));
    fireEvent.change(screen.getByLabelText('Max DAG Depth'), { target: { value: '0' } });
    fireEvent.blur(screen.getByLabelText('Max DAG Depth'));
    fireEvent.change(screen.getByLabelText('Parallel Task Limit'), { target: { value: '99' } });
    fireEvent.blur(screen.getByLabelText('Parallel Task Limit'));

    fireEvent.click(screen.getByText('Critique'));
    fireEvent.click(screen.getByRole('button', { name: /critique configuration/i }));
    fireEvent.change(screen.getByLabelText('Max Iterations'), { target: { value: '0' } });
    fireEvent.blur(screen.getByLabelText('Max Iterations'));

    fireEvent.click(screen.getByText('Heartbeat'));
    fireEvent.click(screen.getByRole('button', { name: /heartbeat configuration/i }));
    fireEvent.change(screen.getByLabelText('Reflection Interval (seconds)'), { target: { value: '0' } });
    fireEvent.blur(screen.getByLabelText('Reflection Interval (seconds)'));

    const modules = useBeastStore.getState().stepValues[3] as Record<string, Record<string, unknown>>;
    expect(modules?.plannerConfig).toMatchObject({ maxDagDepth: 1, parallelTaskLimit: 20 });
    expect(modules?.critiqueConfig).toMatchObject({ maxIterations: 1 });
    expect(modules?.heartbeatConfig).toMatchObject({ reflectionInterval: 10 });
  });

  it('allows transient heartbeat interval edits below the minimum until blur', () => {
    render(<StepModules />);

    fireEvent.click(screen.getByText('Heartbeat'));
    fireEvent.click(screen.getByRole('button', { name: /heartbeat configuration/i }));

    const intervalInput = screen.getByLabelText('Reflection Interval (seconds)');
    fireEvent.change(intervalInput, { target: { value: '3' } });
    expect(useBeastStore.getState().stepValues[3]?.heartbeatConfig).toMatchObject({ reflectionInterval: 3 });

    fireEvent.change(intervalInput, { target: { value: '30' } });
    expect(useBeastStore.getState().stepValues[3]?.heartbeatConfig).toMatchObject({ reflectionInterval: 30 });
  });
});
