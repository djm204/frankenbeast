import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../hooks/use-chat-session';

export interface TranscriptPaneProps {
  messages: ChatMessage[];
  showTypingIndicator: boolean;
}

export function TranscriptPane({ messages, showTypingIndicator }: TranscriptPaneProps) {
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
