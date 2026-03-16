import * as Accordion from '@radix-ui/react-accordion';
import { useBeastStore } from '../../../stores/beast-store';
import { GapBanner } from '../shared/gap-banner';

const MODULES = [
  { key: 'firewall', name: 'Firewall', description: 'LLM proxy with rule enforcement' },
  { key: 'skills', name: 'Skills', description: 'Skill registry and loading' },
  { key: 'memory', name: 'Memory', description: 'Episodic and semantic memory' },
  { key: 'planner', name: 'Planner', description: 'DAG-based task planning' },
  { key: 'critique', name: 'Critique', description: 'Self-critique loop' },
  { key: 'governor', name: 'Governor', description: 'Human-in-the-loop governance' },
  { key: 'heartbeat', name: 'Heartbeat', description: 'Periodic reflection' },
];

export function StepModules() {
  const { stepValues, setStepValues } = useBeastStore();
  const values = (stepValues[3] ?? {}) as Record<string, boolean>;

  function toggleModule(key: string) {
    setStepValues(3, { ...values, [key]: !values[key] });
  }

  const enabledModules = MODULES.filter((m) => values[m.key]);

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {MODULES.map((mod) => (
          <button
            key={mod.key}
            type="button"
            onClick={() => toggleModule(mod.key)}
            className={`p-3 rounded-xl border-2 text-left transition-colors
              ${values[mod.key]
                ? 'border-beast-accent bg-beast-accent-soft'
                : 'border-beast-border bg-beast-panel hover:bg-beast-elevated'
              }`}
          >
            <h3 className="text-sm font-medium text-beast-text">{mod.name}</h3>
            <p className="text-xs text-beast-subtle mt-0.5">{mod.description}</p>
          </button>
        ))}
      </div>

      {enabledModules.length > 0 && (
        <Accordion.Root type="multiple" className="mt-4">
          {enabledModules.map((mod) => (
            <Accordion.Item key={mod.key} value={mod.key} className="border-b border-beast-border">
              <Accordion.Header>
                <Accordion.Trigger className="flex items-center justify-between w-full py-3 text-sm font-medium text-beast-text hover:text-beast-accent transition-colors group">
                  <span>{mod.name} Configuration</span>
                  <svg
                    className="w-4 h-4 text-beast-subtle transition-transform group-data-[state=open]:rotate-180"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="pb-4">
                <GapBanner message={`Deep configuration for ${mod.name} stored but not yet applied by backend.`} />
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      )}
    </div>
  );
}
