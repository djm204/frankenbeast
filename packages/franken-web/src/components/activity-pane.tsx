import { useEffect, useRef } from 'react';
import type { ActivityEvent } from '../hooks/use-chat-session';

export interface ActivityPaneProps {
  events: ActivityEvent[];
}

export function ActivityPane({ events }: ActivityPaneProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof endRef.current?.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [events.length]);

  return (
    <section className="rail-card" aria-label="Activity">
      <div className="rail-card__header">
        <p className="eyebrow">Activity</p>
        <h2>Runtime Events</h2>
      </div>
      {events.length === 0 && <p className="rail-card__empty">Waiting for execution events.</p>}
      <div className="activity-list">
        {events.map((event, index) => (
          <article key={`${event.type}-${event.timestamp}-${index}`} className="activity-event">
            <strong className="activity-event__type">{event.type}</strong>
            <span className="activity-event__summary">{JSON.stringify(event.data ?? {})}</span>
          </article>
        ))}
        <div ref={endRef} />
      </div>
    </section>
  );
}
