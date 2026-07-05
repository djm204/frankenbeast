import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../hooks/use-chat-session';

export interface TranscriptPaneProps {
  messages: ChatMessage[];
  onRetryMessage?: (messageId: string) => void;
  retryDisabled?: boolean;
  showTypingIndicator: boolean;
}

export function TranscriptPane({ messages, onRetryMessage, retryDisabled = false, showTypingIndicator }: TranscriptPaneProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof endRef.current?.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length, showTypingIndicator]);

  return (
    <section className="transcript-pane" aria-label="Transcript">
      <div className="transcript-pane__header">
        <div>
          <p className="eyebrow">Command Console</p>
          <h1>Chat</h1>
        </div>
        <p className="transcript-pane__meta">CLI-parity conversation stream with live execution telemetry.</p>
      </div>

      <div className="transcript-pane__body">
        {messages.length === 0 && (
          <div className="empty-state">
            <p>No messages yet.</p>
            <span>Start with a direct request or a slash command like `/plan`.</span>
          </div>
        )}

        {messages.map((message) => (
          <article key={message.id} className={`message-card message-card--${message.role}`}>
            <div className="message-card__meta">
              <span className="message-card__role">{message.role}</span>
              {message.modelTier && <span className="message-card__tier">{message.modelTier}</span>}
              {message.receipt && <span className="message-card__receipt">{message.receipt}</span>}
            </div>
            <p className="message-card__content">{message.content}</p>
            {message.error && <p className="message-card__error">{message.error}</p>}
            {message.role === 'user' && message.receipt === 'failed' && message.canRetry !== false && onRetryMessage && (
              <button
                className="button button--secondary button--small message-card__action"
                disabled={retryDisabled}
                type="button"
                onClick={() => onRetryMessage(message.id)}
              >
                Resend failed message
              </button>
            )}
          </article>
        ))}

        {showTypingIndicator && (
          <article className="message-card message-card--assistant message-card--typing">
            <div className="message-card__meta">
              <span className="message-card__role">assistant</span>
            </div>
            <p className="message-card__content">Frankenbeast is typing…</p>
          </article>
        )}

        <div ref={endRef} />
      </div>
    </section>
  );
}
