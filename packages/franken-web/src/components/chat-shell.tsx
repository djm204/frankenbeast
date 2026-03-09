import { useState } from 'react';
import { useChatSession } from '../hooks/use-chat-session';
import { TranscriptPane } from './transcript-pane';
import { Composer } from './composer';
import { ActivityPane } from './activity-pane';
import type { TurnEvent } from './activity-pane';
import { ApprovalCard } from './approval-card';
import { CostBadge } from './cost-badge';

export interface ChatShellProps {
  baseUrl: string;
  projectId: string;
  sessionId?: string;
}

export function ChatShell({ baseUrl, projectId, sessionId }: ChatShellProps) {
  const { transcript, status, tier, send, approve } = useChatSession({
    baseUrl,
    projectId,
    sessionId,
  });

  // Activity events and approval state would be populated by SSE in a full implementation.
  // For now, these are placeholder state holders that components bind to.
  const [events] = useState<TurnEvent[]>([]);
  const [pendingApproval] = useState(false);
  const [approvalDescription] = useState('');

  return (
    <div className="chat-shell">
      <main>
        <TranscriptPane messages={transcript} />
        <Composer onSend={send} disabled={status === 'loading'} />
      </main>
      <aside>
        <CostBadge
          tier={tier ?? 'unknown'}
          tokenTotals={{ cheap: 0, premiumReasoning: 0, premiumExecution: 0 }}
          costUsd={0}
        />
        <ActivityPane events={events} />
        <ApprovalCard
          pending={pendingApproval}
          description={approvalDescription}
          onApprove={() => approve(true)}
          onReject={() => approve(false)}
        />
      </aside>
    </div>
  );
}
