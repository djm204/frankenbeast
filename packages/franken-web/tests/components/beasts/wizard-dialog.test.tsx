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
});
