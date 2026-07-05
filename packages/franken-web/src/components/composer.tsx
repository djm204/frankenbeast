import { useState } from 'react';
import type { ConnectionStatus, SessionStatus } from '../hooks/use-chat-session';

export interface ComposerProps {
  connectionStatus: ConnectionStatus;
  disabled: boolean;
  onSend: (content: string) => Promise<void> | void;
  status: SessionStatus;
}

export function Composer({ connectionStatus, disabled, onSend, status }: ComposerProps) {
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [value, setValue] = useState('');

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
      setError(err instanceof Error ? err.message : 'Message failed to send. Your draft was kept.');
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
      </label>
      {error && (
        <div className="composer__error" role="alert">
          <span>{error}</span>
          <button className="button button--secondary button--small" type="button" onClick={() => void submitCurrentValue()} disabled={disabled || isSending}>
            Retry send
          </button>
        </div>
      )}
      <div className="composer__footer">
        <p className="composer__status">
          <span>{connectionStatus}</span>
          <span>{status}</span>
        </p>
        <button className="button button--primary" type="submit" disabled={disabled || isSending}>
          {isSending ? 'Dispatching…' : 'Dispatch'}
        </button>
      </div>
    </form>
  );
}
