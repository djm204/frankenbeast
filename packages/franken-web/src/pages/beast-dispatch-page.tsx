import { useEffect, useRef, useState } from 'react';
import type {
  BeastCatalogEntry,
  BeastInterviewPrompt,
  BeastRunDetail,
  TrackedAgentDetail,
  TrackedAgentSummary,
} from '../lib/beast-api';

interface BeastDispatchPageProps {
  catalog: BeastCatalogEntry[];
  disabled: boolean;
  error: string | null;
  onDispatch(definitionId: string, config: Record<string, unknown>): void;
  onKill(runId: string): void;
  onResume(agentId: string): void;
  onRefresh(): void;
  onSelectAgent(agentId: string): void;
  onStop(runId: string): void;
  agentDetail: (TrackedAgentDetail & { run?: BeastRunDetail | null }) | null;
  agents: TrackedAgentSummary[];
  selectedAgentId: string | null;
}

type FormState = Record<string, Record<string, string>>;
type FormErrors = Record<string, Record<string, string>>;

function buildInitialFormState(catalog: BeastCatalogEntry[]): FormState {
  return Object.fromEntries(catalog.map((definition) => [
    definition.id,
    Object.fromEntries(definition.interviewPrompts.map((prompt) => [prompt.key, ''])),
  ]));
}

function buildPromptId(definition: BeastCatalogEntry, prompt: BeastInterviewPrompt): string {
  return `${definition.label} ${prompt.key}`;
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

export function BeastDispatchPage(props: BeastDispatchPageProps) {
  const [forms, setForms] = useState<FormState>(() => buildInitialFormState(props.catalog));
  const [errors, setErrors] = useState<FormErrors>({});
  const pickerRefs = useRef<Record<string, HTMLInputElement | null>>({});

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

  function submitDefinition(definition: BeastCatalogEntry) {
    const values = forms[definition.id] ?? {};
    const nextErrors = validateDefinition(definition, values);
    setErrors((current) => ({
      ...current,
      [definition.id]: nextErrors,
    }));
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    props.onDispatch(definition.id, values);
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
              <div className="beast-card__form">
                {definition.interviewPrompts.map((prompt) => {
                  const inputId = buildPromptId(definition, prompt);
                  const inputValue = forms[definition.id]?.[prompt.key] ?? '';
                  const error = errors[definition.id]?.[prompt.key];

                  return (
                    <label className="field-stack" key={prompt.key}>
                      <span>{prompt.prompt}</span>
                      {prompt.options && prompt.options.length > 0 ? (
                        <select
                          aria-label={inputId}
                          className="field-control"
                          disabled={props.disabled}
                          onChange={(event) => updateField(definition.id, prompt, event.target.value)}
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
                            aria-label={inputId}
                            className="field-control"
                            disabled={props.disabled}
                            onChange={(event) => updateField(definition.id, prompt, event.target.value)}
                            placeholder="path/to/chunks"
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
                          aria-label={inputId}
                          className="field-control"
                          disabled={props.disabled}
                          onChange={(event) => updateField(definition.id, prompt, event.target.value)}
                          placeholder={prompt.kind === 'file' ? 'path/to/design.md' : undefined}
                          type="text"
                          value={inputValue}
                        />
                      )}
                      {error && <small className="field-error">{error}</small>}
                    </label>
                  );
                })}
              </div>
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
            {props.agents.map((agent) => (
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
                  {agent.dispatchRunId && <small>linked run {agent.dispatchRunId}</small>}
                </div>
                {agent.dispatchRunId && (
                  <div className="beast-run-row__actions">
                    {agent.status === 'running' && (
                      <>
                        <button className="button button--secondary button--compact" onClick={() => props.onStop(agent.dispatchRunId!)} type="button">Pause {agent.dispatchRunId}</button>
                        <button className="button button--secondary button--compact" onClick={() => props.onKill(agent.dispatchRunId!)} type="button">Kill {agent.dispatchRunId}</button>
                      </>
                    )}
                    {agent.status === 'stopped' && (
                      <button className="button button--secondary button--compact" onClick={() => props.onResume(agent.id)} type="button">Resume {agent.id}</button>
                    )}
                  </div>
                )}
              </article>
            ))}
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
