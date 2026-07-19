import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { WizardStepIndicator } from '../../../src/components/beasts/wizard-step-indicator';

afterEach(cleanup);

const STEPS = ['Identity', 'Workflow', 'LLM Targets', 'Modules', 'Skills', 'Prompts', 'Git', 'Review'];

describe('WizardStepIndicator', () => {
  it('renders all 8 steps', () => {
    render(<WizardStepIndicator steps={STEPS} currentStep={0} highestCompleted={-1} onStepClick={vi.fn()} />);
    STEPS.forEach((s) => expect(screen.getByText(s)).toBeTruthy());
  });

  it('highlights current step', () => {
    render(<WizardStepIndicator steps={STEPS} currentStep={2} highestCompleted={1} onStepClick={vi.fn()} />);
    const current = screen.getByText('LLM Targets').closest('button');
    expect(current?.className).toContain('text-beast-accent');
  });

  it('marks current step with aria-current', () => {
    render(<WizardStepIndicator steps={STEPS} currentStep={2} highestCompleted={1} onStepClick={vi.fn()} />);
    const current = screen.getByRole('button', { name: /LLM Targets, current step/i });
    expect(current.getAttribute('aria-current')).toBe('step');
  });

  it('announces completed and upcoming states in accessible labels', () => {
    render(
      <WizardStepIndicator
        steps={STEPS}
        currentStep={2}
        highestCompleted={1}
        onStepClick={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Identity, completed/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Modules, upcoming step/i })).toBeTruthy();
  });

  it('completed steps are clickable', () => {
    const onClick = vi.fn();
    render(<WizardStepIndicator steps={STEPS} currentStep={3} highestCompleted={2} onStepClick={onClick} />);
    fireEvent.click(screen.getByText('Identity'));
    expect(onClick).toHaveBeenCalledWith(0);
  });

  it('future steps are not clickable', () => {
    const onClick = vi.fn();
    render(<WizardStepIndicator steps={STEPS} currentStep={1} highestCompleted={0} onStepClick={onClick} />);
    fireEvent.click(screen.getByText('Modules'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
