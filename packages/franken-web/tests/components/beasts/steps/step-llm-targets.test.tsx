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

    const providerSelect = screen.getAllByLabelText('Provider')[0]!;
    fireEvent.click(providerSelect);
    expect(screen.getByRole('option', { name: 'openai' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'gemini' })).toBeTruthy();
    expect(screen.queryByText('Claude Sonnet 4.6')).toBeNull();

    fireEvent.click(screen.getByRole('option', { name: 'openai' }));
    fireEvent.click(screen.getAllByLabelText('Model')[0]!);

    expect(screen.getByRole('option', { name: 'gpt-5.3' })).toBeTruthy();
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

  it('populates the model list for a configured CLI provider with no pinned model override', () => {
    // Regression test for #3820: a provider that is configured and available but has no
    // explicit `model` override (the common case for CLI-based providers like claude,
    // which default to whatever the CLI itself resolves) must still offer selectable models
    // instead of leaving the Model dropdown empty.
    useDashboardStore.getState().setSnapshot({
      skills: [],
      security: snapshotSecurity,
      providers: [{ name: 'claude', type: 'claude-cli', available: true, failoverOrder: 0 }],
    });

    render(<StepLlmTargets />);

    const providerSelect = screen.getAllByLabelText('Provider')[0]!;
    fireEvent.click(providerSelect);
    fireEvent.click(screen.getByRole('option', { name: 'claude' }));

    fireEvent.click(screen.getAllByLabelText('Model')[0]!);
    expect(screen.queryAllByRole('option').length).toBeGreaterThan(1);
  });

  it('leaves the Model dropdown empty for an unpinned codex-cli provider instead of guessing a model', () => {
    // codex-cli deliberately never gets a guessed fallback model: CodexProvider (see
    // packages/franken-orchestrator/src/skills/providers/codex-provider.ts, #3412, #3424)
    // intentionally leaves the model unset so `codex exec` resolves the account's current
    // default, which is newer than any version string this codebase could hardcode. A
    // wizard-suggested model here would let a user pin the same kind of stale value that
    // policy exists to avoid.
    useDashboardStore.getState().setSnapshot({
      skills: [],
      security: snapshotSecurity,
      providers: [{ name: 'codex', type: 'codex-cli', available: true, failoverOrder: 0 }],
    });

    render(<StepLlmTargets />);

    const providerSelect = screen.getAllByLabelText('Provider')[0]!;
    fireEvent.click(providerSelect);
    fireEvent.click(screen.getByRole('option', { name: 'codex' }));

    fireEvent.click(screen.getAllByLabelText('Model')[0]!);
    expect(screen.queryAllByRole('option').length).toBe(1);
  });

  it('offers aider its own fallback model instead of the Claude default it is type-mapped to', () => {
    // Regression test for #3888 finding 1: franken-orchestrator's buildDashboardProviderSnapshot
    // deliberately reports legacy `aider` providers as `{ name: 'aider', type: 'claude-cli' }` for
    // lookup purposes, but AiderProvider is a distinct CLI with its own default model ('sonnet').
    // A type-keyed fallback would incorrectly offer/pin a Claude model id onto `aider --model`.
    useDashboardStore.getState().setSnapshot({
      skills: [],
      security: snapshotSecurity,
      providers: [{ name: 'aider', type: 'claude-cli', available: true, failoverOrder: 0 }],
    });

    render(<StepLlmTargets />);

    const providerSelect = screen.getAllByLabelText('Provider')[0]!;
    fireEvent.click(providerSelect);
    fireEvent.click(screen.getByRole('option', { name: 'aider' }));

    fireEvent.click(screen.getAllByLabelText('Model')[0]!);
    expect(screen.getByRole('option', { name: 'sonnet' })).toBeTruthy();
    expect(screen.queryByText('claude-opus-4-8')).toBeNull();
  });

  it('does not offer an API-adapter model fallback for a provider that launches via a different CLI', () => {
    // Regression test for #3888 finding 2: buildWizardLaunchConfig normalizes every selected
    // provider down to the CLI that actually executes the Beast Loop (claude/codex/gemini/aider).
    // An `openai`/`openai-api` dashboard entry always launches the Codex CLI, never a direct
    // OpenAI API call, so it must not be offered the OpenAI API adapter's own default model
    // (e.g. gpt-4o) — that value would get pinned onto the Codex CLI's --model flag instead.
    useDashboardStore.getState().setSnapshot({
      skills: [],
      security: snapshotSecurity,
      providers: [{ name: 'openai', type: 'openai-api', available: true, failoverOrder: 0 }],
    });

    render(<StepLlmTargets />);

    const providerSelect = screen.getAllByLabelText('Provider')[0]!;
    fireEvent.click(providerSelect);
    fireEvent.click(screen.getByRole('option', { name: 'openai' }));

    fireEvent.click(screen.getAllByLabelText('Model')[0]!);
    expect(screen.queryAllByRole('option').length).toBe(1);
    expect(screen.queryByText('gpt-4o')).toBeNull();
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
