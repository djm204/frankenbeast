import { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';

export type AgentLifecycleAction = 'start' | 'stop' | 'restart' | 'resume' | 'delete' | 'kill';

interface AgentActionBarProps {
  status: string;
  hasLinkedRun: boolean;
  agentLabel?: string;
  pendingAction?: AgentLifecycleAction | null;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onResume: () => void;
  onDelete: () => void;
  onKill: () => void;
}

function ActionButton({ label, onClick, variant = 'default', disabled = false }: {
  label: string; onClick: () => void; variant?: 'default' | 'danger'; disabled?: boolean;
}) {
  const base = 'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors';
  const styles = variant === 'danger'
    ? `${base} bg-beast-danger/20 text-beast-danger hover:bg-beast-danger/30 border border-beast-danger/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-beast-danger/20`
    : `${base} bg-beast-control text-beast-text hover:bg-beast-elevated border border-beast-border disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-beast-control`;
  return <button type="button" onClick={onClick} disabled={disabled} className={styles}>{label}</button>;
}

function ConfirmDangerAction({
  label,
  title,
  description,
  confirmLabel,
  onConfirm,
  disabled = false,
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <button type="button" disabled={disabled} className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors bg-beast-danger/20 text-beast-danger hover:bg-beast-danger/30 border border-beast-danger/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-beast-danger/20">
          {label}
        </button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay data-beast-dialog-layer="overlay" data-beast-panel-portal="true" className="fixed inset-0 bg-black/50 z-[60]" />
        <AlertDialog.Content
          data-beast-dialog-layer="content"
          data-beast-panel-portal="true"
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-beast-panel border border-beast-border rounded-xl p-6 z-[60] max-w-md"
        >
          <AlertDialog.Title className="text-beast-text font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-beast-muted text-sm mt-2">
            {description}
          </AlertDialog.Description>
          <div className="flex gap-3 mt-4 justify-end">
            <AlertDialog.Cancel asChild>
              <button type="button" className="px-3 py-1.5 rounded-lg text-sm bg-beast-control text-beast-text border border-beast-border">Cancel</button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button type="button" onClick={onConfirm} disabled={disabled} className="px-3 py-1.5 rounded-lg text-sm bg-beast-danger text-white disabled:opacity-50 disabled:cursor-not-allowed">{confirmLabel}</button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

const PENDING_LABELS: Record<AgentLifecycleAction, string> = {
  start: 'Starting...',
  stop: 'Stopping...',
  restart: 'Restarting...',
  resume: 'Resuming...',
  delete: 'Deleting...',
  kill: 'Killing...',
};

function actionLabel(action: AgentLifecycleAction, label: string, pendingAction: AgentLifecycleAction | null | undefined): string {
  return pendingAction === action ? PENDING_LABELS[action] : label;
}

export function AgentActionBar({ status, hasLinkedRun, agentLabel = 'this tracked agent', pendingAction = null, onStart, onStop, onRestart, onResume, onDelete, onKill }: AgentActionBarProps) {
  const [forceRestart, setForceRestart] = useState(false);

  const isInitOrDispatch = status === 'initializing' || status === 'dispatching';
  const isRunning = status === 'running';
  const isAwaitingApproval = status === 'awaiting_approval';
  const isStopped = status === 'stopped';
  const isTerminal = status === 'failed' || status === 'completed';
  const isDeleted = status === 'deleted';
  const lifecyclePending = pendingAction !== null;

  return (
    <div className="flex items-center gap-2 flex-wrap p-4 border-t border-beast-border">
      {(isInitOrDispatch || isRunning || isAwaitingApproval) && <ActionButton label={actionLabel('stop', 'Stop', pendingAction)} onClick={onStop} disabled={lifecyclePending} />}

      {isRunning && (
        <>
          {forceRestart ? (
            <AlertDialog.Root>
              <AlertDialog.Trigger asChild>
                <button type="button" disabled={lifecyclePending} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-beast-danger/20 text-beast-danger border border-beast-danger/30 disabled:opacity-50 disabled:cursor-not-allowed">
                  {actionLabel('restart', 'Restart', pendingAction)}
                </button>
              </AlertDialog.Trigger>
              <AlertDialog.Portal>
                <AlertDialog.Overlay data-beast-dialog-layer="overlay" data-beast-panel-portal="true" className="fixed inset-0 bg-black/50 z-[60]" />
                <AlertDialog.Content
                  data-beast-dialog-layer="content"
                  data-beast-panel-portal="true"
                  className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-beast-panel border border-beast-border rounded-xl p-6 z-[60] max-w-md"
                >
                  <AlertDialog.Title className="text-beast-text font-semibold">Force Restart</AlertDialog.Title>
                  <AlertDialog.Description className="text-beast-muted text-sm mt-2">
                    Force restart will interrupt the agent mid-turn. Continue?
                  </AlertDialog.Description>
                  <div className="flex gap-3 mt-4 justify-end">
                    <AlertDialog.Cancel asChild>
                      <button type="button" className="px-3 py-1.5 rounded-lg text-sm bg-beast-control text-beast-text border border-beast-border">Cancel</button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                      <button type="button" onClick={onRestart} disabled={lifecyclePending} className="px-3 py-1.5 rounded-lg text-sm bg-beast-danger text-white disabled:opacity-50 disabled:cursor-not-allowed">Force Restart</button>
                    </AlertDialog.Action>
                  </div>
                </AlertDialog.Content>
              </AlertDialog.Portal>
            </AlertDialog.Root>
          ) : (
            <ActionButton label={actionLabel('restart', 'Restart', pendingAction)} onClick={onRestart} disabled={lifecyclePending} />
          )}
          <ConfirmDangerAction
            label={actionLabel('kill', 'Kill', pendingAction)}
            title="Kill tracked agent"
            description={`Kill ${agentLabel}? This interrupts the linked run immediately and cannot be undone from the dashboard.`}
            confirmLabel="Kill agent"
            onConfirm={onKill}
            disabled={lifecyclePending}
          />
          <label className={`flex items-center gap-1.5 text-xs text-beast-subtle ml-2 ${lifecyclePending ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
            <input type="checkbox" checked={forceRestart} disabled={lifecyclePending} onChange={(e) => setForceRestart(e.target.checked)} className="accent-beast-danger" />
            Force
          </label>
        </>
      )}

      {(isStopped || isTerminal) && <ActionButton label={actionLabel('start', 'Start', pendingAction)} onClick={onStart} disabled={lifecyclePending} />}
      {isStopped && hasLinkedRun && <ActionButton label={actionLabel('resume', 'Resume', pendingAction)} onClick={onResume} disabled={lifecyclePending} />}
      {(isStopped || isTerminal) && (
        <ConfirmDangerAction
          label={actionLabel('delete', 'Delete', pendingAction)}
          title="Delete tracked agent"
          description={`Delete ${agentLabel}? This soft-deletes it and removes it from the dashboard history.`}
          confirmLabel="Delete agent"
          onConfirm={onDelete}
          disabled={lifecyclePending}
        />
      )}

      {isAwaitingApproval && (
        <div className="text-sm text-beast-muted">
          <span className="font-medium text-beast-text">Approval required</span>
          <span className="ml-2">Resolve the pending approval in the linked chat, or stop the agent to cancel it.</span>
        </div>
      )}

      {isDeleted && (
        <div className="text-sm text-beast-muted">
          <span className="font-medium text-beast-text">Agent deleted</span>
          <span className="ml-2">This tracked agent is no longer operable.</span>
        </div>
      )}
    </div>
  );
}
