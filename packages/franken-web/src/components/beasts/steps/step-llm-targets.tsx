import { useBeastStore } from '../../../stores/beast-store';
import { useDashboardStore } from '../../../stores/dashboard-store';
import { ProviderModelSelect } from '../shared/provider-model-select';
import { dashboardProvidersToModelOptions } from '../shared/provider-catalog';

const ACTION_TYPES = ['planning', 'execution', 'critique', 'reflection', 'chat'];

export function StepLlmTargets() {
  const { stepValues, setStepValues } = useBeastStore();
  const dashboardProviders = useDashboardStore((state) => state.providers);
  const providersLoading = useDashboardStore((state) => state.loading);
  const providersError = useDashboardStore((state) => state.error);
  const providers = dashboardProvidersToModelOptions(dashboardProviders);
  const hasProviderStatus = providersLoading || providersError || providers.length === 0;
  const values = (stepValues[2] ?? {}) as {
    defaultProvider?: string;
    defaultModel?: string;
    overrides?: Record<string, { provider: string; model: string; useDefault: boolean }>;
  };

  function updateDefault(val: { provider: string; model: string }) {
    setStepValues(2, { ...values, defaultProvider: val.provider, defaultModel: val.model });
  }

  function updateOverride(action: string, val: { provider: string; model: string }) {
    const overrides = { ...(values.overrides ?? {}) };
    overrides[action] = { ...overrides[action], ...val, useDefault: false };
    setStepValues(2, { ...values, overrides });
  }

  function toggleUseDefault(action: string, useDefault: boolean) {
    const overrides = { ...(values.overrides ?? {}) };
    overrides[action] = { ...(overrides[action] ?? { provider: '', model: '' }), useDefault };
    setStepValues(2, { ...values, overrides });
  }

  return (
    <div className="p-8 space-y-8">
      <div className="max-w-lg">
        <h3 className="text-sm font-medium text-beast-text mb-3">Default Model</h3>
        {hasProviderStatus && (
          <ProviderStatusNotice loading={providersLoading} error={providersError} empty={!providersLoading && !providersError && providers.length === 0} />
        )}
        <ProviderModelSelect
          providers={providers}
          value={{ provider: values.defaultProvider ?? '', model: values.defaultModel ?? '' }}
          onChange={updateDefault}
        />
        <p className="text-xs text-beast-subtle mt-2">Falls back to process-level config if unset</p>
      </div>

      <div>
        <h3 className="text-sm font-medium text-beast-text mb-3">Per-Action Overrides</h3>
        <p className="text-xs text-beast-subtle mb-4">Override the default model for specific agent actions.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ACTION_TYPES.map((action) => {
            const override = values.overrides?.[action];
            return (
              <div key={action} className="p-5 rounded-xl bg-beast-elevated border border-beast-border">
                <h4 className="text-xs font-medium text-beast-muted mb-3 capitalize">{action}</h4>
                <ProviderModelSelect
                  providers={providers}
                  value={{ provider: override?.provider ?? '', model: override?.model ?? '' }}
                  onChange={(val) => updateOverride(action, val)}
                  showUseDefault
                  useDefault={override?.useDefault ?? true}
                  onUseDefaultChange={(ud) => toggleUseDefault(action, ud)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ProviderStatusNotice({ loading, error, empty }: { loading: boolean; error: string | null; empty: boolean }) {
  if (loading) {
    return (
      <p className="mb-3 rounded-lg border border-beast-border bg-beast-panel px-3 py-2 text-xs text-beast-subtle">
        Loading configured LLM providers…
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="mb-3 rounded-lg border border-red-700 bg-red-900/20 px-3 py-2 text-xs text-red-300">
        Could not load configured LLM providers: {error}
      </p>
    );
  }

  if (empty) {
    return (
      <p className="mb-3 rounded-lg border border-beast-border bg-beast-panel px-3 py-2 text-xs text-beast-subtle">
        No configured LLM providers are available. Check dashboard provider configuration before choosing overrides.
      </p>
    );
  }

  return null;
}
