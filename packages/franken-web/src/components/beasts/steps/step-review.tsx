import type { ReactNode } from 'react';
import { useBeastStore } from '../../../stores/beast-store';
import { validateWizardStep } from '../wizard-validation';

type WorkflowReviewValues = {
  workflowType?: string;
  goal?: string;
  topic?: string;
  outputPath?: string;
  docPath?: string;
  outputDir?: string;
  provider?: string;
  objective?: string;
  chunkDirectory?: string;
  chunkDir?: string;
};

export function StepReview() {
  const { stepValues, setWizardStep } = useBeastStore();

  const identity = stepValues[0] as { name?: string; description?: string } | undefined;
  const workflow = stepValues[1] as WorkflowReviewValues | undefined;
  const llm = stepValues[2] as { defaultProvider?: string; defaultModel?: string } | undefined;
  const modules = stepValues[3] as Record<string, boolean> | undefined;
  const skills = stepValues[4] as { selectedSkills?: string[] } | undefined;
  const prompts = stepValues[5] as { promptText?: string; files?: Array<{ name: string }> } | undefined;
  const git = stepValues[6] as { preset?: string; baseBranch?: string } | undefined;

  return (
    <div className="p-8 space-y-4">
      <ReviewSection title="Identity" stepIndex={0} onEdit={setWizardStep}>
        <p className="text-sm text-beast-text">{identity?.name ?? '(not set)'}</p>
        {identity?.description && <p className="text-xs text-beast-subtle">{identity.description}</p>}
      </ReviewSection>

      <ReviewSection title="Workflow" stepIndex={1} onEdit={setWizardStep}>
        <WorkflowReview workflow={workflow} stepValues={stepValues} />
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

    </div>
  );
}

function WorkflowReview({ workflow, stepValues }: {
  workflow: WorkflowReviewValues | undefined;
  stepValues: Record<number, Record<string, unknown> | undefined>;
}) {
  const workflowErrors = validateWizardStep(1, stepValues);
  const rows = buildWorkflowReviewRows(workflow);

  return (
    <div className="space-y-2">
      <p className="text-sm text-beast-text">{workflow?.workflowType ?? '(not set)'}</p>
      {rows.length > 0 && (
        <dl className="grid gap-1 text-xs text-beast-muted sm:grid-cols-[max-content_1fr]">
          {rows.map(({ label, value }) => (
            <div key={label} className="contents">
              <dt className="font-medium text-beast-subtle">{label}</dt>
              <dd className="font-mono text-beast-text break-all">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {Object.keys(workflowErrors).length > 0 && (
        <div className="rounded border border-red-700 bg-red-900/30 px-3 py-2 text-xs text-red-200">
          <p className="font-medium">Required workflow fields are missing:</p>
          <ul className="mt-1 list-disc pl-4">
            {Object.values(workflowErrors).map((message) => <li key={message}>{message}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function buildWorkflowReviewRows(workflow: WorkflowReviewValues | undefined): Array<{ label: string; value: string }> {
  if (!workflow?.workflowType) return [];
  if (workflow.workflowType === 'design-interview') {
    return [
      { label: 'Goal', value: workflow.goal ?? workflow.topic ?? '(missing)' },
      { label: 'Output path', value: workflow.outputPath ?? '(missing)' },
    ];
  }
  if (workflow.workflowType === 'chunk-plan') {
    return [
      { label: 'Design doc', value: workflow.docPath ?? '(missing)' },
      { label: 'Output directory', value: workflow.outputDir ?? '(missing)' },
    ];
  }
  if (workflow.workflowType === 'martin-loop') {
    return [
      { label: 'Provider', value: workflow.provider ?? '(missing)' },
      { label: 'Objective', value: workflow.objective ?? '(missing)' },
      { label: 'Chunk directory', value: workflow.chunkDirectory ?? workflow.chunkDir ?? '(missing)' },
    ];
  }
  return [];
}

function ReviewSection({ title, stepIndex, onEdit, children }: {
  title: string; stepIndex: number; onEdit: (step: number) => void; children: ReactNode;
}) {
  return (
    <div className="p-4 rounded-lg bg-beast-elevated border border-beast-border">
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
