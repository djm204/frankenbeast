import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnalyticsApiClient,
  AnalyticsEvent,
  AnalyticsEventPage,
  AnalyticsFilters,
  AnalyticsOutcome,
  AnalyticsSessionOption,
  AnalyticsSummary,
} from '../lib/analytics-api';

interface AnalyticsPageProps {
  client: AnalyticsApiClient;
}

const OUTCOME_OPTIONS: Array<{ value: '' | AnalyticsOutcome; label: string }> = [
  { value: '', label: 'All outcomes' },
  { value: 'approved', label: 'Approved' },
  { value: 'denied', label: 'Denied' },
  { value: 'review_recommended', label: 'Review recommended' },
  { value: 'failed', label: 'Failed' },
  { value: 'error', label: 'Error' },
  { value: 'detected', label: 'Detected' },
];

const TIME_WINDOWS = [
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7d' },
  { value: '30d', label: 'Last 30d' },
  { value: 'all', label: 'All time' },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 50;

export function AnalyticsPage({ client }: AnalyticsPageProps) {
  const [filters, setFilters] = useState<AnalyticsFilters>({ timeWindow: '24h' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [sessions, setSessions] = useState<AnalyticsSessionOption[]>([]);
  const [eventPage, setEventPage] = useState<AnalyticsEventPage | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AnalyticsEvent | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [isEventsLoading, setIsEventsLoading] = useState(true);
  const detailTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOverviewError(null);

    void Promise.allSettled([
      client.fetchSummary(filters),
      client.fetchSessions(filters),
    ]).then(([summaryResult, sessionsResult]) => {
      if (cancelled) return;
      const errors = [summaryResult, sessionsResult]
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => result.reason instanceof Error ? result.reason.message : 'Unable to load analytics.');
      if (summaryResult.status === 'fulfilled') {
        setSummary(summaryResult.value);
      }
      if (sessionsResult.status === 'fulfilled') {
        setSessions(sessionsResult.value);
      }
      setOverviewError(errors.length > 0 ? errors.join('; ') : null);
    });

    return () => {
      cancelled = true;
    };
  }, [client, filters]);

  useEffect(() => {
    let cancelled = false;
    setIsEventsLoading(true);
    setEventsError(null);

    void client.fetchEvents({ ...filters, page, pageSize }).then((eventsResult) => {
      if (cancelled) return;
      setEventPage(eventsResult);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setEventPage((current) => current ? { ...current, events: [] } : null);
      setEventsError(error instanceof Error ? error.message : 'Unable to load analytics.');
    }).finally(() => {
      if (!cancelled) {
        setIsEventsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [client, filters, page, pageSize]);

  const events = eventPage?.events ?? [];
  const totalEvents = eventPage?.total ?? 0;
  const currentPage = page;
  const currentPageSize = eventPage?.pageSize ?? pageSize;
  const totalPages = Math.max(1, Math.ceil(totalEvents / currentPageSize));
  const canGoPrevious = currentPage > 1 && !isEventsLoading;
  const canGoNext = currentPage < totalPages && !isEventsLoading;
  const loadError = [overviewError, eventsError].filter(Boolean).join('; ') || null;
  const activityEvents = useMemo(
    () => events.filter((event) => event.outcome === 'approved' && event.source !== 'governor'),
    [events],
  );
  const abnormalEvents = useMemo(
    () => events.filter((event) => event.outcome !== 'approved' || event.source === 'governor'),
    [events],
  );

  async function openDetail(event: AnalyticsEvent) {
    detailTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedEvent(event);
    setDetailError(null);
    try {
      setSelectedEvent(await client.fetchEventDetail(event.id));
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Unable to load event detail.');
    }
  }

  function closeDetail() {
    const trigger = detailTriggerRef.current;
    setSelectedEvent(null);
    setDetailError(null);
    window.setTimeout(() => trigger?.focus(), 0);
  }

  function updateFilter(next: Partial<AnalyticsFilters>) {
    setFilters((current) => ({
      ...current,
      ...next,
    }));
    setPage(1);
  }

  function updatePageSize(nextPageSize: number) {
    setPageSize(nextPageSize);
    setPage(1);
  }

  return (
    <main className="analytics-page">
      <section className="analytics-header">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2>Observer Activity</h2>
        </div>
        <p>{totalEvents} normalized events</p>
      </section>

      {loadError && <div className="analytics-alert">{loadError}</div>}

      <section className="analytics-summary-grid" aria-label="Analytics summary">
        <MetricCard label="Total Events" value={summary?.totalEvents ?? 0} />
        <MetricCard label="Sessions" value={summary?.uniqueSessions ?? 0} />
        <MetricCard label="Denials" value={summary?.denialCount ?? 0} tone="danger" />
        <MetricCard label="Errors" value={(summary?.errorCount ?? 0) + (summary?.failureCount ?? 0)} tone="danger" />
        <MetricCard label="Detections" value={summary?.securityDetectionCount ?? 0} tone="warning" />
        <MetricCard label="Tokens" value={summary?.tokenTotals.total ?? 0} />
        <MetricCard label="Cost" value={`$${(summary?.costTotals.usd ?? 0).toFixed(2)}`} />
      </section>

      <section className="analytics-filter-bar" aria-label="Analytics filters">
        <label className="field-stack">
          <span>Session</span>
          <select
            aria-label="Session"
            className="field-control"
            value={filters.sessionId ?? ''}
            onChange={(event) => updateFilter({ sessionId: event.target.value || undefined })}
          >
            <option value="">All sessions</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.id}
              </option>
            ))}
          </select>
        </label>

        <label className="field-stack">
          <span>Tool</span>
          <input
            aria-label="Tool search"
            className="field-control"
            placeholder="Filter by tool"
            value={filters.toolQuery ?? ''}
            onChange={(event) => updateFilter({ toolQuery: event.target.value || undefined })}
          />
        </label>

        <label className="field-stack">
          <span>Outcome</span>
          <select
            aria-label="Outcome"
            className="field-control"
            value={filters.outcome ?? ''}
            onChange={(event) => updateFilter({ outcome: event.target.value as AnalyticsOutcome || undefined })}
          >
            {OUTCOME_OPTIONS.map((outcome) => (
              <option key={outcome.value} value={outcome.value}>
                {outcome.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field-stack">
          <span>Window</span>
          <select
            aria-label="Time window"
            className="field-control"
            value={filters.timeWindow ?? '24h'}
            onChange={(event) => updateFilter({ timeWindow: event.target.value })}
          >
            {TIME_WINDOWS.map((window) => (
              <option key={window.value} value={window.value}>
                {window.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field-stack">
          <span>Page size</span>
          <select
            aria-label="Page size"
            className="field-control"
            value={pageSize}
            onChange={(event) => updatePageSize(Number(event.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} per page
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="analytics-pagination" aria-label="Analytics pagination">
        <div>
          Page {currentPage} of {totalPages} · {totalEvents} events
        </div>
        <div className="analytics-pagination__actions">
          <button
            className="button button--secondary button--small"
            disabled={!canGoPrevious}
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </button>
          <button
            className="button button--secondary button--small"
            disabled={!canGoNext}
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            Next
          </button>
        </div>
      </section>

      {isEventsLoading ? (
        <section className="empty-state">Loading analytics...</section>
      ) : (
        <section className="analytics-table-grid">
          <AnalyticsTable title="Activity" events={activityEvents} onSelect={openDetail} />
          <AnalyticsTable title="Decisions & Failures" events={abnormalEvents} onSelect={openDetail} />
        </section>
      )}

      {selectedEvent && (
        <DetailDrawer
          detail={selectedEvent}
          error={detailError}
          onClose={closeDetail}
          onSessionFilter={(sessionId) => updateFilter({ sessionId })}
        />
      )}
    </main>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string | number; tone?: 'danger' | 'warning' }) {
  return (
    <article className={`analytics-metric ${tone ? `analytics-metric--${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function AnalyticsTable({
  events,
  onSelect,
  title,
}: {
  events: AnalyticsEvent[];
  onSelect: (event: AnalyticsEvent) => void;
  title: string;
}) {
  return (
    <section className="analytics-panel">
      <div className="analytics-panel__header">
        <h3>{title}</h3>
        <span>{events.length}</span>
      </div>
      {events.length === 0 ? (
        <div className="empty-state">No events match the current filters.</div>
      ) : (
        <div className="analytics-table-wrap">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Session</th>
                <th>Tool</th>
                <th>Outcome</th>
                <th>Summary</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{formatTime(event.timestamp)}</td>
                  <td>{event.sessionId ?? '-'}</td>
                  <td>{event.toolName ?? event.source}</td>
                  <td><span className={`analytics-outcome analytics-outcome--${event.severity}`}>{event.outcome}</span></td>
                  <td>{event.summary}</td>
                  <td>
                    <button
                      aria-label={`Open details for ${event.summary}`}
                      className="analytics-table__details-button"
                      type="button"
                      onClick={() => onSelect(event)}
                    >
                      Open details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DetailDrawer({
  detail,
  error,
  onClose,
  onSessionFilter,
}: {
  detail: AnalyticsEvent;
  error: string | null;
  onClose: () => void;
  onSessionFilter: (sessionId: string) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const rawJson = JSON.stringify(detail.raw, null, 2);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, [detail.id]);

  return (
    <aside aria-label="Analytics event detail" aria-modal="true" className="analytics-drawer" role="dialog">
      <div className="analytics-drawer__header">
        <div>
          <p className="eyebrow">{detail.source}</p>
          <h3>{detail.summary}</h3>
        </div>
        <button ref={closeButtonRef} className="button button--secondary button--small" type="button" onClick={onClose}>Close</button>
      </div>

      {error && <div className="analytics-alert">{error}</div>}

      <dl className="analytics-detail-list">
        <div><dt>Time</dt><dd>{detail.timestamp}</dd></div>
        <div><dt>Outcome</dt><dd>{detail.outcome}</dd></div>
        <div><dt>Session</dt><dd>{detail.sessionId ?? '-'}</dd></div>
        <div><dt>Tool</dt><dd>{detail.toolName ?? '-'}</dd></div>
        <div><dt>Run</dt><dd>{detail.links.runId ?? '-'}</dd></div>
        <div><dt>Agent</dt><dd>{detail.links.agentId ?? '-'}</dd></div>
      </dl>

      <div className="analytics-drawer__actions">
        <button
          className="button button--secondary button--small"
          disabled={!detail.sessionId}
          type="button"
          onClick={() => detail.sessionId && onSessionFilter(detail.sessionId)}
        >
          Filter Session
        </button>
        <button
          className="button button--secondary button--small"
          type="button"
          onClick={() => void navigator.clipboard?.writeText(rawJson)}
        >
          Copy JSON
        </button>
      </div>

      <pre className="analytics-raw">
        {rawJson.split('\n').map((line, index) => (
          <span key={`${index}-${line}`}>{line}</span>
        ))}
      </pre>
    </aside>
  );
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
