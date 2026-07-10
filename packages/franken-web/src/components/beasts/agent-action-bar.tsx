import { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';

interface AgentActionBarProps {
  status: string;
  hasLinkedRun: boolean;
  agentLabel?: string;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onResume: () => void;
  onDelete: () => void;
  onKill: () => void;
}

function ActionButton({ label, onClick, variant = 'default' }: {
  label: string; onClick: () => void; variant?: 'default' | 'danger';
}) {
  const base = 'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors';
  const styles = variant === 'danger'
    ? `${base} bg-beast-danger/20 text-beast-danger hover:bg-beast-danger/30 border border-beast-danger/30`
    : `${base} bg-beast-control text-beast-text hover:bg-beast-elevated border border-beast-border`;
  return <button type="button" onClick={onClick} className={styles}>{label}</button>;
}

function ConfirmDangerAction({
  label,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <button type="button" className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors bg-beast-danger/20 text-beast-danger hover:bg-beast-danger/30 border border-beast-danger/30">
          {label}
        </button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay data-beast-dialog-layer="overlay" className="fixed inset-0 bg-black/50 z-[60]" />
        <AlertDialog.Content data-beast-dialog-layer="content" className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-beast-panel border border-beast-border rounded-xl p-6 z-[60] max-w-md">
          <AlertDialog.Title className="text-beast-text font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-beast-muted text-sm mt-2">
            {description}
          </AlertDialog.Description>
          <div className="flex gap-3 mt-4 justify-end">
            <AlertDialog.Cancel asChild>
              <button type="button" className="px-3 py-1.5 rounded-lg text-sm bg-beast-control text-beast-text border border-beast-border">Cancel</button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button type="button" onClick={onConfirm} className="px-3 py-1.5 rounded-lg text-sm bg-beast-danger text-white">{confirmLabel}</button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function AgentActionBar({ status, hasLinkedRun, agentLabel = 'this tracked agent', onStart, onStop, onRestart, onResume, onDelete, onKill }: AgentActionBarProps) {
  const [forceRestart, setForceRestart] = useState(false);

  const isInitOrDispatch = status === 'initializing' || status === 'dispatching';
  const isRunning = status === 'running';
  const isAwaitingApproval = status === 'awaiting_approval';
  const isStopped = status === 'stopped';
  const isTerminal = status === 'failed' || status === 'completed';
  const isDeleted = status === 'deleted';

  return (
    <div className="flex items-center gap-2 flex-wrap p-4 border-t border-beast-border">
      {(isInitOrDispatch || isRunning || isAwaitingApproval) && <ActionButton label="Stop" onClick={onStop} />}

      {isRunning && (
        <>
          {forceRestart ? (
            <AlertDialog.Root>
              <AlertDialog.Trigger asChild>
                <button type="button" className="px-3 py-1.5 rounded-lg text-sm font-medium bg-beast-danger/20 text-beast-danger border border-beast-danger/30">
                  Restart
                </button>
              </AlertDialog.Trigger>
              <AlertDialog.Portal>
                <AlertDialog.Overlay data-beast-dialog-layer="overlay" className="fixed inset-0 bg-black/50 z-[60]" />
                <AlertDialog.Content data-beast-dialog-layer="content" className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-beast-panel border border-beast-border rounded-xl p-6 z-[60] max-w-md">
                  <AlertDialog.Title className="text-beast-text font-semibold">Force Restart</AlertDialog.Title>
                  <AlertDialog.Description className="text-beast-muted text-sm mt-2">
                    Force restart will interrupt the agent mid-turn. Continue?
                  </AlertDialog.Description>
                  <div className="flex gap-3 mt-4 justify-end">
                    <AlertDialog.Cancel asChild>
                      <button type="button" className="px-3 py-1.5 rounded-lg text-sm bg-beast-control text-beast-text border border-beast-border">Cancel</button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                      <button type="button" onClick={onRestart} className="px-3 py-1.5 rounded-lg text-sm bg-beast-danger text-white">Force Restart</button>
                    </AlertDialog.Action>
                  </div>
                </AlertDialog.Content>
              </AlertDialog.Portal>
            </AlertDialog.Root>
          ) : (
            <ActionButton label="Restart" onClick={onRestart} />
          )}
          <ConfirmDangerAction
            label="Kill"
            title="Kill tracked agent"
            description={`Kill ${agentLabel}? This interrupts the linked run immediately and cannot be undone from the dashboard.`}
            confirmLabel="Kill agent"
            onConfirm={onKill}
          />
          <label className="flex items-center gap-1.5 text-xs text-beast-subtle ml-2 cursor-pointer">
            <input type="checkbox" checked={forceRestart} onChange={(e) => setForceRestart(e.target.checked)} className="accent-beast-danger" />
            Force
          </label>
        </>
      )}

      {(isStopped || isTerminal) && <ActionButton label="Start" onClick={onStart} />}
      {isStopped && hasLinkedRun && <ActionButton label="Resume" onClick={onResume} />}
      {(isStopped || isTerminal) && (
        <ConfirmDangerAction
          label="Delete"
          title="Delete tracked agent"
          description={`Delete ${agentLabel}? This removes the tracked agent from the Beasts dashboard.`}
          confirmLabel="Delete agent"
          onConfirm={onDelete}
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
