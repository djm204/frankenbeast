import { useState } from 'react';
import { useBeastStore } from '../../../stores/beast-store';
import { GapBanner } from '../shared/gap-banner';

const STATIC_SKILLS = [
  { id: 'code-review', name: 'Code Review', description: 'Automated code review', category: 'quality' },
  { id: 'test-gen', name: 'Test Generation', description: 'Generate tests from code', category: 'testing' },
  { id: 'doc-gen', name: 'Documentation', description: 'Generate documentation', category: 'docs' },
  { id: 'refactor', name: 'Refactoring', description: 'Code refactoring suggestions', category: 'quality' },
  { id: 'security-scan', name: 'Security Scan', description: 'Security vulnerability detection', category: 'security' },
  { id: 'dep-check', name: 'Dependency Check', description: 'Check for outdated dependencies', category: 'ops' },
];

export function StepSkills() {
  const { stepValues, setStepValues } = useBeastStore();
  const values = (stepValues[4] ?? {}) as { selectedSkills?: string[] };
  const selected = values.selectedSkills ?? [];
  const [search, setSearch] = useState('');

  const filtered = STATIC_SKILLS.filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.description.toLowerCase().includes(search.toLowerCase())
  );

  function addSkill(id: string) {
    if (!selected.includes(id)) {
      setStepValues(4, { ...values, selectedSkills: [...selected, id] });
    }
  }

  function removeSkill(id: string) {
    setStepValues(4, { ...values, selectedSkills: selected.filter((s) => s !== id) });
  }

  return (
    <div className="p-6 space-y-4">
      <GapBanner message="Skill registry not yet available — showing static skill list." />

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((id) => {
            const skill = STATIC_SKILLS.find((s) => s.id === id);
            return (
              <span key={id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-beast-accent-soft text-beast-accent text-xs border border-beast-accent/30">
                {skill?.name ?? id}
                <button type="button" onClick={() => removeSkill(id)} className="hover:text-beast-danger" aria-label={`Remove ${skill?.name ?? id}`}>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="Search skills..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-beast-control border border-beast-border rounded-lg px-3 py-2
          text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none
          focus:ring-2 focus:ring-beast-accent"
      />

      {/* Skill cards */}
      <div className="grid grid-cols-2 gap-3">
        {filtered.map((skill) => {
          const isSelected = selected.includes(skill.id);
          return (
            <button
              key={skill.id}
              type="button"
              onClick={() => isSelected ? removeSkill(skill.id) : addSkill(skill.id)}
              className={`p-3 rounded-xl border text-left transition-colors
                ${isSelected
                  ? 'border-beast-accent bg-beast-accent-soft'
                  : 'border-beast-border bg-beast-panel hover:bg-beast-elevated'
                }`}
            >
              <h3 className="text-sm font-medium text-beast-text">{skill.name}</h3>
              <p className="text-xs text-beast-subtle mt-0.5">{skill.description}</p>
              <span className="text-[10px] text-beast-muted mt-1 inline-block">{skill.category}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
