import { useBeastStore } from '../../../stores/beast-store';
import { PresetCardGroup } from '../shared/preset-card';
import * as Accordion from '@radix-ui/react-accordion';

const GIT_PRESETS = {
  'one-shot': { baseBranch: 'main', branchPattern: '', prCreation: false, commitConvention: 'conventional', mergeStrategy: 'merge' },
  'feature-branch': { baseBranch: 'main', branchPattern: 'feat/{agent-name}/{id}', prCreation: true, commitConvention: 'conventional', mergeStrategy: 'squash' },
  'feature-branch-worktree': { baseBranch: 'main', branchPattern: 'feat/{agent-name}/{id}', prCreation: true, commitConvention: 'conventional', mergeStrategy: 'squash' },
  'yolo-main': { baseBranch: 'main', branchPattern: '', prCreation: false, commitConvention: 'freeform', mergeStrategy: 'merge' },
  'custom': { baseBranch: '', branchPattern: '', prCreation: false, commitConvention: 'conventional', mergeStrategy: 'merge' },
} as const;

const PRESET_CARDS = [
  { id: 'one-shot', title: 'One-shot', description: 'Direct commit to target branch, no PR' },
  { id: 'feature-branch', title: 'Feature Branch', description: 'Create branch, commit, open PR' },
  { id: 'feature-branch-worktree', title: 'Feature + Worktree', description: 'Isolated git worktree, branch, PR' },
  { id: 'yolo-main', title: 'YOLO on Main', description: 'Commit directly to main, no branch' },
  { id: 'custom', title: 'Custom', description: 'Configure all settings manually' },
];

export function StepGit() {
  const { stepValues, setStepValues } = useBeastStore();
  const values = (stepValues[6] ?? {}) as {
    preset?: string;
    baseBranch?: string;
    branchPattern?: string;
    prCreation?: boolean;
    commitConvention?: string;
    mergeStrategy?: string;
  };

  function handlePresetSelect(presetId: string) {
    const defaults = GIT_PRESETS[presetId as keyof typeof GIT_PRESETS];
    setStepValues(6, { preset: presetId, ...defaults });
  }

  function updateField(field: string, value: unknown) {
    setStepValues(6, { ...values, [field]: value });
  }

  return (
    <div className="p-6 space-y-4">
      <PresetCardGroup presets={PRESET_CARDS} selected={values.preset ?? ''} onSelect={handlePresetSelect} />

      {values.preset && (
        <Accordion.Root type="multiple" defaultValue={['overrides']}>
          <Accordion.Item value="overrides" className="border border-beast-border rounded-xl">
            <Accordion.Header>
              <Accordion.Trigger className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-beast-text hover:text-beast-accent transition-colors group">
                <span>Override Settings</span>
                <svg className="w-4 h-4 text-beast-subtle transition-transform group-data-[state=open]:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="px-4 pb-4 space-y-3">
              <div>
                <label htmlFor="git-base" className="block text-xs font-medium text-beast-muted mb-1">Base Branch</label>
                <input
                  id="git-base"
                  type="text"
                  value={values.baseBranch ?? ''}
                  onChange={(e) => updateField('baseBranch', e.target.value)}
                  className="w-full bg-beast-control border border-beast-border rounded-lg px-3 py-2 text-beast-text text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent"
                />
              </div>
              <div>
                <label htmlFor="git-pattern" className="block text-xs font-medium text-beast-muted mb-1">Branch Naming Pattern</label>
                <input
                  id="git-pattern"
                  type="text"
                  value={values.branchPattern ?? ''}
                  onChange={(e) => updateField('branchPattern', e.target.value)}
                  placeholder="feat/{agent-name}/{id}"
                  className="w-full bg-beast-control border border-beast-border rounded-lg px-3 py-2 text-beast-text text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="git-pr"
                  type="checkbox"
                  checked={values.prCreation ?? false}
                  onChange={(e) => updateField('prCreation', e.target.checked)}
                  className="accent-beast-accent"
                />
                <label htmlFor="git-pr" className="text-sm text-beast-text">Create PR</label>
              </div>
              <div>
                <label htmlFor="git-convention" className="block text-xs font-medium text-beast-muted mb-1">Commit Convention</label>
                <select
                  id="git-convention"
                  value={values.commitConvention ?? 'conventional'}
                  onChange={(e) => updateField('commitConvention', e.target.value)}
                  className="w-full bg-beast-control border border-beast-border rounded-lg px-3 py-2 text-beast-text text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent"
                >
                  <option value="conventional">Conventional Commits</option>
                  <option value="freeform">Freeform</option>
                </select>
              </div>
              <div>
                <label htmlFor="git-merge" className="block text-xs font-medium text-beast-muted mb-1">Merge Strategy</label>
                <select
                  id="git-merge"
                  value={values.mergeStrategy ?? 'merge'}
                  onChange={(e) => updateField('mergeStrategy', e.target.value)}
                  className="w-full bg-beast-control border border-beast-border rounded-lg px-3 py-2 text-beast-text text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent"
                >
                  <option value="merge">Merge</option>
                  <option value="squash">Squash</option>
                  <option value="rebase">Rebase</option>
                </select>
              </div>
            </Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>
      )}
    </div>
  );
}
