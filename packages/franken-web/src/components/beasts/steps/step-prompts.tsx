import { useBeastStore } from '../../../stores/beast-store';
import { FilePicker, type PickedFile } from '../shared/file-picker';

export function StepPrompts() {
  const { stepValues, setStepValues } = useBeastStore();
  const values = (stepValues[5] ?? {}) as { promptText?: string; files?: PickedFile[] };

  function updateField(field: string, value: unknown) {
    setStepValues(5, { ...values, [field]: value });
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <label htmlFor="prompt-text" className="block text-sm font-medium text-beast-text mb-1.5">Prompt Text</label>
        <p className="text-xs text-beast-subtle mb-2">Text injected into the agent's context before it starts working.</p>
        <textarea
          id="prompt-text"
          value={values.promptText ?? ''}
          onChange={(e) => updateField('promptText', e.target.value)}
          placeholder="Enter any text to frontload into the agent's context..."
          rows={8}
          className="w-full bg-beast-control border border-beast-border rounded-lg px-3 py-2.5
            text-beast-text placeholder:text-beast-subtle text-sm font-mono focus:outline-none
            focus:ring-2 focus:ring-beast-accent resize-y"
        />
      </div>

      <div>
        <h3 className="text-sm font-medium text-beast-text mb-1.5">Files</h3>
        <p className="text-xs text-beast-subtle mb-3">Attach files to include in the agent's initial context.</p>
        <FilePicker
          files={values.files ?? []}
          onFilesChange={(files) => updateField('files', files)}
          onRemoveFile={(i) => {
            const files = [...(values.files ?? [])];
            files.splice(i, 1);
            updateField('files', files);
          }}
        />
      </div>
    </div>
  );
}
