import { useBeastStore } from '../../../stores/beast-store';
import { PresetCardGroup } from '../shared/preset-card';

const WORKFLOWS = [
  { id: 'design-interview', title: 'Design Interview', description: 'Launch interactive design session' },
  { id: 'chunk-plan', title: 'Chunk Design Doc', description: 'Break a design doc into implementation chunks' },
  { id: 'issues-agent', title: 'Issues Agent', description: 'Work through issues/tickets' },
  { id: 'martin-loop', title: 'Run Chunked Project', description: 'Execute an already-chunked plan' },
];

export function StepWorkflow() {
  const { stepValues, setStepValues } = useBeastStore();
  const values = (stepValues[1] ?? {}) as { workflowType?: string; [key: string]: unknown };

  function handleSelect(id: string) {
    setStepValues(1, { ...values, workflowType: id });
  }

  function updateField(field: string, value: string) {
    setStepValues(1, { ...values, [field]: value });
  }

  return (
    <div className="p-6 space-y-4">
      <PresetCardGroup presets={WORKFLOWS} selected={values.workflowType ?? ''} onSelect={handleSelect} />

      {values.workflowType === 'design-interview' && (
        <div>
          <label htmlFor="wf-topic" className="block text-sm font-medium text-beast-text mb-1">Topic / Context</label>
          <textarea
            id="wf-topic"
            value={(values.topic as string) ?? ''}
            onChange={(e) => updateField('topic', e.target.value)}
            placeholder="Describe the topic or context for the design interview..."
            rows={3}
            className="w-full bg-beast-control border border-beast-border rounded-lg px-3 py-2 text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent resize-y"
          />
        </div>
      )}

      {values.workflowType === 'chunk-plan' && (
        <div>
          <label htmlFor="wf-file" className="block text-sm font-medium text-beast-text mb-1">Design Doc Path</label>
          <input
            id="wf-file"
            type="text"
            value={(values.docPath as string) ?? ''}
            onChange={(e) => updateField('docPath', e.target.value)}
            placeholder="/path/to/design-doc.md"
            className="w-full bg-beast-control border border-beast-border rounded-lg px-3 py-2 text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent"
          />
        </div>
      )}

      {values.workflowType === 'issues-agent' && (
        <div className="space-y-2">
          <div>
            <label htmlFor="wf-repo" className="block text-sm font-medium text-beast-text mb-1">Repository URL</label>
            <input
              id="wf-repo"
              type="text"
              value={(values.repoUrl as string) ?? ''}
              onChange={(e) => updateField('repoUrl', e.target.value)}
              placeholder="https://github.com/org/repo"
              className="w-full bg-beast-control border border-beast-border rounded-lg px-3 py-2 text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent"
            />
          </div>
          <div>
            <label htmlFor="wf-labels" className="block text-sm font-medium text-beast-text mb-1">Label Filters</label>
            <input
              id="wf-labels"
              type="text"
              value={(values.labelFilters as string) ?? ''}
              onChange={(e) => updateField('labelFilters', e.target.value)}
              placeholder="bug, enhancement"
              className="w-full bg-beast-control border border-beast-border rounded-lg px-3 py-2 text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent"
            />
          </div>
        </div>
      )}

      {values.workflowType === 'martin-loop' && (
        <div>
          <label htmlFor="wf-dir" className="block text-sm font-medium text-beast-text mb-1">Chunk Directory Path</label>
          <input
            id="wf-dir"
            type="text"
            value={(values.chunkDir as string) ?? ''}
            onChange={(e) => updateField('chunkDir', e.target.value)}
            placeholder="/path/to/chunks/"
            className="w-full bg-beast-control border border-beast-border rounded-lg px-3 py-2 text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent"
          />
        </div>
      )}
    </div>
  );
}
