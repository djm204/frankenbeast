import { useState } from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import type { TrackedAgentSummary } from '../../lib/beast-api';
import { AgentRow, type Density } from './agent-row';

interface AgentListProps {
  agents: TrackedAgentSummary[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  onCreateAgent: () => void;
}

export function AgentList({ agents, selectedAgentId, onSelectAgent, onCreateAgent }: AgentListProps) {
  const [density, setDensity] = useState<Density>('comfortable');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const filtered = agents.filter((a) => {
    if (search) {
      const q = search.toLowerCase();
      const nameMatch = a.name?.toLowerCase().includes(q);
      const idMatch = a.id.toLowerCase().includes(q);
      const kindMatch = a.initAction.kind.toLowerCase().includes(q);
      if (!nameMatch && !idMatch && !kindMatch) return false;
    }
    if (statusFilter && a.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b border-beast-border">
        <input
          type="text"
          placeholder="Search agents..."
          aria-label="Search agents"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-beast-control border border-beast-border rounded-lg px-3 py-2
            text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none
            focus:ring-2 focus:ring-beast-accent"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="bg-beast-control border border-beast-border rounded-lg px-3 py-2
            text-beast-text text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent"
        >
          <option value="">All statuses</option>
          {['running', 'initializing', 'dispatching', 'stopped', 'completed', 'failed'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <ToggleGroup.Root
          type="single"
          value={density}
          onValueChange={(val) => { if (val) setDensity(val as Density); }}
          aria-label="Display density"
          className="flex gap-1 bg-beast-control rounded-lg border border-beast-border p-0.5"
        >
          {(['compact', 'comfortable', 'detailed'] as const).map((d) => (
            <ToggleGroup.Item
              key={d}
              value={d}
              aria-label={`${d} density`}
              className="px-2 py-1 text-xs rounded-md text-beast-muted
                data-[state=on]:bg-beast-accent-soft data-[state=on]:text-beast-accent transition-colors"
            >
              {d[0]!.toUpperCase()}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
        <button
          type="button"
          onClick={onCreateAgent}
          className="px-4 py-2 rounded-lg bg-beast-accent text-beast-bg font-medium text-sm
            hover:bg-beast-accent-strong transition-colors"
        >
          Create Agent
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-beast-muted">
          <p>{agents.length === 0 ? 'No agents yet — Create your first agent' : 'No matching agents'}</p>
          {agents.length === 0 && (
            <button
              type="button"
              onClick={onCreateAgent}
              className="px-4 py-2 rounded-lg bg-beast-accent text-beast-bg font-medium text-sm"
            >
              Create Agent
            </button>
          )}
        </div>
      ) : (
        <ScrollArea.Root className="flex-1 overflow-hidden">
          <ScrollArea.Viewport className="h-full w-full p-4">
            <div className="flex flex-col gap-2">
              {filtered.map((agent) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  density={density}
                  selected={agent.id === selectedAgentId}
                  onClick={onSelectAgent}
                />
              ))}
            </div>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar orientation="vertical" className="w-2 p-0.5">
            <ScrollArea.Thumb className="bg-beast-border rounded-full" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      )}
    </div>
  );
}
