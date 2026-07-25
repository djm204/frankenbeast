import { useEffect, useRef, useState, type FormEvent } from 'react';
import type {
  DashboardApiClient,
  DashboardBrainFacultyName,
  DashboardBrainLessons,
  DashboardBrainState,
} from '../../lib/dashboard-api';

interface BrainPanelProps {
  client: DashboardApiClient;
}

const FACULTY_LABELS: Record<DashboardBrainFacultyName, string> = {
  planning: 'Planning',
  reasoning: 'Reasoning',
  action: 'Action',
  learning: 'Learning',
};

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function facultyStatus(configured: boolean): string {
  return configured ? '[configured]' : '[not configured]';
}

export function BrainPanel({ client }: BrainPanelProps) {
  const requestSequenceRef = useRef(0);
  const lessonRequestSequenceRef = useRef(0);
  const [agentTypeInput, setAgentTypeInput] = useState('');
  const [selectedAgentType, setSelectedAgentType] = useState<string | null>(null);
  const [brain, setBrain] = useState<DashboardBrainState | null>(null);
  const [lessons, setLessons] = useState<DashboardBrainLessons | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lessonQuery, setLessonQuery] = useState('');
  const [searchedLessonQuery, setSearchedLessonQuery] = useState<string | null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [lessonError, setLessonError] = useState<string | null>(null);

  useEffect(() => () => {
    requestSequenceRef.current += 1;
    lessonRequestSequenceRef.current += 1;
  }, []);

  async function loadBrain(agentType: string): Promise<void> {
    const sequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = sequence;
    const lessonSequence = lessonRequestSequenceRef.current + 1;
    lessonRequestSequenceRef.current = lessonSequence;
    setSelectedAgentType(agentType);
    setBrain(null);
    setLessons(null);
    setLessonQuery('');
    setSearchedLessonQuery(null);
    setLessonError(null);
    setLessonLoading(false);
    setError(null);
    setLoading(true);

    try {
      const nextBrain = await client.fetchBrainState(agentType);
      if (requestSequenceRef.current !== sequence) return;
      setBrain(nextBrain);
      setLoading(false);
      setLessonLoading(true);
      try {
        const nextLessons = await client.fetchBrainLessons(agentType, undefined, 5);
        if (requestSequenceRef.current !== sequence || lessonRequestSequenceRef.current !== lessonSequence) return;
        setLessons(nextLessons);
      } catch (loadError) {
        if (requestSequenceRef.current !== sequence || lessonRequestSequenceRef.current !== lessonSequence) return;
        setLessonError(`Unable to load lessons for ${agentType}. ${describeError(loadError)}`);
      } finally {
        if (requestSequenceRef.current === sequence && lessonRequestSequenceRef.current === lessonSequence) {
          setLessonLoading(false);
        }
      }
    } catch (loadError) {
      if (requestSequenceRef.current !== sequence) return;
      setError(`Unable to load Brain state for ${agentType}. ${describeError(loadError)}`);
    } finally {
      if (requestSequenceRef.current === sequence) setLoading(false);
    }
  }

  function handleAgentTypeSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const agentType = agentTypeInput.trim();
    if (!agentType) return;
    void loadBrain(agentType);
  }

  async function searchLessons(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedAgentType || !lessons?.meta.available) return;
    const query = lessonQuery.trim();
    if (!query) return;
    const sequence = lessonRequestSequenceRef.current + 1;
    lessonRequestSequenceRef.current = sequence;
    setLessonLoading(true);
    setLessonError(null);
    setSearchedLessonQuery(query);
    setLessons((current) => current ? { ...current, data: [] } : current);

    try {
      const nextLessons = await client.fetchBrainLessons(selectedAgentType, query, 5);
      if (lessonRequestSequenceRef.current !== sequence) return;
      setLessons(nextLessons);
    } catch (searchError) {
      if (lessonRequestSequenceRef.current !== sequence) return;
      setLessonError(`Unable to search lessons for ${selectedAgentType}. ${describeError(searchError)}`);
    } finally {
      if (lessonRequestSequenceRef.current === sequence) setLessonLoading(false);
    }
  }

  const regionLabel = brain
    ? `Brain faculties for ${brain.agentTypeId}`
    : 'Brain faculties';
  const lessonAvailable = lessons?.meta.available === true;

  return (
    <section className="brain-panel rail-card" role="region" aria-label={regionLabel}>
      <h3>Brain</h3>
      <form
        className="brain-panel__selector"
        aria-label="Select Brain agent type"
        onSubmit={handleAgentTypeSubmit}
      >
        <label htmlFor="brain-agent-type">Agent type</label>
        <div className="brain-panel__form-row">
          <input
            id="brain-agent-type"
            className="field-control"
            value={agentTypeInput}
            onChange={(event) => setAgentTypeInput(event.target.value)}
            placeholder="for example, reviewer"
            autoComplete="off"
          />
          <button
            className="button button--primary button--compact"
            type="submit"
            disabled={!agentTypeInput.trim() || loading}
          >
            Inspect Brain
          </button>
        </div>
      </form>

      {!selectedAgentType && (
        <p className="rail-card__empty">Enter an agent type to inspect its persisted Brain state.</p>
      )}

      {loading && selectedAgentType && (
        <p className="brain-panel__status" role="status" aria-live="polite">
          Loading Brain state for {selectedAgentType}...
        </p>
      )}

      {error && selectedAgentType && (
        <div className="brain-panel__alert" role="alert">
          <span>{error}</span>
          <button
            className="button button--secondary button--small"
            type="button"
            onClick={() => void loadBrain(selectedAgentType)}
          >
            Retry {selectedAgentType}
          </button>
        </div>
      )}

      {brain && (
        <div className="brain-panel__content">
          <div className="brain-panel__faculties" aria-label="Faculty state">
            <article className="brain-panel__faculty">
              <h4>Memory</h4>
              <strong>[available]</strong>
              <ul>
                <li>{brain.workingMemory.total} persisted {brain.workingMemory.total === 1 ? 'key' : 'keys'}{brain.workingMemory.truncated ? ' (list truncated)' : ''}</li>
                <li>{brain.episodic.eventCount} episodic {brain.episodic.eventCount === 1 ? 'event' : 'events'}</li>
                <li>Checkpoint: {brain.recovery.lastCheckpointAt ?? 'none'}</li>
              </ul>
            </article>
            {(Object.keys(FACULTY_LABELS) as DashboardBrainFacultyName[]).map((faculty) => (
              <article className="brain-panel__faculty" key={faculty}>
                <h4>{FACULTY_LABELS[faculty]}</h4>
                <strong>{facultyStatus(brain.faculties[faculty].configured)}</strong>
              </article>
            ))}
          </div>

          <section className="brain-panel__lessons" aria-labelledby="brain-lessons-heading">
            <div className="brain-panel__lessons-heading">
              <h4 id="brain-lessons-heading">Lessons</h4>
              <span>{lessons ? (lessonAvailable ? '[available]' : '[unavailable]') : '[unknown]'}</span>
            </div>
            {lessonLoading && !lessons && (
              <p role="status" aria-live="polite">Loading lesson availability...</p>
            )}
            {lessons && (
              <form className="brain-panel__lesson-search" aria-label="Search Brain lessons" onSubmit={(event) => void searchLessons(event)}>
                <label htmlFor="brain-lesson-topic">Lesson topic</label>
                <div className="brain-panel__form-row">
                  <input
                    id="brain-lesson-topic"
                    className="field-control"
                    value={lessonQuery}
                    onChange={(event) => setLessonQuery(event.target.value)}
                    placeholder="for example, workspace build"
                    maxLength={256}
                    disabled={!lessonAvailable}
                  />
                  <button
                    className="button button--secondary button--compact"
                    type="submit"
                    disabled={!lessonAvailable || !lessonQuery.trim() || lessonLoading}
                  >
                    Search lessons
                  </button>
                </div>
              </form>
            )}
            {lessonError && !lessons && <p className="brain-panel__alert" role="alert">{lessonError}</p>}
            {lessons && !lessonAvailable && (
              <p className="rail-card__empty">
                {lessons.meta.reason ?? 'Consolidated lessons are not available for this agent type.'}
              </p>
            )}
            {lessons && lessonAvailable && (
              <>
                {lessonLoading && (
                  <p role="status" aria-live="polite">
                    {searchedLessonQuery ? 'Searching lessons...' : 'Loading lesson availability...'}
                  </p>
                )}
                {lessonError && <p className="brain-panel__alert" role="alert">{lessonError}</p>}
                {!searchedLessonQuery && lessons.data.length === 0 && (
                  <p className="rail-card__empty">
                    The Brain API does not expose an unfiltered recent lesson feed. Search by topic to retrieve relevant persisted lessons.
                  </p>
                )}
                {searchedLessonQuery && !lessonLoading && !lessonError && lessons.data.length === 0 && (
                  <p className="rail-card__empty">No lessons matched “{searchedLessonQuery}”.</p>
                )}
                {lessons.data.length > 0 && (
                  <ol className="brain-panel__lesson-list" aria-label={`Lessons matching ${searchedLessonQuery ?? 'the selected topic'}`}>
                    {lessons.data.map((lesson) => (
                      <li key={lesson.key}>
                        <p>{lesson.pattern}</p>
                        <small>
                          {lesson.status} · {lesson.occurrenceCount} occurrences · {Math.round(lesson.confidence * 100)}% confidence · last seen {lesson.lastSeenAt}
                        </small>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
