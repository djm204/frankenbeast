import type { TrackedAgentDetail, TrackedAgentSummary, BeastCatalogEntry } from '../lib/beast-api';
import { AgentList } from '../components/beasts/agent-list';
import { AgentDetailPanel } from '../components/beasts/agent-detail-panel';

interface BeastsPageProps {
  agents: TrackedAgentSummary[];
  agentDetail: TrackedAgentDetail | null;
  catalog: BeastCatalogEntry[];
  disabled: boolean;
  error: string | null;
  logs: string[];
  selectedAgentId: string | null;
  onClose: () => void;
  onCreate: () => void;
  onDelete: (agentId: string) => void;
  onKill: (agentId: string) => void;
  onRestart: (agentId: string) => void;
  onResume: (agentId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onStart: (agentId: string) => void;
  onStop: (agentId: string) => void;
}

export function BeastsPage({
  agents,
  agentDetail,
  disabled,
  error,
  logs,
  selectedAgentId,
  onClose,
  onCreate,
  onDelete,
  onKill,
  onRestart,
  onResume,
  onSelectAgent,
  onStart,
  onStop,
}: BeastsPageProps) {
  return (
    <main className="flex-1 flex flex-col min-h-0 bg-beast-bg">
      {error && (
        <div className="px-4 py-2 bg-red-900/30 border-b border-red-700 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-3 border-b border-beast-border shrink-0">
        <h2 className="text-beast-text font-semibold text-lg">Beasts</h2>
        <button
          type="button"
          onClick={onCreate}
          disabled={disabled}
          className="px-3 py-1.5 rounded-lg bg-beast-accent text-beast-bg text-sm font-medium hover:bg-beast-accent-strong transition-colors disabled:opacity-50"
        >
          Create Agent
        </button>
      </div>

      <AgentList
        agents={agents}
        selectedAgentId={selectedAgentId}
        onSelectAgent={onSelectAgent}
        onCreateAgent={onCreate}
      />

      {agentDetail && (
        <AgentDetailPanel
          isOpen={!!agentDetail}
          detail={agentDetail}
          logs={logs}
          onClose={onClose}
          onStart={() => onStart(agentDetail.agent.id)}
          onStop={() => onStop(agentDetail.agent.id)}
          onRestart={() => onRestart(agentDetail.agent.id)}
          onResume={() => onResume(agentDetail.agent.id)}
          onDelete={() => onDelete(agentDetail.agent.id)}
          onKill={() => onKill(agentDetail.agent.id)}
        />
      )}
    </main>
  );
}
