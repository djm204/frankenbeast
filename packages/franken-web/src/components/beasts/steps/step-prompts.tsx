import { useBeastStore } from '../../../stores/beast-store';
import { FilePicker, type PickedFile } from '../shared/file-picker';

export function StepPrompts() {
  const { stepValues, setStepValues } = useBeastStore();
  const values = (stepValues[5] ?? {}) as { promptText?: string; files?: PickedFile[] };

  function updateField(field: string, value: unknown) {
    setStepValues(5, { ...values, [field]: value });
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <label htmlFor="prompt-text" className="block text-sm font-medium text-beast-text mb-1">Prompt Text</label>
        <textarea
          id="prompt-text"
          value={values.promptText ?? ''}
          onChange={(e) => updateField('promptText', e.target.value)}
          placeholder="Enter any text to frontload into the agent's context..."
          rows={6}
          className="w-full bg-beast-control border border-beast-border rounded-lg px-3 py-2
            text-beast-text placeholder:text-beast-subtle text-sm font-mono focus:outline-none
            focus:ring-2 focus:ring-beast-accent resize-y"
        />
      </div>

      <div>
        <h3 className="text-sm font-medium text-beast-text mb-2">Files</h3>
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
