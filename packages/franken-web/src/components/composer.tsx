import { useState } from 'react';
import type { ConnectionStatus, SessionStatus } from '../hooks/use-chat-session';

export interface ComposerProps {
  connectionStatus: ConnectionStatus;
  disabled: boolean;
  onSend: (content: string) => void;
  status: SessionStatus;
}

export function Composer({ connectionStatus, disabled, onSend, status }: ComposerProps) {
  const [value, setValue] = useState('');

  function submitCurrentValue() {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    onSend(trimmed);
    setValue('');
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitCurrentValue();
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
              submitCurrentValue();
            }
          }}
          placeholder="Ask Frankenbeast to plan, explain, execute, or use slash commands like /run or /plan."
          aria-label="Message input"
          rows={3}
        />
      </label>
      <div className="composer__footer">
        <p className="composer__status">
          <span>{connectionStatus}</span>
          <span>{status}</span>
        </p>
        <button className="button button--primary" type="submit" disabled={disabled}>
          Dispatch
        </button>
      </div>
    </form>
  );
}
