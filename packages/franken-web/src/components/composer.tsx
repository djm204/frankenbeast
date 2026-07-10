import { useEffect, useRef, useState } from 'react';
import type { ConnectionStatus, SessionStatus } from '../hooks/use-chat-session';

export interface ComposerProps {
  connectionStatus: ConnectionStatus;
  clearedFailedDraft?: { content: string; nonce: number };
  disabled: boolean;
  disabledReasonText?: string;
  onReconnect?: () => void;
  onSend: (content: string) => Promise<void> | void;
  status: SessionStatus;
}

type ComposerError = { content: string; message: string; retryable: boolean };

function isNonRetryableSendError(error: unknown): boolean {
  return error instanceof Error && (error as Error & { retryableSend?: boolean }).retryableSend === false;
}

function connectionStatusLabel(connectionStatus: ConnectionStatus): string {
  switch (connectionStatus) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting to chat';
    case 'reconnecting':
      return 'Reconnecting to chat';
    case 'disconnected':
      return 'Chat disconnected';
    case 'offline':
      return 'Browser offline';
    case 'error':
      return 'Connection error';
  }
}

function sessionStatusLabel(status: SessionStatus): string {
  switch (status) {
    case 'idle':
      return 'Ready to dispatch';
    case 'connecting':
      return 'Preparing chat session';
    case 'sending':
      return 'Sending message';
    case 'streaming':
      return 'Assistant is responding';
    case 'error':
      return 'Chat needs attention';
  }
}

function disabledReason(status: SessionStatus): string | null {
  switch (status) {
    case 'connecting':
      return 'Dispatch is disabled while the chat session connects.';
    case 'sending':
      return 'Dispatch is disabled while your previous message is being sent.';
    case 'streaming':
      return 'Dispatch is disabled while Frankenbeast is responding.';
    default:
      return null;
  }
}

function connectionHelp(connectionStatus: ConnectionStatus): string | null {
  switch (connectionStatus) {
    case 'connecting':
      return 'Connecting to live chat. Dispatch will unlock when the session is ready.';
    case 'reconnecting':
      return 'Reconnecting to live chat. Messages may use the HTTP fallback if needed.';
    case 'disconnected':
      return 'Live chat is disconnected. Try reconnecting before sending time-sensitive work.';
    case 'offline':
      return 'Your browser is offline. Reconnect to the network, then try reconnecting chat.';
    case 'error':
      return 'The live chat connection hit an error. Try reconnecting.';
    default:
      return null;
  }
}

function canRetryConnection(connectionStatus: ConnectionStatus): boolean {
  return connectionStatus === 'disconnected' || connectionStatus === 'offline' || connectionStatus === 'error';
}

export function Composer({ connectionStatus, clearedFailedDraft, disabled, disabledReasonText, onReconnect, onSend, status }: ComposerProps) {
  const [error, setError] = useState<ComposerError | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [value, setValue] = useState('');
  const lastClearedFailedDraftNonceRef = useRef<number | null>(null);
  const helpText = disabledReasonText
    ?? disabledReason(status)
    ?? connectionHelp(connectionStatus)
    ?? 'Type a message, then press Dispatch or Ctrl+Enter to send.';
  const liveStatus = `${connectionStatusLabel(connectionStatus)}. ${sessionStatusLabel(status)}.`;
  const showReconnect = canRetryConnection(connectionStatus);

  useEffect(() => {
    if (!clearedFailedDraft || lastClearedFailedDraftNonceRef.current === clearedFailedDraft.nonce) {
      return;
    }

    lastClearedFailedDraftNonceRef.current = clearedFailedDraft.nonce;
    setError((current) => (
      current && current.content.trim() !== clearedFailedDraft.content.trim()
        ? current
        : null
    ));
    setValue((current) => (
      current.trim() === clearedFailedDraft.content.trim()
        ? ''
        : current
    ));
  }, [clearedFailedDraft]);

  async function submitCurrentValue() {
    if (disabled) {
      return;
    }

    const trimmed = value.trim();
    if (!trimmed || isSending) {
      return;
    }

    setError(null);
    setIsSending(true);
    try {
      await onSend(trimmed);
      setValue((current) => (current === value ? '' : current));
    } catch (err) {
      setError({
        content: trimmed,
        message: err instanceof Error ? err.message : 'Message failed to send. Your draft was kept.',
        retryable: !isNonRetryableSendError(err),
      });
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitCurrentValue();
  }

  return (
    <form className="composer" onSubmit={handleSubmit} aria-label="Message composer">
      <label className="composer__field">
        <span className="eyebrow">Dispatch Input</span>
        <textarea
          aria-describedby="composer-help composer-live-status"
          aria-disabled={disabled ? 'true' : undefined}
          className="field-control composer__textarea"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.ctrlKey) {
              event.preventDefault();
              void submitCurrentValue();
            }
          }}
          placeholder="Ask Frankenbeast to plan, explain, execute, or use slash commands like /run or /plan."
          aria-label="Message input"
          rows={3}
        />
        <span className="composer__help" id="composer-help">
          {helpText}
        </span>
      </label>
      {error && (
        <div className="composer__error" role="alert">
          <span>{error.message}</span>
          {error.retryable ? (
            <button className="button button--secondary button--small" type="button" onClick={() => void submitCurrentValue()} disabled={disabled || isSending}>
              Retry send
            </button>
          ) : null}
        </div>
      )}
      <div className="composer__footer">
        <p className="composer__status" id="composer-live-status" role="status" aria-live="polite" aria-atomic="true">
          <span>{connectionStatusLabel(connectionStatus)}</span>
          <span>{sessionStatusLabel(status)}</span>
          <span className="composer__status-message">{liveStatus}</span>
        </p>
        <div className="composer__actions">
          {showReconnect ? (
            <button className="button button--secondary" type="button" onClick={onReconnect}>
              Try reconnecting
            </button>
          ) : null}
          <button className="button button--primary" type="submit" disabled={disabled || isSending}>
            {isSending ? 'Dispatching…' : 'Dispatch'}
          </button>
        </div>
      </div>
    </form>
  );
}
