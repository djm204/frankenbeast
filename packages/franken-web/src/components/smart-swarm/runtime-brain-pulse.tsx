import { useEffect, useMemo, useState } from 'react';
import type {
  RuntimeConnectionState,
  RuntimeEvent,
  RuntimeProvider,
  RuntimeSnapshot,
} from '../../lib/smart-swarm-api';

const PULSE_WINDOW_MS = 60_000;

interface RuntimeBrainPulseProps {
  provider: RuntimeProvider;
  snapshot: RuntimeSnapshot;
  connection: RuntimeConnectionState;
  events: readonly RuntimeEvent[];
  eventLimit?: number;
  onOpenTask(event: RuntimeEvent, trigger: HTMLButtonElement): void;
}

export function RuntimeBrainPulse({
  provider,
  snapshot,
  connection,
  events,
  eventLimit,
  onOpenTask,
}: RuntimeBrainPulseProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  const recentEvents = useMemo(() => {
    const unique = new Map<string, RuntimeEvent>();
    const pulseNow = events.reduce((latest, event) => {
      const occurredAt = Date.parse(event.occurredAt);
      return Number.isFinite(occurredAt) ? Math.max(latest, occurredAt) : latest;
    }, now);
    for (const event of events) {
      const occurredAt = Date.parse(event.occurredAt);
      if (
        !Number.isFinite(occurredAt)
        || occurredAt < pulseNow - PULSE_WINDOW_MS
      ) continue;
      const current = unique.get(event.id);
      if (!current || occurredAt > Date.parse(current.occurredAt)) unique.set(event.id, event);
    }
    return [...unique.values()].sort((left, right) => (
      Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
      || left.id.localeCompare(right.id)
    ));
  }, [events, now]);
  const unsupportedReason = provider.capabilities.streaming.status === 'unsupported'
    ? provider.capabilities.streaming.reason
    : null;
  const snapshotUnavailable = snapshot.state === 'unavailable'
    || snapshot.state === 'schema-incompatible';
  const providerUnavailable = provider.health.state === 'unavailable'
    || provider.health.state === 'schema-incompatible';
  const runtimeUnavailable = snapshotUnavailable || providerUnavailable;
  const runtimeUnavailableReason = snapshotUnavailable
    ? snapshot.message ?? 'The normalized runtime snapshot is unavailable.'
    : provider.health.message ?? 'The normalized runtime provider is unavailable.';
  const isLiveConnected = connection === 'connected' && !runtimeUnavailable;
  const pulseState = recentEvents.length === 0
    ? 'idle'
    : isLiveConnected
      ? 'active'
      : 'stale';
  const eventCountLabel = isLiveConnected
    ? eventLimit !== undefined && recentEvents.length >= eventLimit
      ? `Latest ${recentEvents.length} retained events from the last minute`
      : `${recentEvents.length} ${recentEvents.length === 1 ? 'event' : 'events'} in the last minute`
    : `${recentEvents.length} retained ${recentEvents.length === 1 ? 'event' : 'events'} · not live`;

  return (
    <section
      aria-label="Runtime brain pulse"
      className="runtime-brain-pulse rail-card"
      data-connection={connection}
      data-pulse-state={pulseState}
      data-runtime-state={snapshot.state}
      role="region"
    >
      <header>
        <div>
          <p className="eyebrow">Brain Pulse</p>
          <h3>Normalized runtime activity</h3>
        </div>
        <strong aria-atomic="true" aria-live="polite">{eventCountLabel}</strong>
      </header>
      {unsupportedReason ? (
        <p className="runtime-brain-pulse__state runtime-brain-pulse__state--unsupported" role="status">
          <strong>Unsupported</strong> · {unsupportedReason}
        </p>
      ) : runtimeUnavailable ? (
        <p className="runtime-brain-pulse__state runtime-brain-pulse__state--disconnected" role="alert">
          <strong>Unavailable</strong> · {runtimeUnavailableReason}
        </p>
      ) : connection === 'reconnecting' || connection === 'unavailable' ? (
        <p className="runtime-brain-pulse__state runtime-brain-pulse__state--disconnected" role="alert">
          <strong>Disconnected</strong> · {connection === 'reconnecting' ? 'Reconnecting to normalized runtime events.' : 'Live runtime events are unavailable.'}
        </p>
      ) : snapshot.state === 'degraded' || provider.health.state === 'degraded' ? (
        <p className="runtime-brain-pulse__state runtime-brain-pulse__state--degraded" role="status">
          <strong>Degraded</strong> · {snapshot.message ?? provider.health.message ?? 'Some normalized runtime evidence is temporarily unavailable.'}
        </p>
      ) : connection === 'connected' && recentEvents.length === 0 ? (
        <p className="runtime-brain-pulse__state runtime-brain-pulse__state--idle" role="status">
          <strong>No activity</strong> · Connected; no normalized runtime events in the last minute.
        </p>
      ) : null}
      <ol>
        {recentEvents.map((event) => (
          <li key={`${provider.id}:${event.id}`}>
            <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleTimeString()}</time>
            <strong>{event.type}</strong>
            <span>{event.summary}</span>
            <span>{provider.displayName}</span>
            <span>{event.workspaceId}</span>
            <span>{event.taskId ?? 'No task'}</span>
            <span>{event.runId ?? 'No run'}</span>
            {event.taskId ? (
              <button
                aria-label={`Open source task ${event.taskId} for event ${event.id}`}
                onClick={(clickEvent) => onOpenTask(event, clickEvent.currentTarget)}
                type="button"
              >
                Open source
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
