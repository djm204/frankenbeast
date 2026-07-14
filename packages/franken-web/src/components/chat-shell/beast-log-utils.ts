export function appendUniqueLogLine(logs: string[], nextLine: string): string[] {
  const nextIdentity = parseLogIdentity(nextLine);
  if (nextIdentity?.eventId && logs.some((line) => parseLogIdentity(line)?.eventId === nextIdentity.eventId)) {
    return logs;
  }
  if (nextIdentity?.createdAt && logs.some((line) => {
    const identity = parseLogIdentity(line);
    return identity
      && (!identity.eventId || !nextIdentity.eventId)
      && identity.stream === nextIdentity.stream
      && identity.message === nextIdentity.message
      && identity.createdAt === nextIdentity.createdAt;
  })) {
    return logs;
  }
  return logs[logs.length - 1] === nextLine ? logs : [...logs, nextLine];
}

function parseLogIdentity(line: string): { eventId?: string; stream?: string; message?: string; createdAt?: string } | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const candidate = parsed as { eventId?: unknown; stream?: unknown; message?: unknown; createdAt?: unknown };
    const identity = {
      ...(typeof candidate.eventId === 'string' && candidate.eventId.length > 0 ? { eventId: candidate.eventId } : {}),
      ...(typeof candidate.stream === 'string' ? { stream: candidate.stream } : {}),
      ...(typeof candidate.message === 'string' ? { message: candidate.message } : {}),
      ...(typeof candidate.createdAt === 'string' ? { createdAt: candidate.createdAt } : {}),
    };
    return identity.eventId || (identity.message && identity.createdAt) ? identity : null;
  } catch {
    return null;
  }
}

export function getAgentEventRunId(payload: unknown): string | null {
  return typeof payload === 'object'
    && payload !== null
    && 'runId' in payload
    && typeof (payload as { runId?: unknown }).runId === 'string'
    ? (payload as { runId: string }).runId
    : null;
}

export function formatStreamedLogLine(event: { eventId?: string; stream?: string; line: string; createdAt?: string }): string {
  if (event.eventId || event.createdAt || event.stream) {
    return JSON.stringify({
      ...(event.eventId ? { eventId: event.eventId } : {}),
      ...(event.stream ? { stream: event.stream } : {}),
      message: event.line,
      ...(event.createdAt ? { createdAt: event.createdAt } : {}),
    });
  }
  return event.line;
}
