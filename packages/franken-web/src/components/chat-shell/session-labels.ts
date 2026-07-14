import type { ChatSessionSummary } from '../../lib/api';

function formatSessionCount(count: number): string {
  return `${count} ${count === 1 ? 'message' : 'messages'}`;
}

function formatRelativeUpdatedTime(value: string): string {
  const updatedAt = new Date(value).getTime();
  if (!Number.isFinite(updatedAt)) {
    return 'updated time unknown';
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  if (elapsedSeconds < 60) {
    return 'updated just now';
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `updated ${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `updated ${elapsedHours}h ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) {
    return `updated ${elapsedDays}d ago`;
  }

  return `updated ${new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function shortenSessionId(id: string): string {
  if (id.length <= 14) {
    return id;
  }

  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export function formatSessionOptionLabel(session: ChatSessionSummary): string {
  const preview = session.preview.trim();
  const details = [
    session.state,
    formatSessionCount(session.messageCount),
    formatRelativeUpdatedTime(session.updatedAt),
    shortenSessionId(session.id),
  ];

  return preview ? `${preview} — ${details.join(' · ')}` : details.join(' · ');
}
