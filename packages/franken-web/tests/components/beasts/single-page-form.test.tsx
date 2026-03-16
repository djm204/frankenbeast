import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SinglePageForm } from '../../../src/components/beasts/single-page-form';
import { useBeastStore } from '../../../src/stores/beast-store';

afterEach(cleanup);

describe('SinglePageForm', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
  });

  it('renders all 8 sections as accordion items', () => {
    render(<SinglePageForm onLaunch={vi.fn()} />);
    expect(screen.getByText('Identity')).toBeTruthy();
    expect(screen.getByText('Workflow')).toBeTruthy();
    expect(screen.getByText('LLM Targets')).toBeTruthy();
    expect(screen.getByText('Modules')).toBeTruthy();
    expect(screen.getByText('Skills')).toBeTruthy();
    expect(screen.getByText('Prompts')).toBeTruthy();
    expect(screen.getByText('Git Workflow')).toBeTruthy();
    expect(screen.getByText('Review')).toBeTruthy();
  });

  it('has Launch button at bottom', () => {
    render(<SinglePageForm onLaunch={vi.fn()} />);
    expect(screen.getByRole('button', { name: /launch/i })).toBeTruthy();
  });
});
