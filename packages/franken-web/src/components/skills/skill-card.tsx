interface SkillCardProps {
  name: string;
  enabled: boolean;
  hasContext: boolean;
  mcpServerCount: number;
  onToggle: (name: string, enabled: boolean) => void;
}

export function SkillCard({ name, enabled, hasContext, mcpServerCount, onToggle }: SkillCardProps) {
  return (
    <div className="skill-card rail-card">
      <div className="skill-card__header">
        <span className="skill-card__name">{name}</span>
        <button
          className={`skill-card__toggle ${enabled ? 'skill-card__toggle--on' : ''}`}
          onClick={() => onToggle(name, !enabled)}
          aria-label={`${enabled ? 'Disable' : 'Enable'} ${name}`}
        >
          {enabled ? '[on]' : '[off]'}
        </button>
      </div>
      <div className="skill-card__meta">
        {mcpServerCount > 0 && (
          <span>{mcpServerCount} MCP server{mcpServerCount > 1 ? 's' : ''}</span>
        )}
        {hasContext && <span>has context</span>}
      </div>
    </div>
  );
}
