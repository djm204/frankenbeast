import { useEffect, useMemo, useState } from 'react';
import type { NetworkConfigResponse } from '../lib/network-api';

interface NetworkConfigEditorProps {
  config: NetworkConfigResponse;
  onSave(assignments: string[]): Promise<void> | void;
}

interface NetworkConfigFormState {
  networkMode: string;
  secureBackend: string;
  chatEnabled: boolean;
  chatModel: string;
  chatHost: string;
  chatPort: string;
  dashboardEnabled: boolean;
  dashboardHost: string;
  dashboardPort: string;
  dashboardApiUrl: string;
  commsEnabled: boolean;
}

function formStateFromConfig(config: NetworkConfigResponse): NetworkConfigFormState {
  return {
    networkMode: config.network.mode,
    secureBackend: config.network.secureBackend ?? '',
    chatEnabled: config.chat.enabled,
    chatModel: config.chat.model,
    chatHost: config.chat.host ?? '',
    chatPort: config.chat.port === undefined ? '' : String(config.chat.port),
    dashboardEnabled: config.dashboard?.enabled ?? false,
    dashboardHost: config.dashboard?.host ?? '',
    dashboardPort: config.dashboard?.port === undefined ? '' : String(config.dashboard.port),
    dashboardApiUrl: config.dashboard?.apiUrl ?? '',
    commsEnabled: config.comms?.enabled ?? false,
  };
}

function assignment(key: string, value: string | boolean): string {
  return `${key}=${String(value)}`;
}

function hasChanged(current: string | boolean, initial: string | boolean): boolean {
  return current !== initial;
}

function buildAssignments(current: NetworkConfigFormState, initial: NetworkConfigFormState): string[] {
  const candidates: Array<[key: string, current: string | boolean, initial: string | boolean]> = [
    ['network.mode', current.networkMode, initial.networkMode],
    ['network.secureBackend', current.secureBackend, initial.secureBackend],
    ['chat.enabled', current.chatEnabled, initial.chatEnabled],
    ['chat.model', current.chatModel, initial.chatModel],
    ['chat.host', current.chatHost, initial.chatHost],
    ['chat.port', current.chatPort, initial.chatPort],
    ['dashboard.enabled', current.dashboardEnabled, initial.dashboardEnabled],
    ['dashboard.host', current.dashboardHost, initial.dashboardHost],
    ['dashboard.port', current.dashboardPort, initial.dashboardPort],
    ['dashboard.apiUrl', current.dashboardApiUrl, initial.dashboardApiUrl],
    ['comms.enabled', current.commsEnabled, initial.commsEnabled],
  ];

  return candidates
    .filter(([, value, previous]) => hasChanged(value, previous))
    .map(([key, value]) => assignment(key, value));
}

export function NetworkConfigEditor({ config, onSave }: NetworkConfigEditorProps) {
  const initialState = useMemo(() => formStateFromConfig(config), [config]);
  const [formState, setFormState] = useState<NetworkConfigFormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const assignments = buildAssignments(formState, initialState);

  useEffect(() => {
    setFormState(initialState);
    setError(null);
  }, [initialState]);

  function update<K extends keyof NetworkConfigFormState>(key: K, value: NetworkConfigFormState[K]) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setIsSaving(true);
    setError(null);
    try {
      await onSave(assignments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save network config.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rail-card network-config-editor">
      <div className="rail-card__header">
        <p className="eyebrow">Config</p>
      </div>

      <label className="network-config-editor__field">
        <span>Network mode</span>
        <input
          aria-label="Network mode"
          className="field-control"
          type="text"
          value={formState.networkMode}
          onChange={(event) => update('networkMode', event.target.value)}
        />
      </label>

      <label className="network-config-editor__field">
        <span>Secure backend</span>
        <input
          aria-label="Secure backend"
          className="field-control"
          type="text"
          value={formState.secureBackend}
          onChange={(event) => update('secureBackend', event.target.value)}
        />
      </label>

      <label className="network-config-editor__field network-config-editor__field--checkbox">
        <input
          aria-label="Chat enabled"
          type="checkbox"
          checked={formState.chatEnabled}
          onChange={(event) => update('chatEnabled', event.target.checked)}
        />
        <span>Chat enabled</span>
      </label>

      <label className="network-config-editor__field">
        <span>Chat model</span>
        <input
          aria-label="Chat model"
          className="field-control"
          type="text"
          value={formState.chatModel}
          onChange={(event) => update('chatModel', event.target.value)}
        />
      </label>

      <label className="network-config-editor__field">
        <span>Chat host</span>
        <input
          aria-label="Chat host"
          className="field-control"
          type="text"
          value={formState.chatHost}
          onChange={(event) => update('chatHost', event.target.value)}
        />
      </label>

      <label className="network-config-editor__field">
        <span>Chat port</span>
        <input
          aria-label="Chat port"
          className="field-control"
          inputMode="numeric"
          type="number"
          value={formState.chatPort}
          onChange={(event) => update('chatPort', event.target.value)}
        />
      </label>

      <label className="network-config-editor__field network-config-editor__field--checkbox">
        <input
          aria-label="Dashboard enabled"
          type="checkbox"
          checked={formState.dashboardEnabled}
          onChange={(event) => update('dashboardEnabled', event.target.checked)}
        />
        <span>Dashboard enabled</span>
      </label>

      <label className="network-config-editor__field">
        <span>Dashboard host</span>
        <input
          aria-label="Dashboard host"
          className="field-control"
          type="text"
          value={formState.dashboardHost}
          onChange={(event) => update('dashboardHost', event.target.value)}
        />
      </label>

      <label className="network-config-editor__field">
        <span>Dashboard port</span>
        <input
          aria-label="Dashboard port"
          className="field-control"
          inputMode="numeric"
          type="number"
          value={formState.dashboardPort}
          onChange={(event) => update('dashboardPort', event.target.value)}
        />
      </label>

      <label className="network-config-editor__field">
        <span>Dashboard API URL</span>
        <input
          aria-label="Dashboard API URL"
          className="field-control"
          type="text"
          value={formState.dashboardApiUrl}
          onChange={(event) => update('dashboardApiUrl', event.target.value)}
        />
      </label>

      <label className="network-config-editor__field network-config-editor__field--checkbox">
        <input
          aria-label="Comms enabled"
          type="checkbox"
          checked={formState.commsEnabled}
          onChange={(event) => update('commsEnabled', event.target.checked)}
        />
        <span>Comms enabled</span>
      </label>

      {error && <p role="alert">{error}</p>}

      <button className="button button--primary" type="button" disabled={isSaving} onClick={() => { void save(); }}>
        {isSaving ? 'Saving…' : 'Save config'}
      </button>
    </section>
  );
}
