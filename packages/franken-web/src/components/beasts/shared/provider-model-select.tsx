import { useId } from 'react';
import * as Select from '@radix-ui/react-select';
import * as Toggle from '@radix-ui/react-toggle';

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

interface SelectFieldProps {
  label: string;
  value: string;
  placeholder: string;
  options: { id: string; name: string }[];
  onValueChange: (value: string) => void;
  disabled?: boolean | undefined;
  describedBy?: string | undefined;
}

function SelectField({ label, value, placeholder, options, onValueChange, disabled, describedBy }: SelectFieldProps) {
  return (
    <Select.Root value={value} onValueChange={onValueChange} disabled={disabled ?? false}>
      <Select.Trigger
        aria-label={label}
        aria-describedby={describedBy}
        className="flex flex-1 items-center justify-between gap-2 bg-beast-control border border-beast-border rounded-lg px-3 py-2 text-beast-text text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent disabled:opacity-50"
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon aria-hidden="true" className="text-beast-subtle">▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="z-[90] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-beast-border bg-beast-panel text-beast-text shadow-xl"
        >
          <Select.Viewport className="p-1">
            {options.map((option) => (
              <Select.Item
                key={option.id}
                value={option.id}
                className="relative flex cursor-default select-none items-center rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-beast-accent-soft data-[highlighted]:text-beast-accent"
              >
                <Select.ItemText>{option.name}</Select.ItemText>
                <Select.ItemIndicator aria-hidden="true" className="absolute right-2">✓</Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function UseDefaultToggle({ pressed, onPressedChange }: { pressed: boolean; onPressedChange: ((pressed: boolean) => void) | undefined }) {
  return (
    <Toggle.Root
      pressed={pressed}
      onPressedChange={onPressedChange ?? (() => undefined)}
      aria-label="Use default"
      className="group flex items-center gap-2 text-sm text-beast-muted"
    >
      <span aria-hidden="true" className="h-5 w-9 rounded-full border border-beast-border bg-beast-control p-0.5 transition-colors group-data-[state=on]:bg-beast-accent-soft group-data-[state=on]:border-beast-accent">
        <span className="block h-3.5 w-3.5 rounded-full bg-beast-muted transition-transform group-data-[state=on]:translate-x-4" />
      </span>
      <span>Use default</span>
    </Toggle.Root>
  );
}

export function ProviderModelSelect({ providers, value, onChange, showUseDefault, useDefault, onUseDefaultChange }: ProviderModelSelectProps) {
  const modelGuidanceId = useId();
  const selectedProvider = providers.find((provider) => provider.id === value.provider);
  const hasProviders = providers.length > 0;

  if (showUseDefault && useDefault) {
    return <UseDefaultToggle pressed={true} onPressedChange={onUseDefaultChange} />;
  }

  return (
    <div className="space-y-2">
      {showUseDefault && (
        <UseDefaultToggle pressed={useDefault ?? false} onPressedChange={onUseDefaultChange} />
      )}
      <div className="flex gap-2">
        <SelectField
          label="Provider"
          value={value.provider}
          placeholder={hasProviders ? 'Select provider...' : 'No configured providers'}
          options={providers}
          disabled={!hasProviders}
          onValueChange={(provider) => onChange({ provider, model: '' })}
        />
        <SelectField
          label="Model"
          value={value.model}
          placeholder="Select model..."
          options={selectedProvider?.models ?? []}
          disabled={!selectedProvider}
          describedBy={!selectedProvider ? modelGuidanceId : undefined}
          onValueChange={(model) => onChange({ ...value, model })}
        />
      </div>
      {!selectedProvider && (
        <p id={modelGuidanceId} className="text-xs text-beast-muted">
          Select a provider to choose a model.
        </p>
      )}
    </div>
  );
}
