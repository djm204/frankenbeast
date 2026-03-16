import { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';

interface AgentActionBarProps {
  status: string;
  hasLinkedRun: boolean;
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

export function AgentActionBar({ status, hasLinkedRun, onStart, onStop, onRestart, onResume, onDelete, onKill }: AgentActionBarProps) {
  const [forceRestart, setForceRestart] = useState(false);

  const isInitOrDispatch = status === 'initializing' || status === 'dispatching';
  const isRunning = status === 'running';
  const isStopped = status === 'stopped';
  const isTerminal = status === 'failed' || status === 'completed';

  return (
    <div className="flex items-center gap-2 flex-wrap p-4 border-t border-beast-border">
      {(isInitOrDispatch || isRunning) && <ActionButton label="Stop" onClick={onStop} />}

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
                <AlertDialog.Overlay className="fixed inset-0 bg-black/50 z-[60]" />
                <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-beast-panel border border-beast-border rounded-xl p-6 z-[60] max-w-md">
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
          <ActionButton label="Kill" onClick={onKill} variant="danger" />
          <label className="flex items-center gap-1.5 text-xs text-beast-subtle ml-2 cursor-pointer">
            <input type="checkbox" checked={forceRestart} onChange={(e) => setForceRestart(e.target.checked)} className="accent-beast-danger" />
            Force
          </label>
        </>
      )}

      {(isStopped || isTerminal) && <ActionButton label="Start" onClick={onStart} />}
      {isStopped && hasLinkedRun && <ActionButton label="Resume" onClick={onResume} />}
      {(isStopped || isTerminal) && <ActionButton label="Delete" onClick={onDelete} variant="danger" />}
    </div>
  );
}
