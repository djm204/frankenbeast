import { useEffect, useState } from 'react';
import type { BeastCatalogEntry, BeastRunDetail, BeastRunSummary } from '../lib/beast-api';

interface BeastDispatchPageProps {
  catalog: BeastCatalogEntry[];
  disabled: boolean;
  error: string | null;
  onDispatch(definitionId: string, config: Record<string, unknown>): void;
  onKill(runId: string): void;
  onRefresh(): void;
  onRestart(runId: string): void;
  onSelectRun(runId: string): void;
  onStart(runId: string): void;
  onStop(runId: string): void;
  runDetail: BeastRunDetail | null;
  runs: BeastRunSummary[];
  selectedRunId: string | null;
}

function buildInitialFormState(catalog: BeastCatalogEntry[]): Record<string, Record<string, string>> {
  return Object.fromEntries(catalog.map((definition) => [
    definition.id,
    Object.fromEntries(definition.interviewPrompts.map((prompt) => [prompt.key, ''])),
  ]));
}

export function BeastDispatchPage(props: BeastDispatchPageProps) {
  const [forms, setForms] = useState<Record<string, Record<string, string>>>(() => buildInitialFormState(props.catalog));

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
                {definition.interviewPrompts.map((prompt) => (
                  <label className="field-stack" key={prompt.key}>
                    <span>{prompt.prompt}</span>
                    {prompt.options && prompt.options.length > 0 ? (
                      <select
                        aria-label={`${definition.label} ${prompt.key}`}
                        className="field-control"
                        disabled={props.disabled}
                        onChange={(event) => {
                          setForms((current) => ({
                            ...current,
                            [definition.id]: {
                              ...(current[definition.id] ?? {}),
                              [prompt.key]: event.target.value,
                            },
                          }));
                        }}
                        value={forms[definition.id]?.[prompt.key] ?? ''}
                      >
                        <option value="">Select</option>
                        {prompt.options.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        aria-label={`${definition.label} ${prompt.key}`}
                        className="field-control"
                        disabled={props.disabled}
                        onChange={(event) => {
                          setForms((current) => ({
                            ...current,
                            [definition.id]: {
                              ...(current[definition.id] ?? {}),
                              [prompt.key]: event.target.value,
                            },
                          }));
                        }}
                        type="text"
                        value={forms[definition.id]?.[prompt.key] ?? ''}
                      />
                    )}
                  </label>
                ))}
              </div>
              <button
                className="button button--primary"
                disabled={props.disabled}
                onClick={() => props.onDispatch(definition.id, forms[definition.id] ?? {})}
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
              <p className="eyebrow">Runs</p>
              <h3>Tracked Agents</h3>
            </div>
          </div>
          <div className="beast-run-list">
            {props.runs.map((run) => (
              <article className={`beast-run-row ${props.selectedRunId === run.id ? 'beast-run-row--selected' : ''}`} key={run.id}>
                <button
                  className="button button--secondary button--compact"
                  onClick={() => props.onSelectRun(run.id)}
                  type="button"
                >
                  Inspect {run.id}
                </button>
                <div className="beast-run-row__summary">
                  <strong>{run.definitionId}</strong>
                  <span>{run.status}</span>
                  <small>{run.dispatchedBy} · {run.dispatchedByUser}</small>
                </div>
                <div className="beast-run-row__actions">
                  <button className="button button--secondary button--compact" onClick={() => props.onStart(run.id)} type="button">Start {run.id}</button>
                  <button className="button button--secondary button--compact" onClick={() => props.onRestart(run.id)} type="button">Restart {run.id}</button>
                  <button className="button button--secondary button--compact" onClick={() => props.onStop(run.id)} type="button">Stop {run.id}</button>
                  <button className="button button--secondary button--compact" onClick={() => props.onKill(run.id)} type="button">Kill {run.id}</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="beast-page__detail rail-card">
          <div className="rail-card__header">
            <div>
              <p className="eyebrow">Detail</p>
              <h3>{props.runDetail?.run.id ?? 'Select a run'}</h3>
            </div>
          </div>

          {props.runDetail ? (
            <div className="beast-detail">
              <p>Status: {props.runDetail.run.status}</p>
              <p>Attempts: {props.runDetail.run.attemptCount}</p>
              <section>
                <h4>Events</h4>
                <ul className="beast-detail__list">
                  {props.runDetail.events.map((event) => (
                    <li key={event.id}>{event.type}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h4>Logs</h4>
                <pre className="beast-detail__logs">{props.runDetail.logs.join('\n')}</pre>
              </section>
            </div>
          ) : (
            <p>Pick a run to inspect config, progress, and logs.</p>
          )}
        </aside>
      </div>
    </main>
  );
}
