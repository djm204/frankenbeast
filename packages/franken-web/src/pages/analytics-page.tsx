import * as Dialog from '@radix-ui/react-dialog';
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
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [hasFullDetail, setHasFullDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [isOverviewLoading, setIsOverviewLoading] = useState(true);
  const [overviewLastUpdatedFilter, setOverviewLastUpdatedFilter] = useState<string | null>(null);
  const [isEventsLoading, setIsEventsLoading] = useState(true);
  const [pendingFocusEventId, setPendingFocusEventId] = useState<string | null>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const detailTriggerEventIdRef = useRef<string | null>(null);
  const detailRequestSeqRef = useRef(0);
  const deferDetailFocusUntilEventsLoadRef = useRef(false);
  const sawDeferredEventsLoadRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setOverviewError(null);
    setIsOverviewLoading(true);
    const requestedFilterLabel = describeFilters(filters);

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
      setOverviewLastUpdatedFilter(requestedFilterLabel);
      setIsOverviewLoading(false);
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
  const currentFilterLabel = describeFilters(filters);
  const hasStaleOverview = isOverviewLoading && (summary !== null || sessions.length > 0);
  const overviewStatus = isOverviewLoading
    ? hasStaleOverview
      ? `Updating metrics for ${currentFilterLabel}...`
      : `Loading metrics for ${currentFilterLabel}...`
    : overviewLastUpdatedFilter
      ? `Metrics last updated for ${overviewLastUpdatedFilter}.`
      : null;
  const activityEvents = useMemo(
    () => events.filter((event) => event.outcome === 'approved' && event.source !== 'governor'),
    [events],
  );
  const abnormalEvents = useMemo(
    () => events.filter((event) => event.outcome !== 'approved' || event.source === 'governor'),
    [events],
  );

  useEffect(() => {
    if (!pendingFocusEventId) return;
    if (deferDetailFocusUntilEventsLoadRef.current) {
      if (isEventsLoading) {
        sawDeferredEventsLoadRef.current = true;
        return;
      }
      if (!sawDeferredEventsLoadRef.current) return;
    } else if (isEventsLoading) {
      return;
    }
    const currentRowTrigger = Array.from(document.querySelectorAll<HTMLElement>('[data-analytics-event-id]'))
      .find((element) => element.dataset.analyticsEventId === pendingFocusEventId);
    const fallbackTrigger = detailTriggerRef.current?.isConnected ? detailTriggerRef.current : null;
    (currentRowTrigger ?? fallbackTrigger)?.focus();
    deferDetailFocusUntilEventsLoadRef.current = false;
    sawDeferredEventsLoadRef.current = false;
    setPendingFocusEventId(null);
  }, [events, isEventsLoading, pendingFocusEventId]);

  async function openDetail(event: AnalyticsEvent, trigger?: HTMLElement) {
    detailTriggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    detailTriggerEventIdRef.current = event.id;
    setSelectedEvent(event);
    setHasFullDetail(false);
    await loadEventDetail(event.id);
  }

  async function loadEventDetail(eventId: string) {
    const requestSeq = detailRequestSeqRef.current + 1;
    detailRequestSeqRef.current = requestSeq;
    setIsDetailLoading(true);
    setDetailError(null);
    try {
      const detail = await client.fetchEventDetail(eventId);
      if (detailRequestSeqRef.current !== requestSeq) return;
      setSelectedEvent(detail);
      setHasFullDetail(true);
    } catch (error) {
      if (detailRequestSeqRef.current !== requestSeq) return;
      setHasFullDetail(false);
      setDetailError(error instanceof Error ? error.message : 'Unable to load event detail.');
    } finally {
      if (detailRequestSeqRef.current === requestSeq) {
        setIsDetailLoading(false);
      }
    }
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

  function closeDetail() {
    const triggerEventId = detailTriggerEventIdRef.current;
    detailRequestSeqRef.current += 1;
    setSelectedEvent(null);
    setIsDetailLoading(false);
    setHasFullDetail(false);
    setDetailError(null);
    setPendingFocusEventId(triggerEventId);
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

      <section className="analytics-summary-region" aria-busy={isOverviewLoading} aria-label="Analytics summary">
        {overviewStatus && (
          <div className="analytics-summary-status" role="status">
            <span>{overviewStatus}</span>
            {hasStaleOverview && <span>Showing previous metric values until refreshed.</span>}
          </div>
        )}
        <div className="analytics-summary-grid">
          <MetricCard label="Total Events" value={summary?.totalEvents ?? '—'} isStale={hasStaleOverview} />
          <MetricCard label="Sessions" value={summary?.uniqueSessions ?? '—'} isStale={hasStaleOverview} />
          <MetricCard label="Denials" value={summary?.denialCount ?? '—'} tone="danger" isStale={hasStaleOverview} />
          <MetricCard
            label="Errors"
            value={summary ? summary.errorCount + summary.failureCount : '—'}
            tone="danger"
            isStale={hasStaleOverview}
          />
          <MetricCard label="Detections" value={summary?.securityDetectionCount ?? '—'} tone="warning" isStale={hasStaleOverview} />
          <MetricCard label="Tokens" value={summary?.tokenTotals.total ?? '—'} isStale={hasStaleOverview} />
          <MetricCard label="Cost" value={summary ? `$${summary.costTotals.usd.toFixed(2)}` : '—'} isStale={hasStaleOverview} />
        </div>
      </section>

      <section className="analytics-filter-bar" aria-busy={isOverviewLoading} aria-label="Analytics filters">
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

        {isOverviewLoading && <div className="analytics-filter-status">Refreshing session options...</div>}
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
          hasFullDetail={hasFullDetail}
          isLoading={isDetailLoading}
          onClose={closeDetail}
          onRetry={() => void loadEventDetail(selectedEvent.id)}
          onSessionFilter={(sessionId) => {
            deferDetailFocusUntilEventsLoadRef.current = true;
            sawDeferredEventsLoadRef.current = false;
            closeDetail();
            updateFilter({ sessionId });
          }}
        />
      )}
    </main>
  );
}

function MetricCard({
  isStale = false,
  label,
  tone,
  value,
}: {
  isStale?: boolean;
  label: string;
  value: string | number;
  tone?: 'danger' | 'warning';
}) {
  return (
    <article className={`analytics-metric ${tone ? `analytics-metric--${tone}` : ''} ${isStale ? 'analytics-metric--stale' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {isStale && <small>Updating</small>}
    </article>
  );
}

function describeFilters(filters: AnalyticsFilters): string {
  const parts: string[] = [];
  if (filters.sessionId) parts.push(`Session ${filters.sessionId}`);
  if (filters.toolQuery) parts.push(`Tool ${filters.toolQuery}`);
  if (filters.outcome) parts.push(`Outcome ${filters.outcome}`);
  const windowLabel = TIME_WINDOWS.find((window) => window.value === (filters.timeWindow ?? '24h'))?.label ?? filters.timeWindow ?? 'Last 24h';
  parts.push(windowLabel);
  return parts.join(' · ');
}

function AnalyticsTable({
  events,
  onSelect,
  title,
}: {
  events: AnalyticsEvent[];
  onSelect: (event: AnalyticsEvent, trigger: HTMLElement) => void;
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
                <th>Actions</th>
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
                      aria-label={`View details for ${event.summary}`}
                      className="analytics-table__detail-button"
                      data-analytics-event-id={event.id}
                      type="button"
                      onClick={(clickEvent) => onSelect(event, clickEvent.currentTarget)}
                    >
                      Details
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
  hasFullDetail,
  isLoading,
  onClose,
  onRetry,
  onSessionFilter,
}: {
  detail: AnalyticsEvent;
  error: string | null;
  hasFullDetail: boolean;
  isLoading: boolean;
  onClose: () => void;
  onRetry: () => void;
  onSessionFilter: (sessionId: string) => void;
}) {
  const rawJson = JSON.stringify(detail.raw, null, 2);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const detailStateLabel = hasFullDetail ? 'Full event detail' : 'Partial row data';
  const copyDisabled = !hasFullDetail;

  return (
    <Dialog.Root open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="analytics-drawer-overlay" />
        <Dialog.Content
          aria-describedby={undefined}
          aria-modal="true"
          asChild
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            closeButtonRef.current?.focus();
          }}
        >
          <aside className="analytics-drawer">
            <div className="analytics-drawer__header">
              <div>
                <p className="eyebrow">{detail.source}</p>
                <Dialog.Title asChild>
                  <h3>{detail.summary}</h3>
                </Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button ref={closeButtonRef} className="button button--secondary button--small" type="button">Close</button>
              </Dialog.Close>
            </div>

            {error && <div className="analytics-alert">{error}</div>}

            <div className="analytics-detail-status" aria-live="polite">
              <strong>{detailStateLabel}</strong>
              <span>
                {hasFullDetail
                  ? 'This drawer is showing the full analytics event detail.'
                  : isLoading
                    ? 'Loading full event detail; the fields below are from the selected table row.'
                    : 'Full event detail is not loaded; the fields below are only from the selected table row.'}
              </span>
            </div>

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
                disabled={copyDisabled}
                onClick={() => void navigator.clipboard?.writeText(rawJson)}
              >
                Copy JSON
              </button>
              {error && (
                <button
                  className="button button--secondary button--small"
                  type="button"
                  onClick={onRetry}
                >
                  Retry detail
                </button>
              )}
            </div>

            {copyDisabled && (
              <p className="analytics-drawer__caption">
                Copy JSON is available after full event detail loads.
              </p>
            )}

            <pre className="analytics-raw">
              {rawJson.split('\n').map((line, index) => (
                <span key={`${index}-${line}`}>{line}</span>
              ))}
            </pre>
          </aside>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
