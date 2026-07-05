import { useEffect, useRef, useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import type {
  BeastCatalogEntry,
  BeastExecutionMode,
  BeastInterviewPrompt,
  BeastRunDetail,
  ModuleConfig,
  TrackedAgentDetail,
  TrackedAgentSummary,
} from '../lib/beast-api';
import { MODULE_CONFIG_KEYS } from '../lib/beast-api';

interface BeastDispatchPageProps {
  catalog: BeastCatalogEntry[];
  disabled: boolean;
  error: string | null;
  onDelete(agentId: string): void;
  onDispatch(definitionId: string, config: Record<string, unknown>, moduleConfig?: ModuleConfig, executionMode?: BeastExecutionMode): void;
  onKill(runId: string): void;
  onRestart(agentId: string): void;
  onResume(agentId: string): void;
  onRefresh(): void;
  onSelectAgent(agentId: string): void;
  onStart(agentId: string): void;
  onStop(agentId: string): void;
  agentDetail: (TrackedAgentDetail & { run?: BeastRunDetail | null }) | null;
  agents: TrackedAgentSummary[];
  selectedAgentId: string | null;
}

type FormState = Record<string, Record<string, string>>;
type ModuleTogglesState = Record<string, ModuleConfig>;
type ExecutionModeState = Record<string, BeastExecutionMode>;
type FormErrors = Record<string, Record<string, string>>;

function buildInitialFormState(catalog: BeastCatalogEntry[]): FormState {
  return Object.fromEntries(catalog.map((definition) => [
    definition.id,
    Object.fromEntries(definition.interviewPrompts.map((prompt) => [prompt.key, ''])),
  ]));
}

function buildPromptControlId(definition: BeastCatalogEntry, prompt: BeastInterviewPrompt): string {
  return `${definition.id}-${prompt.key}-field`;
}

function buildPromptErrorId(definition: BeastCatalogEntry, prompt: BeastInterviewPrompt): string {
  return `${definition.id}-${prompt.key}-error`;
}

function isBrowserFakePath(value: string): boolean {
  return /^[a-zA-Z]:\\fakepath\\/i.test(value.trim());
}

function validatePrompt(prompt: BeastInterviewPrompt, value: string): string | null {
  const trimmed = value.trim();
  if (prompt.required && !trimmed) {
    return 'This field is required.';
  }
  if (!trimmed) {
    return null;
  }

  if (prompt.kind === 'file') {
    if (isBrowserFakePath(trimmed)) {
      return 'Browser file pickers cannot provide a server path. Enter a repo path manually.';
    }
    if (trimmed.endsWith('/')) {
      return 'Enter a file path, not a directory path.';
    }
    const lastSegment = trimmed.split('/').filter(Boolean).at(-1) ?? trimmed;
    if (!lastSegment.includes('.')) {
      return 'Enter a file path with a filename.';
    }
  }

  if (prompt.kind === 'directory' && /\.[^/]+$/.test(trimmed)) {
    return 'Enter a directory path, not a file path.';
  }

  return null;
}

function validateDefinition(definition: BeastCatalogEntry, values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(definition.interviewPrompts.flatMap((prompt) => {
    const error = validatePrompt(prompt, values[prompt.key] ?? '');
    return error ? [[prompt.key, error]] : [];
  }));
}

function canStopAgent(agent: TrackedAgentSummary): boolean {
  return agent.status === 'initializing' || agent.status === 'dispatching' || agent.status === 'running';
}

function canStartAgent(agent: TrackedAgentSummary): boolean {
  return agent.status === 'stopped' || agent.status === 'failed' || agent.status === 'completed';
}

function canRestartAgent(agent: TrackedAgentSummary): boolean {
  return agent.status === 'running' || canStartAgent(agent);
}

function ConfirmedAgentActionButton({
  action,
  confirmLabel,
  consequence,
  objectName,
  onConfirm,
}: {
  action: 'Stop' | 'Delete' | 'Kill';
  confirmLabel: string;
  consequence: string;
  objectName: string;
  onConfirm(): void;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <button
          aria-label={`${action} ${objectName} with confirmation`}
          className="button button--secondary button--compact"
          type="button"
        >
          {action} {objectName}
        </button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="beast-confirm-dialog__overlay" />
        <AlertDialog.Content className="beast-confirm-dialog">
          <AlertDialog.Title className="beast-confirm-dialog__title">
            {confirmLabel}
          </AlertDialog.Title>
          <AlertDialog.Description className="beast-confirm-dialog__description">
            {consequence}
          </AlertDialog.Description>
          <div className="beast-confirm-dialog__actions">
            <AlertDialog.Cancel asChild>
              <button autoFocus className="button button--secondary" type="button">Cancel</button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button className="button button--primary" onClick={onConfirm} type="button">
                {confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function BeastDispatchPage(props: BeastDispatchPageProps) {
  const [forms, setForms] = useState<FormState>(() => buildInitialFormState(props.catalog));
  const [moduleToggles, setModuleToggles] = useState<ModuleTogglesState>({});
  const [executionModes, setExecutionModes] = useState<ExecutionModeState>({});
  const [errors, setErrors] = useState<FormErrors>({});
  const pickerRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});

  useEffect(() => {
    setForms((current) => {
      const next = buildInitialFormState(props.catalog);
      for (const definition of props.catalog) {
        next[definition.id] = {
          ...next[definition.id],
          ...(current[definition.id] ?? {}),
        };
      }
      return next;
    });
  }, [props.catalog]);

  function updateField(definitionId: string, prompt: BeastInterviewPrompt, value: string) {
    setForms((current) => ({
      ...current,
      [definitionId]: {
        ...(current[definitionId] ?? {}),
        [prompt.key]: value,
      },
    }));

    setErrors((current) => {
      const next = { ...current };
      const currentDefinition = { ...(next[definitionId] ?? {}) };
      const error = validatePrompt(prompt, value);
      if (error) {
        currentDefinition[prompt.key] = error;
      } else {
        delete currentDefinition[prompt.key];
      }
      next[definitionId] = currentDefinition;
      return next;
    });
  }

  function toggleModule(definitionId: string, key: keyof ModuleConfig) {
    setModuleToggles((current) => {
      const definitionToggles = current[definitionId] ?? {};
      const currentValue = definitionToggles[key] ?? true;
      return {
        ...current,
        [definitionId]: { ...definitionToggles, [key]: !currentValue },
      };
    });
  }

  function submitDefinition(definition: BeastCatalogEntry) {
    const values = forms[definition.id] ?? {};
    const nextErrors = validateDefinition(definition, values);
    setErrors((current) => ({
      ...current,
      [definition.id]: nextErrors,
    }));
    if (Object.keys(nextErrors).length > 0) {
      const firstInvalidPrompt = definition.interviewPrompts.find((prompt) => nextErrors[prompt.key]);
      if (firstInvalidPrompt) {
        fieldRefs.current[`${definition.id}:${firstInvalidPrompt.key}`]?.focus();
      }
      return;
    }
    const toggles = moduleToggles[definition.id];
    const hasDisabled = toggles && Object.values(toggles).some((v) => v === false);
    props.onDispatch(definition.id, values, hasDisabled ? toggles : undefined, executionModes[definition.id] ?? definition.executionModeDefault ?? 'process');
  }

  return (
    <main className="beast-page">
      <section className="beast-page__header rail-card">
        <div>
          <p className="eyebrow">Dispatch Station</p>
          <h2>Beasts</h2>
        </div>
        <button className="button button--secondary" type="button" onClick={props.onRefresh}>Refresh</button>
      </section>

      {props.error && (
        <section className="rail-card rail-card--approval">
          <p>{props.error}</p>
        </section>
      )}

      <div className="beast-page__grid">
        <section className="beast-page__catalog">
          {props.catalog.map((definition) => (
            <article className="rail-card beast-card" key={definition.id}>
              <div className="rail-card__header">
                <div>
                  <p className="eyebrow">Catalog</p>
                  <h3>{definition.label}</h3>
                </div>
                <span className="sidebar__status">{definition.executionModeDefault}</span>
              </div>
              <p className="beast-card__description">{definition.description}</p>
              <fieldset className="beast-card__modules">
                <legend>Execution mode</legend>
                <label className="beast-module-toggle">
                  <input
                    aria-label={`${definition.label} process execution mode`}
                    checked={(executionModes[definition.id] ?? definition.executionModeDefault) === 'process'}
                    disabled={props.disabled}
                    name={`${definition.id}-execution-mode`}
                    onChange={() => setExecutionModes((current) => ({ ...current, [definition.id]: 'process' }))}
                    type="radio"
                  />
                  <span>process</span>
                </label>
                <label className="beast-module-toggle" title={definition.containerRuntime?.available === false ? definition.containerRuntime.reason ?? 'Container runtime unavailable.' : undefined}>
                  <input
                    aria-describedby={definition.containerRuntime?.available === false ? `${definition.id}-container-disabled` : undefined}
                    aria-label={`${definition.label} container execution mode`}
                    checked={(executionModes[definition.id] ?? definition.executionModeDefault) === 'container'}
                    disabled={props.disabled || definition.containerRuntime?.available === false}
                    name={`${definition.id}-execution-mode`}
                    onChange={() => setExecutionModes((current) => ({ ...current, [definition.id]: 'container' }))}
                    type="radio"
                  />
                  <span>container</span>
                </label>
                {definition.containerRuntime?.available === false && (
                  <small id={`${definition.id}-container-disabled`} className="field-error">
                    Container unavailable: {definition.containerRuntime.reason ?? 'Container runtime unavailable.'}
                  </small>
                )}
              </fieldset>
              <div className="beast-card__form">
                {definition.interviewPrompts.map((prompt) => {
                  const inputId = buildPromptControlId(definition, prompt);
                  const errorId = buildPromptErrorId(definition, prompt);
                  const inputValue = forms[definition.id]?.[prompt.key] ?? '';
                  const error = errors[definition.id]?.[prompt.key];

                  return (
                    <label className="field-stack" htmlFor={inputId} key={prompt.key}>
                      <span>{prompt.prompt}</span>
                      {prompt.options && prompt.options.length > 0 ? (
                        <select
                          aria-describedby={error ? errorId : undefined}
                          aria-invalid={error ? true : undefined}
                          className="field-control"
                          disabled={props.disabled}
                          id={inputId}
                          onChange={(event) => updateField(definition.id, prompt, event.target.value)}
                          ref={(element) => {
                            fieldRefs.current[`${definition.id}:${prompt.key}`] = element;
                          }}
                          value={inputValue}
                        >
                          <option value="">Select</option>
                          {prompt.options.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : prompt.kind === 'directory' ? (
                        <div className="beast-path-picker">
                          <input
                            aria-describedby={error ? errorId : undefined}
                            aria-invalid={error ? true : undefined}
                            className="field-control"
                            disabled={props.disabled}
                            id={inputId}
                            onChange={(event) => updateField(definition.id, prompt, event.target.value)}
                            placeholder="path/to/chunks"
                            ref={(element) => {
                              fieldRefs.current[`${definition.id}:${prompt.key}`] = element;
                            }}
                            type="text"
                            value={inputValue}
                          />
                          <button
                            className="button button--secondary button--compact"
                            disabled={props.disabled}
                            onClick={() => pickerRefs.current[`${definition.id}:${prompt.key}`]?.click()}
                            type="button"
                          >
                            {`Choose directory for ${definition.label} ${prompt.key}`}
                          </button>
                          <input
                            ref={(element) => {
                              pickerRefs.current[`${definition.id}:${prompt.key}`] = element;
                            }}
                            aria-hidden="true"
                            className="beast-path-picker__native"
                            onChange={(event) => {
                              const raw = event.target.value;
                              if (raw) {
                                updateField(definition.id, prompt, raw);
                              }
                            }}
                            type="file"
                            {...{ webkitdirectory: '' as unknown as undefined }}
                          />
                        </div>
                      ) : (
                        <input
                          aria-describedby={error ? errorId : undefined}
                          aria-invalid={error ? true : undefined}
                          className="field-control"
                          disabled={props.disabled}
                          id={inputId}
                          onChange={(event) => updateField(definition.id, prompt, event.target.value)}
                          placeholder={prompt.kind === 'file' ? 'path/to/design.md' : undefined}
                          ref={(element) => {
                            fieldRefs.current[`${definition.id}:${prompt.key}`] = element;
                          }}
                          type="text"
                          value={inputValue}
                        />
                      )}
                      {error && <small className="field-error" id={errorId}>{error}</small>}
                    </label>
                  );
                })}
              </div>
              <details className="beast-card__modules">
                <summary>Module Toggles</summary>
                <div className="beast-card__module-grid">
                  {MODULE_CONFIG_KEYS.map((key) => {
                    const isEnabled = moduleToggles[definition.id]?.[key] ?? true;
                    return (
                      <label className="beast-module-toggle" key={key}>
                        <input
                          aria-label={`${definition.label} module ${key}`}
                          checked={isEnabled}
                          disabled={props.disabled}
                          onChange={() => toggleModule(definition.id, key)}
                          type="checkbox"
                        />
                        <span>{key}</span>
                      </label>
                    );
                  })}
                </div>
              </details>
              <button
                className="button button--primary"
                disabled={props.disabled}
                onClick={() => submitDefinition(definition)}
                type="button"
              >
                Launch {definition.label}
              </button>
            </article>
          ))}
        </section>

        <section className="beast-page__runs rail-card">
          <div className="rail-card__header">
            <div>
              <p className="eyebrow">Agents</p>
              <h3>Tracked Agents</h3>
            </div>
          </div>
          <div className="beast-run-list">
            {props.agents.map((agent) => {
              const linkedRunId = agent.dispatchRunId;

              return (
              <article className={`beast-run-row ${props.selectedAgentId === agent.id ? 'beast-run-row--selected' : ''}`} key={agent.id}>
                <button
                  className="button button--secondary button--compact"
                  onClick={() => props.onSelectAgent(agent.id)}
                  type="button"
                >
                  Inspect {agent.id}
                </button>
                <div className="beast-run-row__summary">
                  <strong>{agent.definitionId}</strong>
                  <span>{agent.status}</span>
                  <small>{agent.source} · {agent.createdByUser}</small>
                  {linkedRunId && <small>linked run {linkedRunId}</small>}
                </div>
                <div className="beast-run-row__actions">
                  {canStopAgent(agent) && (
                    <ConfirmedAgentActionButton
                      action="Stop"
                      confirmLabel={`Stop ${agent.id}`}
                      consequence={`This interrupts ${agent.id} and may leave its current work incomplete until you start or resume it.`}
                      objectName={agent.id}
                      onConfirm={() => props.onStop(agent.id)}
                    />
                  )}
                  {canStartAgent(agent) && (
                    <button className="button button--secondary button--compact" onClick={() => props.onStart(agent.id)} type="button">Start {agent.id}</button>
                  )}
                  {canRestartAgent(agent) && (
                    <button className="button button--secondary button--compact" onClick={() => props.onRestart(agent.id)} type="button">Restart {agent.id}</button>
                  )}
                  {agent.status === 'stopped' && linkedRunId && (
                    <button className="button button--secondary button--compact" onClick={() => props.onResume(agent.id)} type="button">Resume {agent.id}</button>
                  )}
                  {agent.status === 'stopped' && (
                    <ConfirmedAgentActionButton
                      action="Delete"
                      confirmLabel={`Delete ${agent.id}`}
                      consequence={`This removes ${agent.id} from tracked agents. Its saved metadata and row will no longer be available from this list.`}
                      objectName={agent.id}
                      onConfirm={() => props.onDelete(agent.id)}
                    />
                  )}
                  {agent.status === 'running' && linkedRunId && (
                    <ConfirmedAgentActionButton
                      action="Kill"
                      confirmLabel={`Kill run ${linkedRunId}`}
                      consequence={`This force-terminates linked run ${linkedRunId} for ${agent.id}. Logs or in-progress output may be lost.`}
                      objectName={linkedRunId}
                      onConfirm={() => props.onKill(linkedRunId)}
                    />
                  )}
                </div>
              </article>
            );
            })}
          </div>
        </section>

        <aside className="beast-page__detail rail-card">
          <div className="rail-card__header">
            <div>
              <p className="eyebrow">Detail</p>
              <h3>{props.agentDetail?.agent.id ?? 'Select an agent'}</h3>
            </div>
          </div>

          {props.agentDetail ? (
            <div className="beast-detail">
              <p>Status: {props.agentDetail.agent.status}</p>
              <p>Init Action: {props.agentDetail.agent.initAction.command}</p>
              <p>Chat Session: {props.agentDetail.agent.chatSessionId ?? 'none'}</p>
              <p>Linked Run: {props.agentDetail.agent.dispatchRunId ?? 'pending'}</p>
              {props.agentDetail.agent.moduleConfig && (
                <p>Modules: {MODULE_CONFIG_KEYS.filter((k) => props.agentDetail!.agent.moduleConfig?.[k] === false).map((k) => `-${k}`).join(' ') || 'all enabled'}</p>
              )}
              <section>
                <h4>Startup Logs</h4>
                <pre className="beast-detail__logs">{props.agentDetail.events.map((event) => event.message).join('\n')}</pre>
              </section>
              <section>
                <h4>Events</h4>
                <ul className="beast-detail__list">
                  {props.agentDetail.events.map((event) => (
                    <li key={event.id}>{event.type}</li>
                  ))}
                </ul>
              </section>
              {props.agentDetail.run && (
                <section>
                  <h4>Run Logs</h4>
                  <pre className="beast-detail__logs">{props.agentDetail.run.logs.join('\n')}</pre>
                </section>
              )}
            </div>
          ) : (
            <p>Pick an agent to inspect init metadata, progress, and linked run logs.</p>
          )}
        </aside>
      </div>
    </main>
  );
}
