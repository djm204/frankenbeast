import { useBeastStore } from '../../../stores/beast-store';

export function StepIdentity() {
  const { stepValues, setStepValues } = useBeastStore();
  const values = (stepValues[0] ?? {}) as { name?: string; description?: string };

  function updateField(field: string, value: string) {
    setStepValues(0, { ...values, [field]: value });
  }

  return (
    <div className="p-6 space-y-4 max-w-lg">
      <div>
        <label htmlFor="agent-name" className="block text-sm font-medium text-beast-text mb-1">
          Agent Name <span className="text-beast-danger">*</span>
        </label>
        <input
          id="agent-name"
          type="text"
          value={values.name ?? ''}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder="Enter agent name..."
          className="w-full bg-beast-control border border-beast-border rounded-lg px-3 py-2
            text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none
            focus:ring-2 focus:ring-beast-accent"
        />
      </div>
      <div>
        <label htmlFor="agent-desc" className="block text-sm font-medium text-beast-text mb-1">
          Description
        </label>
        <textarea
          id="agent-desc"
          value={values.description ?? ''}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="Optional description..."
          rows={3}
          className="w-full bg-beast-control border border-beast-border rounded-lg px-3 py-2
            text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none
            focus:ring-2 focus:ring-beast-accent resize-y"
        />
      </div>
    </div>
  );
}
