import { useState } from 'react';
import { useBeastStore } from '../../../stores/beast-store';
import { useDashboardStore } from '../../../stores/dashboard-store';

export function StepSkills() {
  const { stepValues, setStepValues } = useBeastStore();
  const skills = useDashboardStore((state) => state.skills);
  const loading = useDashboardStore((state) => state.loading);
  const error = useDashboardStore((state) => state.error);
  const values = (stepValues[4] ?? {}) as { selectedSkills?: string[] };
  const selected = values.selectedSkills ?? [];
  const [search, setSearch] = useState('');

  const enabledSkills = skills.filter((skill) => skill.enabled);
  const filtered = enabledSkills.filter((skill) =>
    !search || skill.name.toLowerCase().includes(search.toLowerCase()),
  );

  function addSkill(id: string) {
    if (!selected.includes(id)) {
      setStepValues(4, { ...values, selectedSkills: [...selected, id] });
    }
  }

  function removeSkill(id: string) {
    setStepValues(4, { ...values, selectedSkills: selected.filter((skillId) => skillId !== id) });
  }

  function toggleSkill(id: string, isSelected: boolean) {
    if (isSelected) {
      removeSkill(id);
      return;
    }

    addSkill(id);
  }

  if (loading) {
    return (
      <div className="p-8">
        <p role="status" aria-live="polite" className="text-sm text-beast-muted">
          Loading installed skills…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <p role="alert" className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-700 text-red-300 text-sm">
          Unable to load installed skills. {error}
        </p>
      </div>
    );
  }

  if (enabledSkills.length === 0) {
    return (
      <div className="p-8">
        <p role="status" className="text-sm text-beast-muted">
          No enabled installed skills are available.
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {selected.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-beast-muted mb-2 uppercase tracking-wide">Selected</h3>
          <div className="flex flex-wrap gap-2">
            {selected.map((id) => {
              const skill = skills.find((candidate) => candidate.name === id);
              const label = skill?.name ?? id;
              return (
                <span key={id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-beast-accent-soft text-beast-accent text-xs font-medium border border-beast-accent/30">
                  {label}
                  <button
                    type="button"
                    onClick={() => removeSkill(id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        removeSkill(id);
                      }
                    }}
                    className="hover:text-beast-danger p-0.5"
                    aria-label={`Remove ${label}`}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <label className="block">
        <span className="sr-only">Search installed skills</span>
        <input
          type="text"
          placeholder="Search skills..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full bg-beast-control border border-beast-border rounded-lg px-3 py-2.5
            text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none
            focus:ring-2 focus:ring-beast-accent"
        />
      </label>

      {filtered.length === 0 ? (
        <p role="status" className="text-sm text-beast-muted">No installed skills match your search.</p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((skill) => {
            const isSelected = selected.includes(skill.name);
            return (
              <button
                key={skill.name}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggleSkill(skill.name, isSelected)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleSkill(skill.name, isSelected);
                  }
                }}
                className={`p-4 rounded-xl border-2 text-left transition-all min-h-[5rem]
                  ${isSelected
                    ? 'border-beast-accent bg-beast-accent-soft ring-1 ring-beast-accent/30'
                    : 'border-beast-border bg-beast-panel hover:bg-beast-elevated hover:border-beast-subtle'
                  }`}
              >
                <h3 className="text-sm font-medium text-beast-text">{skill.name}</h3>
                <p className="text-xs text-beast-subtle mt-1 leading-relaxed">Installed runtime skill</p>
                <div className="flex flex-wrap gap-1.5 mt-2" aria-label={`${skill.name} capabilities`}>
                  {skill.hasContext && (
                    <span className="text-[10px] text-beast-muted inline-block px-1.5 py-0.5 rounded bg-beast-control">Context</span>
                  )}
                  {skill.mcpServerCount > 0 && (
                    <span className="text-[10px] text-beast-muted inline-block px-1.5 py-0.5 rounded bg-beast-control">
                      {skill.mcpServerCount} MCP {skill.mcpServerCount === 1 ? 'server' : 'servers'}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
