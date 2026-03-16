import type { ReactNode } from 'react';
import { useBeastStore } from '../../../stores/beast-store';

const SECTION_LABELS = ['Identity', 'Workflow', 'LLM Targets', 'Modules', 'Skills', 'Prompts', 'Git'];

interface StepReviewProps {
  onLaunch: (config: Record<string, unknown>) => void;
}

export function StepReview({ onLaunch }: StepReviewProps) {
  const { stepValues, setWizardStep } = useBeastStore();

  function handleLaunch() {
    const config: Record<string, unknown> = {};
    for (let i = 0; i < SECTION_LABELS.length; i++) {
      if (stepValues[i]) {
        config[SECTION_LABELS[i].toLowerCase().replace(/ /g, '_')] = stepValues[i];
      }
    }
    onLaunch(config);
  }

  const identity = stepValues[0] as { name?: string; description?: string } | undefined;
  const workflow = stepValues[1] as { workflowType?: string } | undefined;
  const llm = stepValues[2] as { defaultProvider?: string; defaultModel?: string } | undefined;
  const modules = stepValues[3] as Record<string, boolean> | undefined;
  const skills = stepValues[4] as { selectedSkills?: string[] } | undefined;
  const prompts = stepValues[5] as { promptText?: string; files?: Array<{ name: string }> } | undefined;
  const git = stepValues[6] as { preset?: string; baseBranch?: string } | undefined;

  return (
    <div className="p-6 space-y-4">
      <ReviewSection title="Identity" stepIndex={0} onEdit={setWizardStep}>
        <p className="text-sm text-beast-text">{identity?.name ?? '(not set)'}</p>
        {identity?.description && <p className="text-xs text-beast-subtle">{identity.description}</p>}
      </ReviewSection>

      <ReviewSection title="Workflow" stepIndex={1} onEdit={setWizardStep}>
        <p className="text-sm text-beast-text">{workflow?.workflowType ?? '(not set)'}</p>
      </ReviewSection>

      <ReviewSection title="LLM Targets" stepIndex={2} onEdit={setWizardStep}>
        <p className="text-sm text-beast-text">
          {llm?.defaultProvider && llm?.defaultModel
            ? `${llm.defaultProvider} / ${llm.defaultModel}`
            : 'Using process defaults'}
        </p>
      </ReviewSection>

      <ReviewSection title="Modules" stepIndex={3} onEdit={setWizardStep}>
        {modules ? (
          <div className="flex flex-wrap gap-1">
            {Object.entries(modules).filter(([, v]) => v).map(([k]) => (
              <span key={k} className="text-xs px-2 py-0.5 rounded-full bg-beast-accent-soft text-beast-accent border border-beast-accent/30">{k}</span>
            ))}
            {Object.values(modules).filter(Boolean).length === 0 && <p className="text-xs text-beast-subtle">None selected</p>}
          </div>
        ) : (
          <p className="text-xs text-beast-subtle">Default configuration</p>
        )}
      </ReviewSection>

      <ReviewSection title="Skills" stepIndex={4} onEdit={setWizardStep}>
        {skills?.selectedSkills?.length ? (
          <div className="flex flex-wrap gap-1">
            {skills.selectedSkills.map((s) => (
              <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-beast-accent-soft text-beast-accent border border-beast-accent/30">{s}</span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-beast-subtle">No skills selected</p>
        )}
      </ReviewSection>

      <ReviewSection title="Prompts" stepIndex={5} onEdit={setWizardStep}>
        {prompts?.promptText && <p className="text-xs text-beast-muted font-mono truncate">{prompts.promptText.slice(0, 100)}{prompts.promptText.length > 100 ? '...' : ''}</p>}
        {prompts?.files?.length ? <p className="text-xs text-beast-subtle">{prompts.files.length} file(s)</p> : null}
        {!prompts?.promptText && !prompts?.files?.length && <p className="text-xs text-beast-subtle">No prompt frontloading</p>}
      </ReviewSection>

      <ReviewSection title="Git Workflow" stepIndex={6} onEdit={setWizardStep}>
        {git?.preset ? (
          <p className="text-sm text-beast-text">{git.preset}{git.baseBranch ? ` (${git.baseBranch})` : ''}</p>
        ) : (
          <p className="text-xs text-beast-subtle">Not configured</p>
        )}
      </ReviewSection>

      <div className="pt-4">
        <button
          type="button"
          onClick={handleLaunch}
          className="w-full px-4 py-3 rounded-lg bg-beast-accent text-beast-bg font-semibold text-sm hover:bg-beast-accent-strong transition-colors"
        >
          Launch
        </button>
      </div>
    </div>
  );
}

function ReviewSection({ title, stepIndex, onEdit, children }: {
  title: string; stepIndex: number; onEdit: (step: number) => void; children: ReactNode;
}) {
  return (
    <div className="p-3 rounded-lg bg-beast-elevated border border-beast-border">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-medium text-beast-muted uppercase">{title}</h3>
        <button
          type="button"
          onClick={() => onEdit(stepIndex)}
          className="text-xs text-beast-accent hover:text-beast-accent-strong transition-colors"
        >
          Edit
        </button>
      </div>
      {children}
    </div>
  );
}
