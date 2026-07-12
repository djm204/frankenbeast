// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useBeastStore } from '../../../stores/beast-store';
import { useDashboardStore } from '../../../stores/dashboard-store';
import { StepLlmTargets } from './step-llm-targets';
import { StepModules } from './step-modules';

function seedConfiguredProviders() {
  useDashboardStore.getState().setSnapshot({
    skills: [],
    security: {
      profile: 'standard',
      injectionDetection: true,
      piiMasking: true,
      outputValidation: true,
    },
    providers: [
      {
        name: 'openai',
        type: 'openai-api',
        available: true,
        failoverOrder: 0,
        model: 'gpt-4.1',
      },
      {
        name: 'codex',
        type: 'codex-cli',
        available: true,
        failoverOrder: 1,
        model: 'gpt-5.3-codex-spark',
      },
    ],
  });
}

describe('Beast wizard model selectors', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
    useDashboardStore.getState().reset();
    seedConfiguredProviders();
  });

  afterEach(() => {
    cleanup();
    useBeastStore.getState().resetWizard();
    useDashboardStore.getState().reset();
  });

  it('renders LLM target selectors from the configured dashboard providers', () => {
    render(<StepLlmTargets />);

    expect(screen.getAllByText('openai').length).toBeGreaterThan(0);
    expect(screen.getAllByText('codex').length).toBeGreaterThan(0);
    expect(screen.queryByText('Claude Sonnet 4.6')).toBeNull();

    fireEvent.change(screen.getAllByLabelText('Provider')[0]!, { target: { value: 'openai' } });

    expect(screen.getByText('gpt-4.1')).toBeTruthy();
    expect(screen.queryByText('claude-sonnet-4-6')).toBeNull();
  });

  it('uses the same configured provider catalog for the Heartbeat LLM Override selector', () => {
    useBeastStore.getState().setStepValues(3, { heartbeat: true });

    render(<StepModules />);
    fireEvent.click(screen.getByRole('button', { name: /Heartbeat\s+Configuration/i }));

    expect(screen.getAllByText('openai').length).toBeGreaterThan(0);
    expect(screen.getAllByText('codex').length).toBeGreaterThan(0);
    expect(screen.queryByText('Claude Sonnet 4.6')).toBeNull();

    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'codex' } });

    expect(screen.getByText('gpt-5.3-codex-spark')).toBeTruthy();
    expect(screen.queryByText('claude-opus-4-6')).toBeNull();
  });
});
