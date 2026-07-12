import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { StepReview } from '../../../../src/components/beasts/steps/step-review';
import { useBeastStore } from '../../../../src/stores/beast-store';

afterEach(cleanup);

describe('StepReview', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
    useBeastStore.getState().setStepValues(0, { name: 'Test Agent', description: 'A test agent' });
    useBeastStore.getState().setStepValues(1, { workflowType: 'design-interview' });
  });

  it('renders summary sections from Zustand state', () => {
    render(<StepReview />);
    expect(screen.getByText('Test Agent')).toBeTruthy();
    expect(screen.getByText('Design Interview')).toBeTruthy();
  });

  it('shows backend-required workflow details before launch', () => {
    useBeastStore.getState().setStepValues(1, {
      workflowType: 'martin-loop',
      provider: 'codex',
      objective: 'Implement chunks',
      chunkDirectory: 'tasks/chunks',
    });

    render(<StepReview />);

    expect(screen.getByText('Which provider should run the martin loop')).toBeTruthy();
    expect(screen.getByText('codex')).toBeTruthy();
    expect(screen.getByText('What should the martin loop accomplish')).toBeTruthy();
    expect(screen.getByText('Implement chunks')).toBeTruthy();
    expect(screen.getByText('Which chunk directory should MartinLoop execute from')).toBeTruthy();
    expect(screen.getByText('tasks/chunks')).toBeTruthy();
    expect(screen.queryByText('Required workflow fields are missing:')).toBeNull();
  });

  it('surfaces missing required workflow fields on the review step', () => {
    useBeastStore.getState().setStepValues(1, { workflowType: 'design-interview', goal: '' });

    render(<StepReview />);

    expect(screen.getByText('Required workflow fields are missing:')).toBeTruthy();
    expect(screen.getByText('Design interview goal is required.')).toBeTruthy();
    expect(screen.getByText('Design interview output path is required.')).toBeTruthy();
  });

  it('renders only canonical enabled module toggles in the modules summary', () => {
    useBeastStore.getState().setStepValues(3, {
      firewall: true,
      planner: false,
      firewallConfig: { ruleSet: 'strict' },
      plannerConfig: { maxDagDepth: 12 },
      arbitraryConfig: { enabled: true },
    });

    render(<StepReview />);

    expect(screen.getByText('firewall')).toBeTruthy();
    expect(screen.queryByText('planner')).toBeNull();
    expect(screen.queryByText('firewallConfig')).toBeNull();
    expect(screen.queryByText('plannerConfig')).toBeNull();
    expect(screen.queryByText('arbitraryConfig')).toBeNull();
  });

  it('shows no selected modules when only deep config objects are present', () => {
    useBeastStore.getState().setStepValues(3, {
      firewallConfig: { ruleSet: 'strict' },
      heartbeatConfig: { interval: 60 },
    });

    render(<StepReview />);

    expect(screen.getByText('None selected')).toBeTruthy();
    expect(screen.queryByText('firewallConfig')).toBeNull();
    expect(screen.queryByText('heartbeatConfig')).toBeNull();
  });

  it('has edit links that call setWizardStep', () => {
    render(<StepReview />);
    const editLinks = screen.getAllByText('Edit');
    expect(editLinks.length).toBeGreaterThan(0);
    fireEvent.click(editLinks[0]!);
    // Should have changed wizardStep
    expect(useBeastStore.getState().wizardStep).toBe(0);
  });

  it('does not render a launch action inside the review step', () => {
    useBeastStore.getState().setStepValues(1, { workflowType: 'chunk-plan', designDocPath: 'docs/design.md', outputDir: 'tasks/chunks' });
    useBeastStore.getState().setStepValues(2, { defaultProvider: 'codex', defaultModel: 'gpt-5.1' });
    render(<StepReview />);

    expect(screen.queryByRole('button', { name: /launch/i })).toBeNull();
    expect(screen.getByText('Design Doc -> Chunk Creation')).toBeTruthy();
    expect(screen.getByText('codex / gpt-5.1')).toBeTruthy();
  });

  it('shows selected prompt file counts on the review step', () => {
    useBeastStore.getState().setStepValues(5, {
      files: [
        { name: 'context.md', content: 'agent context' },
        { name: 'notes.md', content: 'notes' },
      ],
    });

    render(<StepReview />);

    expect(screen.getByText('2 file(s)')).toBeTruthy();
    expect(screen.queryByText('No prompt frontloading')).toBeNull();
  });
});
