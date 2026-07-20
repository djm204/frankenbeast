import { useEffect } from 'react';
import { useBeastStore } from '../../../stores/beast-store';
import { PresetCardGroup } from '../shared/preset-card';
import type { BeastCatalogEntry, BeastContainerRuntimeStatus, BeastExecutionMode, BeastInterviewPrompt } from '../../../lib/beast-api';
import { getEffectiveCatalog, getPromptLabel, getPromptValue } from '../wizard-catalog';

interface StepWorkflowProps {
  catalog?: readonly BeastCatalogEntry[] | undefined;
  containerRuntime?: BeastContainerRuntimeStatus | undefined;
}

const DEFAULT_CONTAINER_UNAVAILABLE_REASON = 'Container runtime availability has not been reported by the backend.';

function isContainerRuntimeUnavailable(status: BeastContainerRuntimeStatus | undefined): boolean {
  return status?.available === false;
}

export function StepWorkflow({ catalog, containerRuntime }: StepWorkflowProps) {
  const { stepValues, setStepValues, wizardMode } = useBeastStore();
  const values = (stepValues[1] ?? {}) as { workflowType?: string; executionMode?: BeastExecutionMode; [key: string]: unknown };
  const workflows = getEffectiveCatalog(catalog);
  const selectedWorkflow = workflows.find((entry) => entry.id === values.workflowType);
  const selectedExecutionMode = values.executionMode ?? selectedWorkflow?.executionModeDefault ?? 'process';
  const containerStatus = selectedWorkflow?.containerRuntime ?? containerRuntime;
  const containerUnavailableReason = containerStatus?.available === true
    ? null
    : (containerStatus?.reason ?? DEFAULT_CONTAINER_UNAVAILABLE_REASON);
  const effectiveExecutionMode = selectedExecutionMode === 'container' && containerUnavailableReason
    ? 'process'
    : selectedExecutionMode;

  useEffect(() => {
    if (selectedExecutionMode === 'container' && containerUnavailableReason) {
      setStepValues(1, { ...values, executionMode: 'process' });
    }
  }, [containerUnavailableReason, selectedExecutionMode, setStepValues, values]);

  function handleSelect(id: string) {
    if (id === values.workflowType) {
      setStepValues(1, { ...values, workflowType: id });
      return;
    }

    const nextWorkflow = workflows.find((entry) => entry.id === id);
    const requestedExecutionMode = values.executionMode ?? nextWorkflow?.executionModeDefault;
    const executionMode = requestedExecutionMode === 'container' && isContainerRuntimeUnavailable(nextWorkflow?.containerRuntime ?? containerRuntime)
      ? 'process'
      : requestedExecutionMode;
    setStepValues(1, { workflowType: id, ...(executionMode ? { executionMode } : {}) });
  }

  function updateField(field: string, value: string | boolean) {
    setStepValues(1, { ...values, [field]: value });
  }

  function updateExecutionMode(executionMode: BeastExecutionMode) {
    if (executionMode === 'container' && containerUnavailableReason) {
      return;
    }
    setStepValues(1, { ...values, executionMode });
  }

  return (
    <div className="p-8 space-y-6">
      <PresetCardGroup
        presets={workflows.map((entry) => ({ id: entry.id, title: entry.label, description: entry.description }))}
        selected={values.workflowType ?? ''}
        onSelect={handleSelect}
      />

      <fieldset className="space-y-3 rounded-xl border border-beast-border bg-beast-panel p-4">
        <legend className="px-1 text-sm font-medium text-beast-text">Execution mode</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <label className={`rounded-lg border p-4 transition-colors ${effectiveExecutionMode === 'process' ? 'border-beast-accent bg-beast-accent-soft' : 'border-beast-border bg-beast-control'}`}>
            <input
              aria-label="Process execution mode"
              checked={effectiveExecutionMode === 'process'}
              className="sr-only"
              name="execution-mode"
              onChange={() => updateExecutionMode('process')}
              type="radio"
              value="process"
            />
            <span className="block text-sm font-semibold text-beast-text">Process</span>
            <span className="mt-1 block text-xs text-beast-muted">Run as a local supervised process.</span>
          </label>
          <label
            className={`rounded-lg border p-4 transition-colors ${containerUnavailableReason ? 'cursor-not-allowed border-beast-border bg-beast-control opacity-60' : effectiveExecutionMode === 'container' ? 'border-beast-accent bg-beast-accent-soft' : 'border-beast-border bg-beast-control'}`}
            title={containerUnavailableReason ?? 'Run inside the configured container sandbox.'}
          >
            <input
              aria-describedby={containerUnavailableReason ? 'container-mode-disabled-reason' : undefined}
              aria-label="Container execution mode"
              checked={effectiveExecutionMode === 'container'}
              className="sr-only"
              disabled={Boolean(containerUnavailableReason)}
              name="execution-mode"
              onChange={() => updateExecutionMode('container')}
              type="radio"
              value="container"
            />
            <span className="block text-sm font-semibold text-beast-text">Container</span>
            <span className="mt-1 block text-xs text-beast-muted">Run inside the configured container sandbox.</span>
          </label>
        </div>
        {containerUnavailableReason && (
          <p id="container-mode-disabled-reason" className="text-xs text-beast-muted">
            Container mode unavailable: {containerUnavailableReason}
          </p>
        )}
      </fieldset>

      {selectedWorkflow && (
        <InterviewTranscript
          prompts={selectedWorkflow.interviewPrompts}
          getValue={(prompt) => getPromptValue(values, prompt)}
          onChange={(key, value) => updateField(key, value)}
          sequentialReveal={wizardMode === 'wizard'}
        />
      )}
    </div>
  );
}

function isPromptAnswered(prompt: BeastInterviewPrompt, value: unknown): boolean {
  if (prompt.kind === 'boolean') {
    // Wizard validation treats an untouched required checkbox as missing
    // (isBlankCatalogValue(undefined)), so only a real boolean counts.
    return !prompt.required || typeof value === 'boolean';
  }
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Interview prompts presented as a conversational transcript: each question is
 * an interviewer turn, and the next question is revealed once the previous
 * required one is answered. Earlier answers stay rendered and editable, so the
 * underlying labeled controls (and wizard validation) are unchanged.
 */
function InterviewTranscript({
  prompts,
  getValue,
  onChange,
  sequentialReveal,
}: {
  prompts: readonly BeastInterviewPrompt[];
  getValue: (prompt: BeastInterviewPrompt) => unknown;
  onChange: (key: string, value: string | boolean) => void;
  /** Form view renders every prompt at once; only wizard mode reveals turns. */
  sequentialReveal: boolean;
}) {
  const firstBlocking = sequentialReveal
    ? prompts.findIndex((prompt) => prompt.required && !isPromptAnswered(prompt, getValue(prompt)))
    : -1;
  const visible = firstBlocking === -1 ? prompts : prompts.slice(0, firstBlocking + 1);
  const remaining = prompts.length - visible.length;

  return (
    <div className="interview-transcript" role="group" aria-label="Beast interview">
      {visible.map((prompt, index) => {
        const value = getValue(prompt);
        const answered = isPromptAnswered(prompt, value) && (index < visible.length - 1 || firstBlocking === -1);
        return (
          <div
            key={prompt.key}
            className={`interview-turn ${answered ? 'interview-turn--answered' : 'interview-turn--active'}`}
            data-step={`${index + 1}/${prompts.length}`}
          >
            <CatalogPromptField
              prompt={prompt}
              value={value}
              onChange={(next) => onChange(prompt.key, next)}
            />
          </div>
        );
      })}
      {remaining > 0 && (
        <p className="interview-transcript__pending">
          {remaining} more question{remaining === 1 ? '' : 's'} after this one
        </p>
      )}
    </div>
  );
}

function CatalogPromptField({
  prompt,
  value,
  onChange,
}: {
  prompt: BeastInterviewPrompt;
  value: unknown;
  onChange: (value: string | boolean) => void;
}) {
  const label = getPromptLabel(prompt);
  const id = `wf-${prompt.key}`;
  const descriptionId = prompt.description ? `${id}-description` : undefined;

  if (prompt.kind === 'boolean') {
    return (
      <label className="flex items-center gap-3 rounded-lg border border-beast-border bg-beast-control px-4 py-3 text-sm text-beast-text">
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 rounded border-beast-border bg-beast-panel text-beast-accent focus:ring-beast-accent"
        />
        <span>{label}{prompt.required ? ' *' : ''}</span>
      </label>
    );
  }

  if (prompt.options?.length) {
    return (
      <div>
        <label htmlFor={id} className="block text-sm font-medium text-beast-text mb-1.5">{label}{prompt.required ? ' *' : ''}</label>
        <select
          id={id}
          aria-describedby={descriptionId}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-beast-control border border-beast-border rounded-lg px-4 py-2.5 text-beast-text text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent"
        >
          <option value="">Select...</option>
          {prompt.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        {prompt.description && (
          <p id={descriptionId} className="mt-1 text-xs text-beast-muted">{prompt.description}</p>
        )}
      </div>
    );
  }

  const placeholder = buildPlaceholder(prompt);
  const inputType = prompt.kind === 'file' || prompt.kind === 'directory' ? 'text' : undefined;
  const rows = prompt.kind === 'string' && !isSingleLinePathPrompt(prompt) ? 3 : undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-beast-text mb-1.5">{label}{prompt.required ? ' *' : ''}</label>
      {rows ? (
        <textarea
          id={id}
          aria-describedby={descriptionId}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full bg-beast-control border border-beast-border rounded-lg px-4 py-2.5 text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent resize-y"
        />
      ) : (
        <input
          id={id}
          aria-describedby={descriptionId}
          type={inputType ?? 'text'}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full bg-beast-control border border-beast-border rounded-lg px-4 py-2.5 text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent"
        />
      )}
      {prompt.description && (
        <p id={descriptionId} className="mt-1 text-xs text-beast-muted">{prompt.description}</p>
      )}
      {!prompt.description && prompt.kind === 'file' && (
        <p className="mt-1 text-xs text-beast-muted">Use a repo-relative Markdown path when required by the selected Beast.</p>
      )}
      {!prompt.description && prompt.kind === 'directory' && (
        <p className="mt-1 text-xs text-beast-muted">
          Browser directory pickers cannot provide server paths. Enter a repo-relative directory path manually.
        </p>
      )}
    </div>
  );
}

function isSingleLinePathPrompt(prompt: BeastInterviewPrompt): boolean {
  const key = prompt.key.toLowerCase();
  return prompt.kind === 'file' || prompt.kind === 'directory' || key.includes('path') || key.includes('dir') || key.includes('directory');
}

function buildPlaceholder(prompt: BeastInterviewPrompt): string {
  if (prompt.key === 'goal') return 'Describe what the design interview should produce...';
  if (prompt.key === 'outputPath') return 'docs/design.md';
  if (prompt.key === 'designDocPath') return 'docs/design-doc.md';
  if (prompt.key === 'outputDir') return 'tasks/chunks';
  if (prompt.key === 'chunkDirectory') return 'tasks/chunks/';
  return prompt.prompt;
}
