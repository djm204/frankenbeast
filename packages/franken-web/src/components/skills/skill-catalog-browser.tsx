import { useState } from 'react';
import { SkillCard } from './skill-card';
import type { DashboardSkill } from '../../lib/dashboard-api';

interface SkillCatalogBrowserProps {
  skills: DashboardSkill[];
  onToggle: (name: string, enabled: boolean) => void;
}

export function SkillCatalogBrowser({ skills, onToggle }: SkillCatalogBrowserProps) {
  const [filter, setFilter] = useState('');
  const filtered = skills.filter((s) =>
    s.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="skill-catalog">
      <div className="skill-catalog__search">
        <label className="field-stack">
          <span>Filter skills</span>
          <input
            type="text"
            placeholder="Filter skills..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="field-control"
          />
        </label>
      </div>
      <div className="skill-catalog__list">
        {filtered.length === 0 && (
          <p className="skill-catalog__empty">No skills found.</p>
        )}
        {filtered.map((skill) => (
          <SkillCard
            key={skill.name}
            name={skill.name}
            enabled={skill.enabled}
            hasContext={skill.hasContext}
            mcpServerCount={skill.mcpServerCount}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}
