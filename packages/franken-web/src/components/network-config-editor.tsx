import { useEffect, useMemo, useRef, useState } from 'react';
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

const NETWORK_MODES = ['secure', 'insecure'] as const;
const SECURE_BACKENDS = ['local-encrypted', 'os-keychain', '1password', 'bitwarden'] as const;

function formStateFromConfig(config: NetworkConfigResponse): NetworkConfigFormState {
  return {
    networkMode: config.network.mode,
    secureBackend: config.network.secureBackend ?? 'local-encrypted',
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

function validatePort(label: string, value: string): string | null {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (!/^\d+$/.test(trimmed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    return `${label} must be between 1 and 65535.`;
  }
  return null;
}

function validateUrl(label: string, value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return `${label} must be an HTTP or HTTPS URL.`;
    }
  } catch {
    return `${label} must be a valid URL.`;
  }
  return null;
}

function validateForm(state: NetworkConfigFormState): string[] {
  const errors: string[] = [];
  if (!NETWORK_MODES.includes(state.networkMode as (typeof NETWORK_MODES)[number])) {
    errors.push('Network mode must be secure or insecure.');
  }
  if (!SECURE_BACKENDS.includes(state.secureBackend as (typeof SECURE_BACKENDS)[number])) {
    errors.push('Secure backend must be local-encrypted, os-keychain, 1password, or bitwarden.');
  }
  if (!state.chatModel.trim()) {
    errors.push('Chat model is required.');
  }
  if (!state.chatHost.trim()) {
    errors.push('Chat host is required.');
  }
  const chatPortError = validatePort('Chat port', state.chatPort);
  if (chatPortError) {
    errors.push(chatPortError);
  }
  const shouldValidateDashboard = state.dashboardEnabled
    || Boolean(state.dashboardHost.trim())
    || Boolean(state.dashboardPort.trim())
    || Boolean(state.dashboardApiUrl.trim());
  if (shouldValidateDashboard) {
    if (!state.dashboardHost.trim()) {
      errors.push('Dashboard host is required.');
    }
    const dashboardPortError = validatePort('Dashboard port', state.dashboardPort);
    if (dashboardPortError) {
      errors.push(dashboardPortError);
    }
    if (!state.dashboardApiUrl.trim()) {
      errors.push('Dashboard API URL is required.');
    } else {
      const apiUrlError = validateUrl('Dashboard API URL', state.dashboardApiUrl);
      if (apiUrlError) {
        errors.push(apiUrlError);
      }
    }
  }
  return errors;
}

export function NetworkConfigEditor({ config, onSave }: NetworkConfigEditorProps) {
  const initialState = useMemo(() => formStateFromConfig(config), [config]);
  const previousInitialStateRef = useRef<NetworkConfigFormState>(initialState);
  const shouldAcceptNextConfigRef = useRef(false);
  const [formState, setFormState] = useState<NetworkConfigFormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const assignments = buildAssignments(formState, initialState);
  const validationErrors = validateForm(formState);
  const canSave = assignments.length > 0 && validationErrors.length === 0 && !isSaving;

  useEffect(() => {
    if (shouldAcceptNextConfigRef.current) {
      setFormState(initialState);
      previousInitialStateRef.current = initialState;
      shouldAcceptNextConfigRef.current = false;
      setError(null);
      return;
    }
    const previousInitialState = previousInitialStateRef.current;
    setFormState((current) => {
      const next: NetworkConfigFormState = { ...initialState };
      for (const key of Object.keys(current) as Array<keyof NetworkConfigFormState>) {
        if (current[key] !== previousInitialState[key]) {
          next[key] = current[key] as never;
        }
      }
      return next;
    });
    previousInitialStateRef.current = initialState;
    setError(null);
  }, [initialState]);

  function update<K extends keyof NetworkConfigFormState>(key: K, value: NetworkConfigFormState[K]) {
    setFormState((current) => ({ ...current, [key]: value }));
    setError(null);
    setSuccess(null);
  }

  async function save() {
    if (!canSave) {
      return;
    }
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await onSave(assignments);
      shouldAcceptNextConfigRef.current = true;
      setSuccess('Saved network config changes.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save network config.');
    } finally {
      setIsSaving(false);
    }
  }

  const alertMessage = error ?? (assignments.length > 0 ? validationErrors[0] : null);

  return (
    <section className="rail-card network-config-editor">
      <div className="rail-card__header">
        <p className="eyebrow">Config</p>
      </div>

      <label className="network-config-editor__field">
        <span>Network mode</span>
        <select
          aria-label="Network mode"
          className="field-control"
          value={formState.networkMode}
          onChange={(event) => update('networkMode', event.target.value)}
        >
          {NETWORK_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
        </select>
      </label>

      <label className="network-config-editor__field">
        <span>Secure backend</span>
        <select
          aria-label="Secure backend"
          className="field-control"
          value={formState.secureBackend}
          onChange={(event) => update('secureBackend', event.target.value)}
        >
          {SECURE_BACKENDS.map((backend) => <option key={backend} value={backend}>{backend}</option>)}
        </select>
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
          aria-invalid={validationErrors.some((message) => message.startsWith('Chat port')) ? true : undefined}
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
          aria-invalid={validationErrors.some((message) => message.startsWith('Dashboard port')) ? true : undefined}
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
          aria-invalid={validationErrors.some((message) => message.startsWith('Dashboard API URL')) ? true : undefined}
          className="field-control"
          type="url"
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

      <div className="network-config-editor__pending" aria-live="polite">
        <h3>Pending config changes</h3>
        {assignments.length > 0 ? (
          <ul>
            {assignments.map((item) => <li key={item}><code>{item}</code></li>)}
          </ul>
        ) : (
          <p>No pending config changes.</p>
        )}
      </div>

      {alertMessage && <p className="network-config-editor__alert" role="alert">{alertMessage}</p>}
      {success && <p className="network-config-editor__success" role="status">{success}</p>}

      <button className="button button--primary" type="button" disabled={!canSave} onClick={() => { void save(); }}>
        {isSaving ? 'Saving…' : 'Save config'}
      </button>
    </section>
  );
}
