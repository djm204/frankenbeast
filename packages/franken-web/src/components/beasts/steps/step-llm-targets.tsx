import { useBeastStore } from '../../../stores/beast-store';
import { ProviderModelSelect, type ProviderOption } from '../shared/provider-model-select';

const FALLBACK_PROVIDERS: ProviderOption[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
    ],
  },
];

const ACTION_TYPES = ['planning', 'execution', 'critique', 'reflection', 'chat'];

export function StepLlmTargets() {
  const { stepValues, setStepValues } = useBeastStore();
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
        <ProviderModelSelect
          providers={FALLBACK_PROVIDERS}
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
                  providers={FALLBACK_PROVIDERS}
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
