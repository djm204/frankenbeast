import type { ReactNode } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import type { TrackedAgentDetail } from '../../lib/beast-api';

interface AgentDetailReadonlyProps {
  detail: TrackedAgentDetail;
  logs: string[];
  onExpandLogs: () => void;
}

export function AgentDetailReadonly({ detail, logs, onExpandLogs }: AgentDetailReadonlyProps) {
  const { agent } = detail;

  return (
    <ScrollArea.Root className="flex-1 overflow-hidden">
      <ScrollArea.Viewport className="h-full w-full">
        <Accordion.Root type="multiple" defaultValue={['overview', 'logs']} className="p-4">
          <AccordionSection value="overview" title="Overview">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-beast-subtle">Workflow</span>
              <span className="text-beast-text">{agent.initAction.kind}</span>
              <span className="text-beast-subtle">Created</span>
              <span className="text-beast-text">{new Date(agent.createdAt).toLocaleString()}</span>
              <span className="text-beast-subtle">Creator</span>
              <span className="text-beast-text">{agent.createdByUser}</span>
              {agent.dispatchRunId && (
                <>
                  <span className="text-beast-subtle">Run ID</span>
                  <span className="text-beast-text font-mono text-xs">{agent.dispatchRunId}</span>
                </>
              )}
            </div>
          </AccordionSection>

          <AccordionSection value="llm" title="LLM Configuration">
            <p className="text-sm text-beast-subtle italic">Using process defaults</p>
          </AccordionSection>

          <AccordionSection value="modules" title="Modules">
            {agent.moduleConfig ? (
              <div className="flex flex-wrap gap-2">
                {Object.entries(agent.moduleConfig).map(([key, enabled]) => (
                  <span key={key} className={`text-xs px-2 py-0.5 rounded-full border ${enabled ? 'border-beast-accent text-beast-accent' : 'border-beast-border text-beast-subtle'}`}>
                    {key}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-beast-subtle italic">Default module configuration</p>
            )}
          </AccordionSection>

          <AccordionSection value="skills" title="Skills">
            <p className="text-sm text-beast-subtle italic">No skills configured</p>
          </AccordionSection>

          <AccordionSection value="prompts" title="Prompt Frontloading">
            <p className="text-sm text-beast-subtle italic">No prompt frontloading configured</p>
          </AccordionSection>

          <AccordionSection value="git" title="Git Workflow">
            <p className="text-sm text-beast-subtle italic">Using default git settings</p>
          </AccordionSection>

          <AccordionSection value="logs" title="Events & Logs" action={
            <button type="button" onClick={onExpandLogs} className="text-xs text-beast-accent hover:text-beast-accent-strong">
              Expand
            </button>
          }>
            <div className="space-y-1 font-mono text-xs text-beast-muted max-h-48 overflow-y-auto">
              {detail.events.map((e) => (
                <div key={e.id} className={`${e.level === 'error' ? 'text-beast-danger' : ''}`}>
                  [{new Date(e.createdAt).toLocaleTimeString()}] {e.message}
                </div>
              ))}
              {logs.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              {detail.events.length === 0 && logs.length === 0 && (
                <p className="text-beast-subtle italic">No events or logs yet</p>
              )}
            </div>
          </AccordionSection>
        </Accordion.Root>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar orientation="vertical" className="w-2 p-0.5">
        <ScrollArea.Thumb className="bg-beast-border rounded-full" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}

function AccordionSection({ value, title, children, action }: {
  value: string; title: string; children: ReactNode; action?: ReactNode;
}) {
  return (
    <Accordion.Item value={value} className="border-b border-beast-border">
      <Accordion.Header className="flex items-center">
        <Accordion.Trigger className="flex-1 flex items-center justify-between py-3 text-sm font-medium text-beast-text hover:text-beast-accent transition-colors group">
          <span>{title}</span>
          <svg className="w-4 h-4 text-beast-subtle transition-transform group-data-[state=open]:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </Accordion.Trigger>
        {action && <div className="ml-2">{action}</div>}
      </Accordion.Header>
      <Accordion.Content className="pb-4 text-beast-text data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp overflow-hidden">
        {children}
      </Accordion.Content>
    </Accordion.Item>
  );
}
