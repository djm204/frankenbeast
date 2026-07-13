import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { StepLlmTargets } from '../../../../src/components/beasts/steps/step-llm-targets';
import { useBeastStore } from '../../../../src/stores/beast-store';
import { useDashboardStore } from '../../../../src/stores/dashboard-store';

const snapshotSecurity = { profile: 'standard', injectionDetection: true, piiMasking: true, outputValidation: true };

afterEach(cleanup);

describe('StepLlmTargets', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
    useDashboardStore.getState().reset();
  });

  afterEach(() => {
    useDashboardStore.getState().reset();
  });

  it('renders default provider/model selects', () => {
    render(<StepLlmTargets />);
    expect(screen.getAllByText(/default model/i).length).toBeGreaterThan(0);
  });

  it('renders per-action overrides section', () => {
    render(<StepLlmTargets />);
    expect(screen.getByText(/per-action overrides/i)).toBeTruthy();
  });

  it('renders action type override cards', () => {
    render(<StepLlmTargets />);
    expect(screen.getByText('planning')).toBeTruthy();
    expect(screen.getByText('execution')).toBeTruthy();
    expect(screen.getByText('critique')).toBeTruthy();
  });

  it('loads provider and model choices from configured dashboard providers', () => {
    useDashboardStore.getState().setSnapshot({
      skills: [],
      security: snapshotSecurity,
      providers: [
        { name: 'openai', type: 'openai-api', available: true, failoverOrder: 0, model: 'gpt-5.3' },
        { name: 'gemini', type: 'gemini-api', available: true, failoverOrder: 1, model: 'gemini-2.5-pro' },
      ],
    });

    render(<StepLlmTargets />);

    expect(screen.getAllByText('openai').length).toBeGreaterThan(0);
    expect(screen.getAllByText('gemini').length).toBeGreaterThan(0);
    expect(screen.queryByText('Claude Sonnet 4.6')).toBeNull();

    fireEvent.change(screen.getAllByLabelText('Provider')[0]!, { target: { value: 'openai' } });

    expect(screen.getByText('gpt-5.3')).toBeTruthy();
    expect(screen.queryByText('claude-sonnet-4-6')).toBeNull();
  });

  it('clearly shows that configured providers are loading instead of using stale fallbacks', () => {
    render(<StepLlmTargets />);

    expect(screen.getByText(/loading configured llm providers/i)).toBeTruthy();
    expect(screen.queryByText('Claude Sonnet 4.6')).toBeNull();
  });

  it('hides cached provider choices while a fresh provider snapshot is loading', () => {
    useDashboardStore.getState().setSnapshot({
      skills: [],
      security: snapshotSecurity,
      providers: [{ name: 'stale-openai', type: 'openai-api', available: true, failoverOrder: 0, model: 'stale-model' }],
    });
    useDashboardStore.getState().setLoading(true);

    render(<StepLlmTargets />);

    expect(screen.getByText(/loading configured llm providers/i)).toBeTruthy();
    expect(screen.queryByText('stale-openai')).toBeNull();
    expect(screen.queryByText('stale-model')).toBeNull();
  });

  it('clearly shows an empty configured provider list without fallback options', () => {
    useDashboardStore.getState().setSnapshot({ skills: [], security: snapshotSecurity, providers: [] });

    render(<StepLlmTargets />);

    expect(screen.getByText(/no configured llm providers are available/i)).toBeTruthy();
    expect(screen.queryByText('Claude Sonnet 4.6')).toBeNull();
  });

  it('clearly shows provider load errors without fallback options', () => {
    useDashboardStore.getState().setSnapshot({
      skills: [],
      security: snapshotSecurity,
      providers: [{ name: 'stale-openai', type: 'openai-api', available: true, failoverOrder: 0, model: 'stale-model' }],
    });
    useDashboardStore.setState({ loading: false, error: 'HTTP 500' } as Partial<ReturnType<typeof useDashboardStore.getState>>);

    render(<StepLlmTargets />);

    expect(screen.getByText(/could not load configured llm providers/i)).toBeTruthy();
    expect(screen.getByText(/HTTP 500/)).toBeTruthy();
    expect(screen.queryByText('stale-openai')).toBeNull();
    expect(screen.queryByText('stale-model')).toBeNull();
    expect(screen.queryByText('Claude Sonnet 4.6')).toBeNull();
  });
});
