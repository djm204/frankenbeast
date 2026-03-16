import type { TrackedAgentSummary } from '../../lib/beast-api';

type AgentStatus = TrackedAgentSummary['status'];

const STATUS_STYLES: Record<string, string> = {
  running: 'bg-beast-accent shadow-[0_0_8px_2px] shadow-beast-accent animate-pulse',
  initializing: 'bg-beast-accent-strong shadow-[0_0_8px_2px] shadow-beast-accent-strong animate-[pulse_0.8s_ease-in-out_infinite]',
  dispatching: 'bg-beast-accent-strong shadow-[0_0_8px_2px] shadow-beast-accent-strong animate-[pulse_0.8s_ease-in-out_infinite]',
  completed: 'bg-beast-muted',
  stopped: 'bg-beast-subtle',
  failed: 'bg-beast-danger shadow-[0_0_8px_2px] shadow-beast-danger',
};

interface StatusLightProps {
  status: AgentStatus;
}

export function StatusLight({ status }: StatusLightProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.stopped;
  return (
    <span
      role="status"
      aria-label={`Agent status: ${status}`}
      className={`inline-block h-2 w-2 rounded-full shrink-0 ${style}`}
    />
  );
}
