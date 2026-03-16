import type { TrackedAgentSummary } from '../../lib/beast-api';
import { StatusLight } from './status-light';

export type Density = 'compact' | 'comfortable' | 'detailed';

interface AgentRowProps {
  agent: TrackedAgentSummary;
  density: Density;
  selected: boolean;
  onClick: (agentId: string) => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function AgentRow({ agent, density, selected, onClick }: AgentRowProps) {
  const selectedClass = selected ? 'bg-beast-accent-soft border-beast-accent' : 'border-beast-border';

  return (
    <button
      type="button"
      onClick={() => onClick(agent.id)}
      className={`w-full text-left rounded-xl border p-4 transition-colors duration-150
        bg-beast-panel hover:bg-beast-elevated cursor-pointer ${selectedClass}`}
    >
      <div className="flex items-center gap-3">
        <StatusLight status={agent.status} />
        <span className="text-beast-text font-medium truncate flex-1">{agent.name ?? agent.id}</span>
        <span className="text-beast-subtle text-sm">{formatTime(agent.createdAt)}</span>
      </div>

      {(density === 'comfortable' || density === 'detailed') && (
        <div className="flex items-center gap-2 mt-2 ml-6">
          <span className="text-xs px-2.5 py-1 rounded-full bg-beast-control text-beast-accent border border-beast-border">
            {agent.initAction.kind}
          </span>
          {agent.moduleConfig && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-beast-control text-beast-muted border border-beast-border">
              {Object.values(agent.moduleConfig).filter(Boolean).length} modules
            </span>
          )}
        </div>
      )}

      {density === 'detailed' && (
        <div className="flex items-center gap-4 mt-2 ml-6 text-xs text-beast-subtle">
          <span>by {agent.createdByUser}</span>
          {agent.dispatchRunId && <span>run: {agent.dispatchRunId.slice(0, 8)}…</span>}
        </div>
      )}
    </button>
  );
}
