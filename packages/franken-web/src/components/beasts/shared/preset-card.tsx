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
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => onSelect(preset.id)}
          className={`p-4 rounded-xl border-2 text-left transition-all min-h-[5rem]
            ${preset.id === selected
              ? 'border-beast-accent bg-beast-accent-soft ring-1 ring-beast-accent/30'
              : 'border-beast-border bg-beast-panel hover:bg-beast-elevated hover:border-beast-subtle'
            }`}
        >
          {preset.icon && <div className="mb-2">{preset.icon}</div>}
          <h3 className="text-sm font-medium text-beast-text">{preset.title}</h3>
          <p className="text-xs text-beast-subtle mt-1.5 leading-relaxed">{preset.description}</p>
        </button>
      ))}
    </div>
  );
}
