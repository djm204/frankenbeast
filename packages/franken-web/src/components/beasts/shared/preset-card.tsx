import { useId, type ReactNode } from 'react';

interface PresetOption {
  id: string;
  title: string;
  description: string;
  icon?: ReactNode;
}

interface PresetCardGroupProps {
  presets: PresetOption[];
  selected: string;
  onSelect: (id: string) => void;
}

export function PresetCardGroup({ presets, selected, onSelect }: PresetCardGroupProps) {
  const groupName = useId();

  return (
    <fieldset className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      <legend className="sr-only">Preset options</legend>
      {presets.map((preset, index) => {
        const inputId = `${groupName}-${index}`;
        const isSelected = preset.id === selected;

        return (
          <div key={preset.id}>
            <input
              id={inputId}
              type="radio"
              name={groupName}
              value={preset.id}
              checked={isSelected}
              onChange={() => onSelect(preset.id)}
              className="peer sr-only"
            />
            <label
              htmlFor={inputId}
              className={`block p-4 rounded-xl border-2 text-left transition-all min-h-[5rem] cursor-pointer
                peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-beast-accent
                ${isSelected
                  ? 'border-beast-accent bg-beast-accent-soft ring-1 ring-beast-accent/30'
                  : 'border-beast-border bg-beast-panel hover:bg-beast-elevated hover:border-beast-subtle'
                }`}
            >
              {preset.icon && <div className="mb-2">{preset.icon}</div>}
              <h3 className="text-sm font-medium text-beast-text">{preset.title}</h3>
              <p className="text-xs text-beast-subtle mt-1.5 leading-relaxed">{preset.description}</p>
            </label>
          </div>
        );
      })}
    </fieldset>
  );
}
