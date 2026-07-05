import type { ActivityEvent } from '../hooks/use-chat-session';
import { usePinnedScroll } from './use-pinned-scroll';

export interface ActivityPaneProps {
  events: ActivityEvent[];
  resetKey?: unknown;
}

function summarizeActivity(event: ActivityEvent): string {
  const data = event.data ?? {};
  const message = typeof data.message === 'string' ? data.message : undefined;
  const code = typeof data.code === 'string' ? data.code : undefined;
  const description = typeof data.description === 'string' ? data.description : undefined;

  if (event.type === 'turn.error') {
    return [code, message ?? 'Turn failed'].filter(Boolean).join(': ');
  }
  if (event.type === 'turn.approval.requested') {
    return description ? `Approval requested: ${description}` : 'Approval requested.';
  }
  if (event.type === 'turn.approval.resolved') {
    return data.approved === true ? 'Approval granted.' : 'Approval rejected.';
  }
  if (message) {
    return message;
  }

  return 'Open details to inspect runtime event data.';
}

export function ActivityPane({ events, resetKey }: ActivityPaneProps) {
  const { containerRef, endRef, hasNewItems, handleScroll, scrollToLatest } = usePinnedScroll(events.length, resetKey);

  return (
    <section className="rail-card" aria-label="Activity">
      <div className="rail-card__header">
        <p className="eyebrow">Activity</p>
        <h2>Runtime Events</h2>
      </div>
      {events.length === 0 && <p className="rail-card__empty">Waiting for execution events.</p>}
      <div ref={containerRef} className="activity-list" onScroll={handleScroll}>
        {events.map((event, index) => (
          <article key={`${event.type}-${event.timestamp}-${index}`} className="activity-event">
            <strong className="activity-event__type">{event.type}</strong>
            <span className="activity-event__summary">{summarizeActivity(event)}</span>
            <details className="activity-event__details">
              <summary>Raw event details</summary>
              <pre>{JSON.stringify(event.data ?? {}, null, 2)}</pre>
            </details>
          </article>
        ))}
        <div ref={endRef} />
      </div>
      {hasNewItems && (
        <button className="scroll-jump-button" type="button" onClick={() => scrollToLatest()}>
          New activity — jump to latest
        </button>
      )}
    </section>
  );
}
