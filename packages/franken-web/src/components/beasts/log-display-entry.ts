import type { TrackedAgentEvent } from '../../lib/beast-api';

export type LogDisplayEntry =
  | {
      kind: 'event';
      key: string;
      level: TrackedAgentEvent['level'];
      timestamp: string;
      message: string;
      label: string;
    }
  | {
      kind: 'log';
      key: string;
      level?: 'error';
      timestamp?: string;
      message: string;
      label: string;
    };

interface SortableDisplayEntry {
  entry: LogDisplayEntry;
  timestampMs: number | null;
  fallbackOrder: number;
}

interface ParsedLogLine {
  message: string;
  createdAt?: string;
  stream?: string;
}

export function buildLogDisplayEntries(
  events: TrackedAgentEvent[],
  logs: string[],
  search = '',
): LogDisplayEntry[] {
  const normalizedQuery = search.trim().toLowerCase();
  const sortable: SortableDisplayEntry[] = [];

  events.forEach((event) => {
    const label = `[${formatDisplayTime(event.createdAt)}] [${event.level}] ${event.message}`;
    sortable.push({
      entry: {
        kind: 'event',
        key: `event-${event.id}`,
        level: event.level,
        timestamp: event.createdAt,
        message: event.message,
        label,
      },
      timestampMs: parseTimestampMs(event.createdAt),
      fallbackOrder: event.sequence,
    });
  });

  logs.forEach((line, index) => {
    const parsed = parseLogLine(line);
    const timestampMs = parsed.createdAt ? parseTimestampMs(parsed.createdAt) : null;
    const timestampPrefix = parsed.createdAt ? `[${formatDisplayTime(parsed.createdAt)}] ` : '';
    const streamPrefix = parsed.stream ? `[${parsed.stream}] ` : '';
    sortable.push({
      entry: {
        kind: 'log',
        key: `log-${index}`,
        level: parsed.stream === 'stderr' ? 'error' : undefined,
        timestamp: parsed.createdAt,
        message: parsed.message,
        label: `${timestampPrefix}${streamPrefix}${parsed.message}`,
      },
      timestampMs,
      // Keep untimestamped legacy logs in their original sequence, after timestamped entries.
      fallbackOrder: Number.MAX_SAFE_INTEGER / 2 + index,
    });
  });

  return sortable
    .filter(({ entry }) => matchesQuery(entry, normalizedQuery))
    .sort(compareDisplayEntries)
    .map(({ entry }) => entry);
}

function compareDisplayEntries(left: SortableDisplayEntry, right: SortableDisplayEntry): number {
  if (left.timestampMs !== null && right.timestampMs !== null && left.timestampMs !== right.timestampMs) {
    return left.timestampMs - right.timestampMs;
  }
  if (left.timestampMs !== null && right.timestampMs === null) {
    return -1;
  }
  if (left.timestampMs === null && right.timestampMs !== null) {
    return 1;
  }
  return left.fallbackOrder - right.fallbackOrder;
}

function matchesQuery(entry: LogDisplayEntry, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return entry.label.toLowerCase().includes(normalizedQuery) || entry.message.toLowerCase().includes(normalizedQuery);
}

function parseLogLine(line: string): ParsedLogLine {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      const candidate = parsed as { message?: unknown; createdAt?: unknown; stream?: unknown };
      if (typeof candidate.message === 'string') {
        return {
          message: candidate.message,
          ...(typeof candidate.createdAt === 'string' ? { createdAt: candidate.createdAt } : {}),
          ...(typeof candidate.stream === 'string' ? { stream: candidate.stream } : {}),
        };
      }
    }
  } catch {
    // Legacy log lines are plain text.
  }
  return { message: line };
}

function parseTimestampMs(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function formatDisplayTime(value: string): string {
  return new Date(value).toLocaleTimeString();
}
