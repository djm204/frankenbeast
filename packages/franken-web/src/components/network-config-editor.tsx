import { useState } from 'react';
import type { NetworkConfigResponse } from '../lib/network-api';

interface NetworkConfigEditorProps {
  config: NetworkConfigResponse;
  onSave(assignments: string[]): void;
}

export function NetworkConfigEditor({ config, onSave }: NetworkConfigEditorProps) {
  const [chatModel, setChatModel] = useState(config.chat.model);

  return (
    <section className="rail-card network-config-editor">
      <div className="rail-card__header">
        <p className="eyebrow">Config</p>
      </div>
      <label className="network-config-editor__field">
        <span>Chat model</span>
        <input
          aria-label="Chat model"
          className="field-control"
          type="text"
          value={chatModel}
          onChange={(event) => setChatModel(event.target.value)}
        />
      </label>
      <button className="button button--primary" type="button" onClick={() => onSave([`chat.model=${chatModel}`])}>
        Save config
      </button>
    </section>
  );
}
