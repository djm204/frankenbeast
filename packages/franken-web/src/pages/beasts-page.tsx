import { useEffect, useState } from 'react';
import type {
  BeastCatalogEntry,
  BeastContainerRuntimeStatus,
  BeastRunSummary,
  TrackedAgentDetail,
  TrackedAgentSummary,
} from '../lib/beast-api';
import { AgentList } from '../components/beasts/agent-list';
import { AgentDetailPanel } from '../components/beasts/agent-detail-panel';
import type { AgentLifecycleAction } from '../components/beasts/agent-action-bar';
import { WizardDialog } from '../components/beasts/wizard-dialog';
import { useBeastStore } from '../stores/beast-store';
import { useDashboardStore } from '../stores/dashboard-store';
import type { DashboardApiClient } from '../lib/dashboard-api';

interface BeastsPageProps {
  agents: TrackedAgentSummary[];
  agentDetail: TrackedAgentDetail | null;
  catalog: BeastCatalogEntry[];
  runs: BeastRunSummary[];
  containerRuntime?: BeastContainerRuntimeStatus;
  disabled: boolean;
  error: string | null;
  logs: string[];
  pendingAgentActions?: Record<string, AgentLifecycleAction | undefined>;
  selectedAgentId: string | null;
  dashboardClient: DashboardApiClient;
  onClose: () => void;
  onLaunch: (config: Record<string, unknown>) => Promise<void>;
  onDelete: (agentId: string) => void;
  onKill: (agentId: string) => void;
  onRestart: (agentId: string) => void;
  onResume: (agentId: string) => void;
  onSaveAgentConfig: (agentId: string, values: Record<string, unknown>) => Promise<void>;
  onSelectAgent: (agentId: string) => void;
  onStart: (agentId: string) => void;
  onStop: (agentId: string) => void;
}

export function BeastsPage({
  agents,
  agentDetail,
  catalog,
  runs,
  containerRuntime,
  disabled,
  error,
  logs,
  pendingAgentActions = {},
  selectedAgentId,
  dashboardClient,
  onClose,
  onLaunch,
  onDelete,
  onKill,
  onRestart,
  onResume,
  onSaveAgentConfig,
  onSelectAgent,
  onStart,
  onStop,
}: BeastsPageProps) {
  const [showWizard, setShowWizard] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const resetWizard = useBeastStore((s) => s.resetWizard);
  const setSnapshot = useDashboardStore((s) => s.setSnapshot);
  const setDashboardLoading = useDashboardStore((s) => s.setLoading);
  const setDashboardError = useDashboardStore((s) => s.setError);
  const createAgentDisabledReason = error ?? 'Beast API is not available. Configure the operator token/API client before creating agents.';

  useEffect(() => {
    if (!showWizard) return undefined;
    let cancelled = false;
    let settled = false;
    setDashboardLoading(true);
    setDashboardError(null);
    dashboardClient.fetchSnapshot()
      .then((snapshot) => {
        settled = true;
        if (!cancelled) setSnapshot(snapshot);
      })
      .catch((err) => {
        settled = true;
        if (!cancelled) setDashboardError(err instanceof Error ? err.message : 'Provider configuration request failed.');
      });
    return () => {
      cancelled = true;
      if (!settled) setDashboardLoading(false);
    };
  }, [dashboardClient, setDashboardError, setDashboardLoading, setSnapshot, showWizard]);

  function handleOpenWizard() {
    if (disabled) return;
    resetWizard();
    setLaunchError(null);
    setShowWizard(true);
  }

  async function handleLaunch(config: Record<string, unknown>) {
    setLaunching(true);
    setLaunchError(null);
    try {
      await onLaunch(config);
      setShowWizard(false);
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : 'Failed to create agent.');
    } finally {
      setLaunching(false);
    }
  }

  return (
    <main className="flex-1 flex flex-col min-h-0 bg-beast-bg">
      {error && (
        <div className="px-6 py-3 bg-red-900/30 border-b border-red-700 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between px-6 py-4 border-b border-beast-border shrink-0">
        <h2 className="text-beast-text font-semibold text-lg">Agent fleet</h2>
        <button
          type="button"
          onClick={handleOpenWizard}
          disabled={disabled}
          className="px-5 py-2.5 rounded-lg bg-beast-accent text-beast-bg text-sm font-medium
            hover:bg-beast-accent-strong transition-colors disabled:opacity-50"
        >
          + Create Agent
        </button>
      </div>

      <AgentList
        agents={agents}
        runs={runs}
        selectedAgentId={selectedAgentId}
        onSelectAgent={onSelectAgent}
        onCreateAgent={handleOpenWizard}
        createAgentDisabled={disabled}
        createAgentDisabledReason={disabled ? createAgentDisabledReason : null}
      />

      {agentDetail && (
        <AgentDetailPanel
          isOpen={!!agentDetail}
          detail={agentDetail}
          logs={logs}
          onClose={onClose}
          pendingAction={pendingAgentActions[agentDetail.agent.id] ?? null}
          onStart={() => onStart(agentDetail.agent.id)}
          onStop={() => onStop(agentDetail.agent.id)}
          onRestart={() => onRestart(agentDetail.agent.id)}
          onResume={() => onResume(agentDetail.agent.id)}
          onSaveConfig={(values) => onSaveAgentConfig(agentDetail.agent.id, values)}
          onDelete={() => onDelete(agentDetail.agent.id)}
          onKill={() => onKill(agentDetail.agent.id)}
        />
      )}

      <WizardDialog
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        onLaunch={handleLaunch}
        containerRuntime={containerRuntime}
        catalog={catalog}
        launching={launching}
        launchError={launchError}
      />
    </main>
  );
}
