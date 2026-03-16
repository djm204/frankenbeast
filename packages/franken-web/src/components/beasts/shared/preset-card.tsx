import type { ReactNode } from 'react';

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
  return (
    <div className="grid grid-cols-2 gap-3">
      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => onSelect(preset.id)}
          className={`p-4 rounded-xl border-2 text-left transition-colors
            ${preset.id === selected
              ? 'border-beast-accent bg-beast-accent-soft'
              : 'border-beast-border bg-beast-panel hover:bg-beast-elevated'
            }`}
        >
          {preset.icon && <div className="mb-2">{preset.icon}</div>}
          <h3 className="text-sm font-medium text-beast-text">{preset.title}</h3>
          <p className="text-xs text-beast-subtle mt-1">{preset.description}</p>
        </button>
      ))}
    </div>
  );
}
