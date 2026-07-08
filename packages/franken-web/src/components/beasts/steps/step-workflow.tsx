import { useEffect } from 'react';
import { useBeastStore } from '../../../stores/beast-store';
import { PresetCardGroup } from '../shared/preset-card';
import type { BeastContainerRuntimeStatus, BeastExecutionMode } from '../../../lib/beast-api';

const WORKFLOWS = [
  { id: 'design-interview', title: 'Design Interview', description: 'Launch interactive design session' },
  { id: 'chunk-plan', title: 'Chunk Design Doc', description: 'Break a design doc into implementation chunks' },
  { id: 'martin-loop', title: 'Run Chunked Project', description: 'Execute an already-chunked plan' },
];

interface StepWorkflowProps {
  containerRuntime?: BeastContainerRuntimeStatus;
}

const DEFAULT_CONTAINER_UNAVAILABLE_REASON = 'Container runtime availability has not been reported by the backend.';

export function StepWorkflow({ containerRuntime }: StepWorkflowProps) {
  const { stepValues, setStepValues } = useBeastStore();
  const values = (stepValues[1] ?? {}) as { workflowType?: string; executionMode?: BeastExecutionMode; [key: string]: unknown };
  const selectedExecutionMode = values.executionMode ?? 'process';
  const containerUnavailableReason = containerRuntime?.available === true
    ? null
    : (containerRuntime?.reason ?? DEFAULT_CONTAINER_UNAVAILABLE_REASON);
  const effectiveExecutionMode = selectedExecutionMode === 'container' && containerUnavailableReason
    ? 'process'
    : selectedExecutionMode;

  useEffect(() => {
    if (selectedExecutionMode === 'container' && containerUnavailableReason) {
      setStepValues(1, { ...values, executionMode: 'process' });
    }
  }, [containerUnavailableReason, selectedExecutionMode, setStepValues, values]);

  function handleSelect(id: string) {
    setStepValues(1, { ...values, workflowType: id });
  }

  function updateField(field: string, value: string) {
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
      <PresetCardGroup presets={WORKFLOWS} selected={values.workflowType ?? ''} onSelect={handleSelect} />

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

      {values.workflowType === 'design-interview' && (
        <div className="space-y-4">
          <div>
            <label htmlFor="wf-topic" className="block text-sm font-medium text-beast-text mb-1.5">Goal</label>
            <textarea
              id="wf-topic"
              value={(values.topic as string) ?? ''}
              onChange={(e) => updateField('topic', e.target.value)}
              placeholder="Describe what the design interview should produce..."
              rows={3}
              className="w-full bg-beast-control border border-beast-border rounded-lg px-4 py-2.5 text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent resize-y"
            />
          </div>
          <div>
            <label htmlFor="wf-output-path" className="block text-sm font-medium text-beast-text mb-1.5">Output Path</label>
            <input
              id="wf-output-path"
              type="text"
              value={(values.outputPath as string) ?? ''}
              onChange={(e) => updateField('outputPath', e.target.value)}
              placeholder="docs/design.md"
              className="w-full bg-beast-control border border-beast-border rounded-lg px-4 py-2.5 text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent"
            />
          </div>
        </div>
      )}

      {values.workflowType === 'chunk-plan' && (
        <div className="space-y-4">
          <div>
            <label htmlFor="wf-file" className="block text-sm font-medium text-beast-text mb-1.5">Design Doc Path</label>
            <input
              id="wf-file"
              type="text"
              value={(values.docPath as string) ?? ''}
              onChange={(e) => updateField('docPath', e.target.value)}
              placeholder="docs/design-doc.md"
              className="w-full bg-beast-control border border-beast-border rounded-lg px-4 py-2.5 text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent"
            />
            <p className="mt-1 text-xs text-beast-muted">Use a repo-relative Markdown path; absolute paths and ../ traversal are rejected.</p>
          </div>
          <div>
            <label htmlFor="wf-output-dir" className="block text-sm font-medium text-beast-text mb-1.5">Output Directory</label>
            <input
              id="wf-output-dir"
              type="text"
              value={(values.outputDir as string) ?? ''}
              onChange={(e) => updateField('outputDir', e.target.value)}
              placeholder="/path/to/chunks"
              className="w-full bg-beast-control border border-beast-border rounded-lg px-4 py-2.5 text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent"
            />
          </div>
        </div>
      )}

      {values.workflowType === 'martin-loop' && (
        <div className="space-y-4">
          <div>
            <label htmlFor="wf-provider" className="block text-sm font-medium text-beast-text mb-1.5">Provider</label>
            <select
              id="wf-provider"
              value={(values.provider as string) ?? ''}
              onChange={(e) => updateField('provider', e.target.value)}
              className="w-full bg-beast-control border border-beast-border rounded-lg px-4 py-2.5 text-beast-text text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent"
            >
              <option value="">Select provider...</option>
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
              <option value="gemini">Gemini</option>
              <option value="aider">Aider</option>
            </select>
          </div>
          <div>
            <label htmlFor="wf-objective" className="block text-sm font-medium text-beast-text mb-1.5">Objective</label>
            <input
              id="wf-objective"
              type="text"
              value={(values.objective as string) ?? ''}
              onChange={(e) => updateField('objective', e.target.value)}
              placeholder="Describe what the Martin Loop should accomplish..."
              className="w-full bg-beast-control border border-beast-border rounded-lg px-4 py-2.5 text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent"
            />
          </div>
          <div>
            <label htmlFor="wf-dir" className="block text-sm font-medium text-beast-text mb-1.5">Chunk Directory Path</label>
            <input
              id="wf-dir"
              type="text"
              value={(values.chunkDir as string) ?? ''}
              onChange={(e) => updateField('chunkDir', e.target.value)}
              placeholder="/path/to/chunks/"
              className="w-full bg-beast-control border border-beast-border rounded-lg px-4 py-2.5 text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent"
            />
          </div>
        </div>
      )}
    </div>
  );
}
