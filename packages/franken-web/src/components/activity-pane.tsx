import type { ActivityEvent } from '../hooks/use-chat-session';
import { usePinnedScroll } from './use-pinned-scroll';

export interface ActivityPaneProps {
  events: ActivityEvent[];
  resetKey?: unknown;
}

type ActivitySeverity = 'info' | 'success' | 'warning' | 'error';

interface ActivityLink {
  label: string;
  href?: string;
}

interface ActivityViewModel {
  title: string;
  summary: string;
  status: string;
  severity: ActivitySeverity;
  links: ActivityLink[];
}

const TYPE_TITLES: Record<string, string> = {
  'turn.execution.start': 'Execution started',
  'turn.execution.progress': 'Execution update',
  'turn.execution.complete': 'Execution complete',
  'turn.approval.requested': 'Approval needed',
  'turn.approval.resolved': 'Approval resolved',
  'turn.error': 'Turn failed',
};

function stringValue(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function formatActivityTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

function humanizeEventType(type: string): string {
  return type
    .split('.')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function titleForActivity(type: string): string {
  return TYPE_TITLES[type] ?? humanizeEventType(type);
}

function statusForActivity(event: ActivityEvent, data: Record<string, unknown>): string {
  if (event.type === 'turn.error') {
    return 'Error';
  }
  if (event.type === 'turn.approval.requested') {
    return 'Needs review';
  }
  if (event.type === 'turn.approval.resolved') {
    return data.approved === true ? 'Approved' : 'Rejected';
  }
  if (event.type === 'turn.execution.complete') {
    return data.status === 'failed' ? 'Failed' : 'Complete';
  }
  if (event.type === 'turn.execution.start') {
    return 'Started';
  }
  if (event.type === 'turn.execution.progress') {
    return 'In progress';
  }

  return 'Event';
}

function severityForActivity(event: ActivityEvent, data: Record<string, unknown>): ActivitySeverity {
  if (event.type === 'turn.error' || data.approved === false || data.status === 'failed') {
    return 'error';
  }
  if (event.type === 'turn.approval.requested') {
    return 'warning';
  }
  if (event.type === 'turn.execution.complete' || data.approved === true) {
    return 'success';
  }

  return 'info';
}

function summarizeActivity(event: ActivityEvent): string {
  const data = event.data ?? {};
  const message = stringValue(data, 'message');
  const code = stringValue(data, 'code');
  const description = stringValue(data, 'description');
  const summary = stringValue(data, 'summary');
  const taskDescription = stringValue(data, 'taskDescription');

  if (event.type === 'turn.error') {
    return [code, message ?? 'Turn failed'].filter(Boolean).join(': ');
  }
  if (event.type === 'turn.approval.requested') {
    return description ? `Approval requested: ${description}` : 'Approval requested.';
  }
  if (event.type === 'turn.approval.resolved') {
    return data.approved === true ? 'Approval granted.' : 'Approval rejected.';
  }
  if (summary) {
    return summary;
  }
  if (message) {
    return message;
  }
  if (taskDescription) {
    return taskDescription;
  }

  return 'Open details to inspect runtime event data.';
}

function riskLabel(data: Record<string, unknown>): string | undefined {
  const risk = stringValue(data, 'risk');
  if (!risk) {
    return undefined;
  }

  return `${risk.charAt(0).toUpperCase()}${risk.slice(1)} risk`;
}

function activityLinks(data: Record<string, unknown>): ActivityLink[] {
  const links: ActivityLink[] = [];
  const sessionId = stringValue(data, 'sessionId');
  const runId = stringValue(data, 'runId');
  const artifactPath = stringValue(data, 'artifactPath') ?? stringValue(data, 'artifact');

  if (sessionId) {
    links.push({ label: `Session ${sessionId}` });
  }
  if (runId) {
    links.push({ label: `Run ${runId}`, href: '#/beasts' });
  }
  if (artifactPath) {
    links.push({ label: `Artifact ${artifactPath}` });
  }

  return links;
}

function viewModelForActivity(event: ActivityEvent): ActivityViewModel {
  const data = event.data ?? {};
  return {
    title: titleForActivity(event.type),
    summary: summarizeActivity(event),
    status: statusForActivity(event, data),
    severity: severityForActivity(event, data),
    links: activityLinks(data),
  };
}

export function ActivityPane({ events, resetKey }: ActivityPaneProps) {
  const { containerRef, endRef, hasNewItems, handleScroll, scrollToLatest } = usePinnedScroll<HTMLOListElement, HTMLLIElement>(
    events.length,
    resetKey,
  );

  return (
    <section className="rail-card" aria-label="Activity">
      <div className="rail-card__header">
        <p className="eyebrow">Activity</p>
        <h2>Runtime Events</h2>
      </div>
      {events.length === 0 && <p className="rail-card__empty">Waiting for execution events.</p>}
      <ol ref={containerRef} className="activity-list" aria-label="Runtime activity timeline" onScroll={handleScroll}>
        {events.map((event, index) => {
          const viewModel = viewModelForActivity(event);
          const risk = riskLabel(event.data ?? {});
          return (
            <li
              key={`${event.type}-${event.timestamp}-${index}`}
              className={`activity-event activity-event--${viewModel.severity}`}
            >
              <div className="activity-event__meta">
                <span className={`activity-event__chip activity-event__chip--${viewModel.severity}`}>{viewModel.status}</span>
                <time dateTime={event.timestamp}>{formatActivityTime(event.timestamp)}</time>
              </div>
              <h3 className="activity-event__title">{viewModel.title}</h3>
              <span className="activity-event__type">{event.type}</span>
              <p className="activity-event__summary">{viewModel.summary}</p>
              {(risk || viewModel.links.length > 0) && (
                <div className="activity-event__context" aria-label={`${viewModel.title} context`}>
                  {risk && <span className="activity-event__risk">{risk}</span>}
                  {viewModel.links.map((link) => (
                    link.href
                      ? <a key={`${link.label}-${link.href}`} href={link.href}>{link.label}</a>
                      : <span key={link.label} className="activity-event__context-label">{link.label}</span>
                  ))}
                </div>
              )}
              <details className="activity-event__details">
                <summary>Raw event details</summary>
                <pre>{JSON.stringify(event.data ?? {}, null, 2)}</pre>
              </details>
            </li>
          );
        })}
        {events.length > 0 && <li ref={endRef} className="activity-list__sentinel" aria-hidden="true" />}
      </ol>
      {hasNewItems && (
        <button className="scroll-jump-button" type="button" onClick={() => scrollToLatest()}>
          New activity — jump to latest
        </button>
      )}
    </section>
  );
}
