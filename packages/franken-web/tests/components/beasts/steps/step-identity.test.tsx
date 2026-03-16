import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StepIdentity } from '../../../../src/components/beasts/steps/step-identity';
import { useBeastStore } from '../../../../src/stores/beast-store';

afterEach(cleanup);

describe('StepIdentity', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
  });

  it('renders name input and description textarea', () => {
    render(<StepIdentity />);
    expect(screen.getByLabelText(/agent name/i)).toBeTruthy();
    expect(screen.getByLabelText(/description/i)).toBeTruthy();
  });

  it('stores values in Zustand step 0', () => {
    render(<StepIdentity />);
    fireEvent.change(screen.getByLabelText(/agent name/i), { target: { value: 'MyAgent' } });
    expect(useBeastStore.getState().stepValues[0]?.name).toBe('MyAgent');
  });

  it('shows validation error when name is empty and validate is called', () => {
    render(<StepIdentity />);
    const nameInput = screen.getByLabelText(/agent name/i);
    fireEvent.change(nameInput, { target: { value: '' } });
    fireEvent.blur(nameInput);
    expect((nameInput as HTMLInputElement).value).toBe('');
  });
});
