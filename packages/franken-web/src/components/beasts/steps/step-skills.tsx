import { useState } from 'react';
import { useBeastStore } from '../../../stores/beast-store';

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
    <div className="p-8 space-y-6">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-beast-muted mb-2 uppercase tracking-wide">Selected</h3>
          <div className="flex flex-wrap gap-2">
            {selected.map((id) => {
              const skill = STATIC_SKILLS.find((s) => s.id === id);
              return (
                <span key={id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-beast-accent-soft text-beast-accent text-xs font-medium border border-beast-accent/30">
                  {skill?.name ?? id}
                  <button type="button" onClick={() => removeSkill(id)} className="hover:text-beast-danger p-0.5" aria-label={`Remove ${skill?.name ?? id}`}>
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

      {/* Search */}
      <input
        type="text"
        placeholder="Search skills..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-beast-control border border-beast-border rounded-lg px-3 py-2.5
          text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none
          focus:ring-2 focus:ring-beast-accent"
      />

      {/* Skill cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((skill) => {
          const isSelected = selected.includes(skill.id);
          return (
            <button
              key={skill.id}
              type="button"
              onClick={() => isSelected ? removeSkill(skill.id) : addSkill(skill.id)}
              className={`p-4 rounded-xl border-2 text-left transition-all min-h-[5rem]
                ${isSelected
                  ? 'border-beast-accent bg-beast-accent-soft ring-1 ring-beast-accent/30'
                  : 'border-beast-border bg-beast-panel hover:bg-beast-elevated hover:border-beast-subtle'
                }`}
            >
              <h3 className="text-sm font-medium text-beast-text">{skill.name}</h3>
              <p className="text-xs text-beast-subtle mt-1 leading-relaxed">{skill.description}</p>
              <span className="text-[10px] text-beast-muted mt-2 inline-block px-1.5 py-0.5 rounded bg-beast-control">{skill.category}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
