import { useRef, useEffect } from 'react';
import type { TranscriptMessage } from '../lib/api';

export interface TranscriptPaneProps {
  messages: TranscriptMessage[];
}

export function TranscriptPane({ messages }: TranscriptPaneProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof endRef.current?.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  return (
    <section aria-label="Transcript">
      {messages.map((msg, i) => (
        <div key={i} className={`message message--${msg.role}`}>
          <span className="message__role">{msg.role}</span>
          {msg.modelTier && (
            <span className="message__tier">{msg.modelTier}</span>
          )}
          <p className="message__content">{msg.content}</p>
        </div>
      ))}
      <div ref={endRef} />
    </section>
  );
}
