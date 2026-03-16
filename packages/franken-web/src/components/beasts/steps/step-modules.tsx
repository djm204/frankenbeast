import * as Accordion from '@radix-ui/react-accordion';
import { useBeastStore } from '../../../stores/beast-store';
import { ProviderModelSelect, type ProviderOption } from '../shared/provider-model-select';

const FALLBACK_PROVIDERS: ProviderOption[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
    ],
  },
];

const MODULES = [
  { key: 'firewall', name: 'Firewall', description: 'LLM proxy with rule enforcement' },
  { key: 'skills', name: 'Skills', description: 'Skill registry and loading' },
  { key: 'memory', name: 'Memory', description: 'Episodic and semantic memory' },
  { key: 'planner', name: 'Planner', description: 'DAG-based task planning' },
  { key: 'critique', name: 'Critique', description: 'Self-critique loop' },
  { key: 'governor', name: 'Governor', description: 'Human-in-the-loop governance' },
  { key: 'heartbeat', name: 'Heartbeat', description: 'Periodic reflection' },
];

interface ModuleStepValues {
  [key: string]: boolean | Record<string, unknown> | undefined;
}

export function StepModules() {
  const { stepValues, setStepValues } = useBeastStore();
  const values = (stepValues[3] ?? {}) as ModuleStepValues;

  function toggleModule(key: string) {
    setStepValues(3, { ...values, [key]: !values[key] });
  }

  function updateDeepConfig(moduleKey: string, field: string, value: unknown) {
    const deepKey = `${moduleKey}Config`;
    const current = (values[deepKey] ?? {}) as Record<string, unknown>;
    setStepValues(3, { ...values, [deepKey]: { ...current, [field]: value } });
  }

  function getDeepConfig(moduleKey: string): Record<string, unknown> {
    return ((values[`${moduleKey}Config`] ?? {}) as Record<string, unknown>);
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
        <Accordion.Root type="multiple" className="mt-4 space-y-2">
          {enabledModules.map((mod) => (
            <Accordion.Item key={mod.key} value={mod.key} className="border border-beast-border rounded-xl">
              <Accordion.Header>
                <Accordion.Trigger className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-beast-text hover:text-beast-accent transition-colors group">
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
              <Accordion.Content className="px-4 pb-4 space-y-3">
                {renderModuleConfig(mod.key, getDeepConfig(mod.key), (f, v) => updateDeepConfig(mod.key, f, v))}
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      )}
    </div>
  );
}

const inputClass = 'w-full bg-beast-control border border-beast-border rounded-lg px-3 py-2 text-beast-text text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent';
const labelClass = 'block text-xs font-medium text-beast-muted mb-1';

function renderModuleConfig(
  moduleKey: string,
  config: Record<string, unknown>,
  update: (field: string, value: unknown) => void,
) {
  switch (moduleKey) {
    case 'firewall':
      return (
        <>
          <div>
            <label htmlFor={`${moduleKey}-ruleSet`} className={labelClass}>Rule Set</label>
            <select
              id={`${moduleKey}-ruleSet`}
              value={(config.ruleSet as string) ?? 'default'}
              onChange={(e) => update('ruleSet', e.target.value)}
              className={inputClass}
            >
              <option value="default">Default</option>
              <option value="strict">Strict</option>
              <option value="permissive">Permissive</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${moduleKey}-customRules`} className={labelClass}>Custom Rules</label>
            <textarea
              id={`${moduleKey}-customRules`}
              value={(config.customRules as string) ?? ''}
              onChange={(e) => update('customRules', e.target.value)}
              placeholder="One rule per line..."
              rows={3}
              className={`${inputClass} font-mono resize-y`}
            />
          </div>
        </>
      );

    case 'memory':
      return (
        <>
          <div>
            <label htmlFor={`${moduleKey}-backend`} className={labelClass}>Memory Backend</label>
            <select
              id={`${moduleKey}-backend`}
              value={(config.backend as string) ?? 'sqlite'}
              onChange={(e) => update('backend', e.target.value)}
              className={inputClass}
            >
              <option value="sqlite">SQLite</option>
              <option value="in-memory">In-Memory</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${moduleKey}-retention`} className={labelClass}>Retention Policy</label>
            <select
              id={`${moduleKey}-retention`}
              value={(config.retentionPolicy as string) ?? 'session'}
              onChange={(e) => update('retentionPolicy', e.target.value)}
              className={inputClass}
            >
              <option value="session">Session (cleared on stop)</option>
              <option value="persistent">Persistent</option>
              <option value="ttl-24h">24-hour TTL</option>
            </select>
          </div>
        </>
      );

    case 'planner':
      return (
        <>
          <div>
            <label htmlFor={`${moduleKey}-maxDepth`} className={labelClass}>Max DAG Depth</label>
            <input
              id={`${moduleKey}-maxDepth`}
              type="number"
              min={1}
              max={50}
              value={(config.maxDagDepth as number) ?? 10}
              onChange={(e) => update('maxDagDepth', Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${moduleKey}-parallelLimit`} className={labelClass}>Parallel Task Limit</label>
            <input
              id={`${moduleKey}-parallelLimit`}
              type="number"
              min={1}
              max={20}
              value={(config.parallelTaskLimit as number) ?? 4}
              onChange={(e) => update('parallelTaskLimit', Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </>
      );

    case 'critique':
      return (
        <>
          <div>
            <label htmlFor={`${moduleKey}-maxIter`} className={labelClass}>Max Iterations</label>
            <input
              id={`${moduleKey}-maxIter`}
              type="number"
              min={1}
              max={10}
              value={(config.maxIterations as number) ?? 3}
              onChange={(e) => update('maxIterations', Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${moduleKey}-severity`} className={labelClass}>Severity Threshold</label>
            <select
              id={`${moduleKey}-severity`}
              value={(config.severityThreshold as string) ?? 'medium'}
              onChange={(e) => update('severityThreshold', e.target.value)}
              className={inputClass}
            >
              <option value="low">Low (catch everything)</option>
              <option value="medium">Medium</option>
              <option value="high">High (critical only)</option>
            </select>
          </div>
        </>
      );

    case 'governor':
      return (
        <>
          <div>
            <label htmlFor={`${moduleKey}-approvalMode`} className={labelClass}>Approval Mode</label>
            <select
              id={`${moduleKey}-approvalMode`}
              value={(config.approvalMode as string) ?? 'auto'}
              onChange={(e) => update('approvalMode', e.target.value)}
              className={inputClass}
            >
              <option value="auto">Auto-approve</option>
              <option value="manual">Manual approval required</option>
              <option value="escalate">Escalate on risk</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${moduleKey}-escalation`} className={labelClass}>Escalation Rules</label>
            <textarea
              id={`${moduleKey}-escalation`}
              value={(config.escalationRules as string) ?? ''}
              onChange={(e) => update('escalationRules', e.target.value)}
              placeholder="Describe escalation conditions..."
              rows={3}
              className={`${inputClass} resize-y`}
            />
          </div>
        </>
      );

    case 'heartbeat':
      return (
        <>
          <div>
            <label htmlFor={`${moduleKey}-interval`} className={labelClass}>Reflection Interval (seconds)</label>
            <input
              id={`${moduleKey}-interval`}
              type="number"
              min={10}
              max={600}
              value={(config.reflectionInterval as number) ?? 60}
              onChange={(e) => update('reflectionInterval', Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>LLM Override</label>
            <ProviderModelSelect
              providers={FALLBACK_PROVIDERS}
              value={{
                provider: (config.llmProvider as string) ?? '',
                model: (config.llmModel as string) ?? '',
              }}
              onChange={(val) => {
                update('llmProvider', val.provider);
                update('llmModel', val.model);
              }}
            />
            <p className="text-xs text-beast-subtle mt-1">Leave blank to use agent default</p>
          </div>
        </>
      );

    case 'skills':
      return (
        <p className="text-xs text-beast-subtle">Skills module has no additional configuration. Skill selection is handled in the Skills step.</p>
      );

    default:
      return null;
  }
}
