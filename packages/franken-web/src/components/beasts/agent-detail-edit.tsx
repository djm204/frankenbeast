import * as Accordion from '@radix-ui/react-accordion';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useBeastStore } from '../../stores/beast-store';

interface AgentDetailEditProps {
  onSave: (values: Record<string, unknown>) => void;
  onCancel: () => void;
}

const MODULE_KEYS = ['firewall', 'skills', 'memory', 'planner', 'critique', 'governor', 'heartbeat'] as const;

export function AgentDetailEdit({ onSave, onCancel }: AgentDetailEditProps) {
  const { editValues, isEditDirty, setEditField } = useBeastStore();
  const values = editValues ?? {};

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Save/Cancel header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-beast-border shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs rounded-lg text-beast-muted hover:text-beast-text hover:bg-beast-elevated transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(values)}
          disabled={!isEditDirty}
          className="px-3 py-1.5 text-xs rounded-lg bg-beast-accent text-beast-bg font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-beast-accent-strong transition-colors"
        >
          Save
        </button>
      </div>

      <ScrollArea.Root className="flex-1 overflow-hidden">
        <ScrollArea.Viewport className="h-full w-full">
          <Accordion.Root type="multiple" defaultValue={['identity', 'modules']} className="p-4 space-y-2">
            {/* Identity Section */}
            <Accordion.Item value="identity" className="border border-beast-border rounded-xl overflow-hidden">
              <Accordion.Header>
                <Accordion.Trigger className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-beast-text bg-beast-elevated transition-colors group">
                  <span>Identity</span>
                  <svg className="w-4 h-4 text-beast-subtle transition-transform group-data-[state=open]:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="overflow-hidden">
                <div className="p-4 space-y-3 bg-beast-bg">
                  <label className="block">
                    <span className="text-xs text-beast-muted mb-1 block">Name</span>
                    <input
                      type="text"
                      value={String(values.name ?? '')}
                      onChange={(e) => setEditField('name', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-beast-control border border-beast-border text-beast-text text-sm focus:outline-none focus:border-beast-accent"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-beast-muted mb-1 block">Description</span>
                    <textarea
                      value={String(values.description ?? '')}
                      onChange={(e) => setEditField('description', e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg bg-beast-control border border-beast-border text-beast-text text-sm resize-none focus:outline-none focus:border-beast-accent"
                    />
                  </label>
                </div>
              </Accordion.Content>
            </Accordion.Item>

            {/* Modules Section */}
            <Accordion.Item value="modules" className="border border-beast-border rounded-xl overflow-hidden">
              <Accordion.Header>
                <Accordion.Trigger className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-beast-text bg-beast-elevated transition-colors group">
                  <span>Modules</span>
                  <svg className="w-4 h-4 text-beast-subtle transition-transform group-data-[state=open]:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="overflow-hidden">
                <div className="p-4 space-y-2 bg-beast-bg">
                  <Tooltip.Provider>
                    {MODULE_KEYS.map((key) => (
                      <Tooltip.Root key={key}>
                        <Tooltip.Trigger asChild>
                          <label
                            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-beast-elevated transition-colors cursor-pointer"
                            aria-description="Takes effect at next turn boundary"
                          >
                            <input
                              type="checkbox"
                              checked={Boolean((values.moduleConfig as Record<string, boolean> | undefined)?.[key])}
                              onChange={(e) => {
                                const current = (values.moduleConfig as Record<string, boolean>) ?? {};
                                setEditField('moduleConfig', { ...current, [key]: e.target.checked });
                              }}
                              className="rounded border-beast-border"
                            />
                            <span className="text-sm text-beast-text capitalize">{key}</span>
                          </label>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content className="px-2 py-1 rounded bg-beast-elevated text-beast-muted text-xs border border-beast-border" sideOffset={5}>
                            Takes effect at next turn boundary
                            <Tooltip.Arrow className="fill-beast-elevated" />
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    ))}
                  </Tooltip.Provider>
                </div>
              </Accordion.Content>
            </Accordion.Item>

            {/* LLM Config Section */}
            <Accordion.Item value="llm" className="border border-beast-border rounded-xl overflow-hidden">
              <Accordion.Header>
                <Accordion.Trigger className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-beast-text bg-beast-elevated transition-colors group">
                  <span>LLM Config</span>
                  <svg className="w-4 h-4 text-beast-subtle transition-transform group-data-[state=open]:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="overflow-hidden">
                <div className="p-4 text-beast-muted text-sm bg-beast-bg">
                  LLM configuration editing — coming soon
                </div>
              </Accordion.Content>
            </Accordion.Item>
          </Accordion.Root>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" className="w-2 p-0.5">
          <ScrollArea.Thumb className="bg-beast-border rounded-full" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </div>
  );
}
