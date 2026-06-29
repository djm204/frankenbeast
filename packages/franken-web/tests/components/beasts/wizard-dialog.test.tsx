import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { WizardDialog } from '../../../src/components/beasts/wizard-dialog';
import { useBeastStore } from '../../../src/stores/beast-store';

afterEach(cleanup);

describe('WizardDialog', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
  });

  it('renders as a dialog when open', () => {
    render(<WizardDialog isOpen={true} onClose={vi.fn()} onLaunch={vi.fn()} />);
    expect(screen.getByText('Identity')).toBeTruthy(); // First step label in indicator
  });

  it('has Back and Next buttons', () => {
    render(<WizardDialog isOpen={true} onClose={vi.fn()} onLaunch={vi.fn()} />);
    expect(screen.getByText('Next')).toBeTruthy();
    // Back should be disabled on step 0
    const backBtn = screen.getByText('Back');
    expect((backBtn.closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('has mode toggle between wizard and form', () => {
    render(<WizardDialog isOpen={true} onClose={vi.fn()} onLaunch={vi.fn()} />);
    // Should have some toggle for wizard/form mode
    const toggle = screen.getByText(/form view/i) || screen.getByText(/form/i);
    expect(toggle).toBeTruthy();
  });

  it('footer launch uses the shared config shape for non-default workflows', () => {
    const onLaunch = vi.fn();
    useBeastStore.getState().setStepValues(0, { name: 'Footer Agent' });
    useBeastStore.getState().setStepValues(1, { workflowType: 'chunk-plan', docPath: 'docs/design.md' });
    useBeastStore.setState({ wizardStep: 7, highestCompleted: 6 });

    render(<WizardDialog isOpen={true} onClose={vi.fn()} onLaunch={onLaunch} />);
    fireEvent.click(screen.getByText('Launch Agent'));

    expect(onLaunch).toHaveBeenCalledWith({
      identity: { name: 'Footer Agent' },
      workflow: { workflowType: 'chunk-plan', docPath: 'docs/design.md' },
      designDocPath: 'docs/design.md',
    });
  });
});
