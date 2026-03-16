export interface ProviderOption {
  id: string;
  name: string;
  models: { id: string; name: string }[];
}

interface ProviderModelSelectProps {
  providers: ProviderOption[];
  value: { provider: string; model: string };
  onChange: (value: { provider: string; model: string }) => void;
  showUseDefault?: boolean;
  useDefault?: boolean;
  onUseDefaultChange?: (useDefault: boolean) => void;
}

export function ProviderModelSelect({ providers, value, onChange, showUseDefault, useDefault, onUseDefaultChange }: ProviderModelSelectProps) {
  const selectedProvider = providers.find((p) => p.id === value.provider);

  if (showUseDefault && useDefault) {
    return (
      <label className="flex items-center gap-2 text-sm text-beast-muted">
        <input
          type="checkbox"
          checked={useDefault}
          onChange={(e) => onUseDefaultChange?.(e.target.checked)}
          aria-label="Use default"
          className="accent-beast-accent"
        />
        Use default
      </label>
    );
  }

  return (
    <div className="space-y-2">
      {showUseDefault && (
        <label className="flex items-center gap-2 text-sm text-beast-muted">
          <input
            type="checkbox"
            checked={useDefault ?? false}
            onChange={(e) => onUseDefaultChange?.(e.target.checked)}
            aria-label="Use default"
            className="accent-beast-accent"
          />
          Use default
        </label>
      )}
      <div className="flex gap-2">
        <select
          value={value.provider}
          onChange={(e) => onChange({ provider: e.target.value, model: '' })}
          aria-label="Provider"
          className="flex-1 bg-beast-control border border-beast-border rounded-lg px-3 py-2 text-beast-text text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent"
        >
          <option value="">Select provider...</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={value.model}
          onChange={(e) => onChange({ ...value, model: e.target.value })}
          aria-label="Model"
          disabled={!selectedProvider}
          className="flex-1 bg-beast-control border border-beast-border rounded-lg px-3 py-2 text-beast-text text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent disabled:opacity-50"
        >
          <option value="">Select model...</option>
          {selectedProvider?.models.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
