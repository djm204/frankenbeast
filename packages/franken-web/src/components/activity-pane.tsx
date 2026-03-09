import { useRef, useEffect } from 'react';

export interface TurnEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface ActivityPaneProps {
  events: TurnEvent[];
}

export function ActivityPane({ events }: ActivityPaneProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof endRef.current?.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events.length]);

  return (
    <section aria-label="Activity">
      <h2>Activity</h2>
      {events.length === 0 && <p>No events yet.</p>}
      {events.map((evt, i) => (
        <div key={i} className="activity-event">
          <span className="activity-event__type">{evt.type}</span>
          <span className="activity-event__summary">
            {JSON.stringify(evt.data)}
          </span>
        </div>
      ))}
      <div ref={endRef} />
    </section>
  );
}
