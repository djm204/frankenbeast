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

  // The following tests cover the Model fallback catalog's contract with
  // `DashboardProvider.executionProvider` — the CLI identity (claude/codex/gemini/
  // aider) franken-orchestrator's own resolveWizardExecutionProvider (providers/
  // provider-config.ts) already resolved a provider to, included directly in the
  // dashboard snapshot by buildDashboardProviderSnapshot (cli/run.ts).
  //
  // Three earlier revisions of this fallback tried to re-derive that same CLI
  // identity client-side from a provider's raw `type` and/or `name` instead, and
  // each one diverged from the backend's actual resolution in a different way
  // (#3820, #3888 — keying by type mismatched API-typed entries that actually
  // launch a CLI; keying by name alone missed custom-named consolidated aliases;
  // name-first-then-type still diverged whenever a consolidated provider's name
  // coincided with a recognized alias but its configured type disagreed). Reading
  // the backend-resolved `executionProvider` directly — tested here — eliminates
  // that whole class of bug: the scenarios that exposed each divergence (custom
  // aliases, mismatched name/type pairs, legacy generic types) are now covered as
  // backend unit tests against resolveWizardExecutionProvider itself (see
  // packages/franken-orchestrator/tests/unit/providers/provider-config.test.ts),
  // since the frontend no longer re-derives anything to get wrong.

  it('populates the model list for a provider the backend resolved to the claude CLI', () => {
    // Regression test for #3820: a provider that is configured and available but has no
    // explicit `model` override (the common case for CLI-based providers, which default to
    // whatever the CLI itself resolves) must still offer selectable models instead of
    // leaving the Model dropdown empty.
    useDashboardStore.getState().setSnapshot({
      skills: [],
      security: snapshotSecurity,
      providers: [{ name: 'claude', type: 'claude-cli', available: true, failoverOrder: 0, executionProvider: 'claude' }],
    });

    render(<StepLlmTargets />);

    const providerSelect = screen.getAllByLabelText('Provider')[0]!;
    fireEvent.click(providerSelect);
    fireEvent.click(screen.getByRole('option', { name: 'claude' }));

    fireEvent.click(screen.getAllByLabelText('Model')[0]!);
    expect(screen.getByRole('option', { name: 'claude-opus-4-8' })).toBeTruthy();
  });

  it('leaves the Model dropdown empty for a provider the backend resolved to the codex CLI', () => {
    // codex deliberately never gets a guessed fallback model: CodexProvider (see
    // packages/franken-orchestrator/src/skills/providers/codex-provider.ts, #3412, #3424)
    // intentionally leaves the model unset so `codex exec` resolves the account's current
    // default, which is newer than any version string this codebase could hardcode. A
    // wizard-suggested model here would let a user pin the same kind of stale value that
    // policy exists to avoid. This must hold regardless of which dashboard `name`/`type`
    // the backend resolved to 'codex' from (openai, openai-api, codex-cli, ...).
    useDashboardStore.getState().setSnapshot({
      skills: [],
      security: snapshotSecurity,
      providers: [{ name: 'openai', type: 'openai-api', available: true, failoverOrder: 0, executionProvider: 'codex' }],
    });

    render(<StepLlmTargets />);

    const providerSelect = screen.getAllByLabelText('Provider')[0]!;
    fireEvent.click(providerSelect);
    fireEvent.click(screen.getByRole('option', { name: 'openai' }));

    fireEvent.click(screen.getAllByLabelText('Model')[0]!);
    expect(screen.queryAllByRole('option').length).toBe(1);
    expect(screen.queryByText('gpt-4o')).toBeNull();
    expect(screen.queryByText('claude-opus-4-8')).toBeNull();
  });

  it('offers aider its own fallback model', () => {
    // Regression test for #3888: AiderProvider is a distinct CLI with its own default
    // model ('sonnet'), even though legacy aider providers are reported with a misleading
    // `type: 'claude-cli'` for lookup purposes elsewhere in franken-orchestrator.
    useDashboardStore.getState().setSnapshot({
      skills: [],
      security: snapshotSecurity,
      providers: [{ name: 'aider', type: 'claude-cli', available: true, failoverOrder: 0, executionProvider: 'aider' }],
    });

    render(<StepLlmTargets />);

    const providerSelect = screen.getAllByLabelText('Provider')[0]!;
    fireEvent.click(providerSelect);
    fireEvent.click(screen.getByRole('option', { name: 'aider' }));

    fireEvent.click(screen.getAllByLabelText('Model')[0]!);
    expect(screen.getByRole('option', { name: 'sonnet' })).toBeTruthy();
    expect(screen.queryByText('claude-opus-4-8')).toBeNull();
  });

  it('leaves the Model dropdown empty when the backend could not resolve an execution provider', () => {
    // A provider whose identity the backend couldn't map to a known CLI (unrecognized
    // type/name combination) must not fall back to guessing — same "no fallback options"
    // discipline as the loading/error/empty-provider-list states below.
    useDashboardStore.getState().setSnapshot({
      skills: [],
      security: snapshotSecurity,
      providers: [{ name: 'custom-thing', type: 'llm', available: true, failoverOrder: 0 }],
    });

    render(<StepLlmTargets />);

    const providerSelect = screen.getAllByLabelText('Provider')[0]!;
    fireEvent.click(providerSelect);
    fireEvent.click(screen.getByRole('option', { name: 'custom-thing' }));

    fireEvent.click(screen.getAllByLabelText('Model')[0]!);
    expect(screen.queryAllByRole('option').length).toBe(1);
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
