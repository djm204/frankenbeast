import { useEffect, useState } from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import type { TrackedAgentDetail, TrackedAgentSummary } from '../../lib/beast-api';
import { useBeastStore } from '../../stores/beast-store';
import { SlideInPanel } from './slide-in-panel';
import { StatusLight } from './status-light';
import { AgentDetailReadonly } from './agent-detail-readonly';
import { AgentDetailEdit } from './agent-detail-edit';
import { AgentActionBar } from './agent-action-bar';
import { LogViewerModal } from './log-viewer-modal';

type Mode = 'readonly' | 'edit';

interface AgentDetailPanelProps {
  isOpen: boolean;
  detail: TrackedAgentDetail;
  logs: string[];
  onClose: () => void;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onResume: () => void;
  onDelete: () => void;
  onKill: () => void;
  onSaveConfig: (values: Record<string, unknown>) => Promise<void>;
}

export function AgentDetailPanel({
  isOpen, detail, logs, onClose,
  onStart, onStop, onRestart, onResume, onDelete, onKill, onSaveConfig,
}: AgentDetailPanelProps) {
  const [mode, setMode] = useState<Mode>('readonly');
  const [showLogModal, setShowLogModal] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const setEditSnapshot = useBeastStore((state) => state.setEditSnapshot);
  const resetEdit = useBeastStore((state) => state.resetEdit);
  const agent = detail.agent;

  useEffect(() => {
    if (mode !== 'edit') return;
    resetEdit();
    setEditSnapshot(buildAgentEditSnapshot(agent));
  }, [agent.id, mode, resetEdit, setEditSnapshot]);

  const enterMode = (nextMode: Mode) => {
    setSaveError(null);
    setMode(nextMode);
    if (nextMode === 'readonly') resetEdit();
  };

  const handleSave = async (values: Record<string, unknown>) => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSaveConfig(values);
      resetEdit();
      setMode('readonly');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to save agent config.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SlideInPanel isOpen={isOpen} onClose={onClose}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-beast-border shrink-0">
          <StatusLight status={agent.status} />
          <span className="text-beast-text font-semibold truncate flex-1">{agent.name ?? agent.id}</span>
          <ToggleGroup.Root
            type="single"
            value={mode}
            onValueChange={(val) => { if (val) enterMode(val as Mode); }}
            aria-label="View mode"
            className="flex gap-0.5 bg-beast-control rounded-lg border border-beast-border p-0.5"
          >
            <ToggleGroup.Item
              value="readonly"
              className="px-2 py-1 text-xs rounded-md text-beast-muted data-[state=on]:bg-beast-accent-soft data-[state=on]:text-beast-accent transition-colors"
            >
              Readonly
            </ToggleGroup.Item>
            <ToggleGroup.Item
              value="edit"
              className="px-2 py-1 text-xs rounded-md text-beast-muted data-[state=on]:bg-beast-accent-soft data-[state=on]:text-beast-accent transition-colors"
            >
              Edit
            </ToggleGroup.Item>
          </ToggleGroup.Root>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="p-1.5 rounded-lg text-beast-subtle hover:text-beast-text hover:bg-beast-elevated transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        {mode === 'readonly' ? (
          <AgentDetailReadonly
            detail={detail}
            logs={logs}
            onExpandLogs={() => setShowLogModal(true)}
          />
        ) : (
          <AgentDetailEdit
            onSave={(values) => { void handleSave(values); }}
            onCancel={() => enterMode('readonly')}
            error={saveError}
            saving={saving}
          />
        )}

        {/* Action bar */}
        <AgentActionBar
          status={agent.status}
          hasLinkedRun={!!agent.dispatchRunId}
          onStart={onStart}
          onStop={onStop}
          onRestart={onRestart}
          onResume={onResume}
          onDelete={onDelete}
          onKill={onKill}
        />
      </SlideInPanel>

      <LogViewerModal
        isOpen={showLogModal}
        onClose={() => setShowLogModal(false)}
        logs={logs}
        events={detail.events}
      />
    </>
  );
}

function buildAgentEditSnapshot(agent: TrackedAgentSummary): Record<string, unknown> {
  const identity = isRecord(agent.initConfig.identity) ? agent.initConfig.identity : undefined;
  return {
    name: stringValue(agent.name) ?? stringValue(identity?.name) ?? stringValue(agent.initConfig.name) ?? '',
    description: stringValue(identity?.description) ?? stringValue(agent.initConfig.description) ?? '',
    ...(agent.moduleConfig !== undefined ? { moduleConfig: agent.moduleConfig } : {}),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
