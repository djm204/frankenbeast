import {
  type ApproveResult,
  type ChatSession,
  type TokenTotals,
  type TranscriptMessage,
} from '../lib/api';
import {
  type ServerSocketEvent,
  deterministicUuid,
  isoNow,
  seededRandom,
} from '@franken/types';
import type { ActivityEvent, ChatErrorAction, ChatErrorBanner, ChatMessage, MessageReceipt } from './use-chat-session';

export const EMPTY_TOKEN_TOTALS: TokenTotals = {
  cheap: 0,
  premiumReasoning: 0,
  premiumExecution: 0,
};

export const SOCKET_SEND_ACK_TIMEOUT_MS = 15_000;

export interface PendingSend {
  timeoutId: ReturnType<typeof setTimeout>;
  resolve: () => void;
  reject: (error: Error) => void;
}

export class NonRetryableSendError extends Error {
  readonly retryableSend = false;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function makeBanner(
  title: string,
  message: string,
  action: ChatErrorAction,
  actionLabel: string,
  code?: string,
): ChatErrorBanner {
  return {
    id: makeId('chat-error'),
    title,
    message,
    action,
    actionLabel,
    ...(code ? { code } : {}),
  };
}

function hasDeterministicSeed(): boolean {
  const globalWithProcess = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return Boolean(globalWithProcess.process?.env?.['FRANKENBEAST_SEED']);
}

export function makeId(prefix: string): string {
  if (hasDeterministicSeed()) {
    return deterministicUuid('packages/franken-web/src/hooks/use-chat-session.ts');
  }

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${seededRandom.random().toString(36).slice(2, 10)}`;
}

function normalizeTranscript(messages: TranscriptMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    id: message.id ?? makeId(message.role),
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    ...(message.modelTier ? { modelTier: message.modelTier } : {}),
  }));
}

export function appendOrUpdateAssistantMessage(
  messages: ChatMessage[],
  event: Extract<ServerSocketEvent, { type: 'assistant.message.delta' | 'assistant.message.complete' }>,
): ChatMessage[] {
  const existingIndex = messages.findIndex((message) => message.id === event.messageId);
  const nextMessage: ChatMessage = {
    id: event.messageId,
    role: 'assistant',
    content: event.type === 'assistant.message.delta'
      ? (existingIndex >= 0 ? `${messages[existingIndex]!.content}${event.chunk}` : event.chunk)
      : event.content,
    timestamp: event.type === 'assistant.message.complete'
      ? event.timestamp
      : (existingIndex >= 0 ? messages[existingIndex]!.timestamp : isoNow()),
    ...(event.modelTier ? { modelTier: event.modelTier } : {}),
    streaming: event.type === 'assistant.message.delta',
  };

  if (existingIndex >= 0) {
    return messages.map((message, index) => (index === existingIndex ? nextMessage : message));
  }

  return [...messages, nextMessage];
}

export function activityEventsFromApproveResult(result: ApproveResult, approved: boolean): ActivityEvent[] {
  const timestamp = isoNow();
  return [
    {
      type: 'turn.approval.resolved',
      data: { approved },
      timestamp,
    },
    ...(result.events ?? []).flatMap((event): ActivityEvent[] => {
      if (!event || typeof event !== 'object' || !('type' in event)) {
        return [];
      }
      const turnEvent = event as { type: unknown; data?: Record<string, unknown> };
      if (turnEvent.type !== 'start' && turnEvent.type !== 'progress' && turnEvent.type !== 'complete') {
        return [];
      }
      return [{
        type: `turn.execution.${turnEvent.type}`,
        ...(turnEvent.data !== undefined ? { data: turnEvent.data } : {}),
        timestamp,
      }];
    }),
  ];
}

export function updateReceipt(
  messages: ChatMessage[],
  messageId: string,
  receipt: MessageReceipt,
): ChatMessage[] {
  return messages.map((message) => (
    message.id === messageId
      ? { ...message, receipt, ...(receipt !== 'failed' ? { error: undefined } : {}) }
      : message
  ));
}

export function markMessageFailed(messages: ChatMessage[], messageId: string, error: string, canRetry = true): ChatMessage[] {
  return messages.map((message) => (
    message.id === messageId
      ? { ...message, receipt: 'failed', error, canRetry }
      : message
  ));
}

export function isFailedUserDraftForContent(message: ChatMessage, content: string): boolean {
  return message.role === 'user' && message.receipt === 'failed' && message.content === content;
}

export function applySessionSnapshot(session: ChatSession): ChatMessage[] {
  return normalizeTranscript(session.transcript);
}

export function sessionHasTokenTelemetry(session: ChatSession): boolean {
  if (session.tokenTotals.cheap > 0
    || session.tokenTotals.premiumReasoning > 0
    || session.tokenTotals.premiumExecution > 0) {
    return true;
  }

  return session.transcript.some((message) => message.tokens !== undefined);
}

export function sessionHasCostTelemetry(session: ChatSession): boolean {
  if (session.costUsd > 0) {
    return true;
  }

  return session.transcript.some((message) => message.costUsd !== undefined);
}

export function mergeSessionSnapshot(current: ChatMessage[], session: ChatSession): ChatMessage[] {
  const snapshot = applySessionSnapshot(session);
  const snapshotById = new Map(snapshot.map((message) => [message.id, message]));
  const snapshotEquivalentMessages = new Map<string, ChatMessage[]>();
  for (const message of snapshot) {
    const key = `${message.role}\u0000${message.content}`;
    snapshotEquivalentMessages.set(key, [...(snapshotEquivalentMessages.get(key) ?? []), message]);
  }
  const seen = new Set<string>();
  const merged = current.flatMap((message) => {
    const snapshotMessage = snapshotById.get(message.id);
    if (snapshotMessage) {
      seen.add(message.id);
      return [snapshotMessage];
    }

    const key = `${message.role}\u0000${message.content}`;
    const equivalentMessages = snapshotEquivalentMessages.get(key) ?? [];
    const equivalentMessage = equivalentMessages.shift();
    if (equivalentMessage) {
      seen.add(equivalentMessage.id);
      return [equivalentMessage];
    }

    return [message];
  });

  return [
    ...merged,
    ...snapshot.filter((message) => !seen.has(message.id)),
  ];
}

export function preserveLocalRecoveryMessages(
  current: ChatMessage[],
  transcript: TranscriptMessage[],
): { messages: ChatMessage[]; clearedFailedDrafts: string[] } {
  const snapshot = normalizeTranscript(transcript);
  const snapshotIds = new Set(snapshot.map((message) => message.id));
  const unmatchedSnapshotContentCounts = new Map<string, number>();
  const clearedFailedDrafts: string[] = [];

  for (const message of snapshot) {
    const key = `${message.role}\u0000${message.content}`;
    unmatchedSnapshotContentCounts.set(key, (unmatchedSnapshotContentCounts.get(key) ?? 0) + 1);
  }

  const consumeSnapshotMatch = (message: ChatMessage): boolean => {
    const key = `${message.role}\u0000${message.content}`;
    const snapshotMatchCount = unmatchedSnapshotContentCounts.get(key) ?? 0;
    if (snapshotMatchCount === 0) {
      return false;
    }
    if (snapshotMatchCount === 1) {
      unmatchedSnapshotContentCounts.delete(key);
    } else {
      unmatchedSnapshotContentCounts.set(key, snapshotMatchCount - 1);
    }
    return true;
  };

  const localRecoveryMessages = current.flatMap((message): ChatMessage[] => {
    if (snapshotIds.has(message.id)) {
      consumeSnapshotMatch(message);
      return [];
    }

    if (consumeSnapshotMatch(message)) {
      if (message.role === 'user' && (message.receipt === 'failed' || (message.receipt === 'accepted' && message.canRetry === false))) {
        clearedFailedDrafts.push(message.content);
      }
      return [];
    }

    if (message.role === 'user' && message.receipt === 'accepted' && message.canRetry === false) {
      return [message];
    }

    if (message.role !== 'user' || !message.receipt || message.canRetry === false) {
      return [];
    }

    if (message.receipt === 'failed') {
      return [message];
    }

    if (message.content.trim().startsWith('/')) {
      return [];
    }

    return [{
      ...message,
      receipt: 'failed',
      error: message.error ?? 'The server acknowledged this message but did not include it in the refreshed transcript. Resend to recover it.',
      canRetry: true,
    }];
  });

  return { messages: [...snapshot, ...localRecoveryMessages], clearedFailedDrafts };
}
