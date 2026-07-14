import { useEffect } from 'react';
import { useBeastStore } from '../../../stores/beast-store';
import { PresetCardGroup } from '../shared/preset-card';
import type { BeastCatalogEntry, BeastContainerRuntimeStatus, BeastExecutionMode, BeastInterviewPrompt } from '../../../lib/beast-api';
import { getEffectiveCatalog, getPromptLabel, getPromptValue } from '../wizard-catalog';

interface StepWorkflowProps {
  catalog?: readonly BeastCatalogEntry[];
  containerRuntime?: BeastContainerRuntimeStatus;
}

const DEFAULT_CONTAINER_UNAVAILABLE_REASON = 'Container runtime availability has not been reported by the backend.';

function isContainerRuntimeUnavailable(status: BeastContainerRuntimeStatus | undefined): boolean {
  return status?.available === false;
}

export function StepWorkflow({ catalog, containerRuntime }: StepWorkflowProps) {
  const { stepValues, setStepValues } = useBeastStore();
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
        <div className="space-y-4">
          {selectedWorkflow.interviewPrompts.map((prompt) => (
            <CatalogPromptField
              key={prompt.key}
              prompt={prompt}
              value={getPromptValue(values, prompt)}
              onChange={(value) => updateField(prompt.key, value)}
            />
          ))}
        </div>
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
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-beast-control border border-beast-border rounded-lg px-4 py-2.5 text-beast-text text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent"
        >
          <option value="">Select...</option>
          {prompt.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
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
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full bg-beast-control border border-beast-border rounded-lg px-4 py-2.5 text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent resize-y"
        />
      ) : (
        <input
          id={id}
          type={inputType ?? 'text'}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full bg-beast-control border border-beast-border rounded-lg px-4 py-2.5 text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent"
        />
      )}
      {prompt.kind === 'file' && (
        <p className="mt-1 text-xs text-beast-muted">Use a repo-relative Markdown path when required by the selected Beast.</p>
      )}
      {prompt.kind === 'directory' && (
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
