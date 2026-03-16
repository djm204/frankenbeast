import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useBeastStore } from '../../stores/beast-store';
import { WizardStepIndicator } from './wizard-step-indicator';
import { StepIdentity } from './steps/step-identity';
import { StepWorkflow } from './steps/step-workflow';
import { StepLlmTargets } from './steps/step-llm-targets';
import { StepModules } from './steps/step-modules';
import { StepSkills } from './steps/step-skills';
import { StepPrompts } from './steps/step-prompts';
import { StepGit } from './steps/step-git';
import { StepReview } from './steps/step-review';

const STEP_LABELS = ['Identity', 'Workflow', 'LLM Targets', 'Modules', 'Skills', 'Prompts', 'Git', 'Review'];
const SECTION_KEYS = ['identity', 'workflow', 'llm', 'modules', 'skills', 'prompts', 'git', 'review'];

interface WizardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunch: (config: Record<string, unknown>) => void;
  launching?: boolean;
  launchError?: string | null;
}

export function WizardDialog({ isOpen, onClose, onLaunch, launching, launchError }: WizardDialogProps) {
  const { wizardStep, highestCompleted, wizardMode, nextStep, prevStep, setWizardStep, toggleWizardMode, stepValues } =
    useBeastStore();

  const isLastStep = wizardStep === STEP_LABELS.length - 1;
  const isFirstStep = wizardStep === 0;

  function buildAndLaunch() {
    const config: Record<string, unknown> = {};
    for (let i = 0; i < STEP_LABELS.length; i++) {
      if (stepValues[i]) config[SECTION_KEYS[i]!] = stepValues[i];
    }
    onLaunch(config);
  }

  function handleNext() {
    if (isLastStep) {
      buildAndLaunch();
    } else {
      nextStep();
    }
  }

  function renderStep() {
    switch (wizardStep) {
      case 0: return <StepIdentity />;
      case 1: return <StepWorkflow />;
      case 2: return <StepLlmTargets />;
      case 3: return <StepModules />;
      case 4: return <StepSkills />;
      case 5: return <StepPrompts />;
      case 6: return <StepGit />;
      case 7: return <StepReview onLaunch={onLaunch} />;
      default: return null;
    }
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-[70]" />
        <Dialog.Content
          className="fixed top-[10vh] left-[12vw] w-[76vw] h-[80vh] bg-beast-panel border border-beast-border
            rounded-2xl z-[70] flex flex-col shadow-2xl shadow-black/40"
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-beast-border shrink-0">
            <Dialog.Title className="text-beast-text font-semibold text-lg">Create Agent</Dialog.Title>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={toggleWizardMode}
                aria-label="Toggle form mode"
                className="text-xs px-4 py-2 rounded-lg border border-beast-border text-beast-muted
                  hover:text-beast-text hover:bg-beast-elevated transition-colors"
              >
                {wizardMode === 'wizard' ? 'Form View' : 'Wizard View'}
              </button>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="p-2.5 rounded-lg text-beast-subtle hover:text-beast-text hover:bg-beast-elevated transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Step indicator (wizard mode only) */}
          {wizardMode === 'wizard' && (
            <WizardStepIndicator
              steps={STEP_LABELS}
              currentStep={wizardStep}
              highestCompleted={highestCompleted}
              onStepClick={setWizardStep}
            />
          )}

          {/* Step content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {wizardMode === 'wizard' ? renderStep() : (
              <div className="space-y-8 p-8">
                <FormSection title="Identity"><StepIdentity /></FormSection>
                <FormSection title="Workflow"><StepWorkflow /></FormSection>
                <FormSection title="LLM Targets"><StepLlmTargets /></FormSection>
                <FormSection title="Modules"><StepModules /></FormSection>
                <FormSection title="Skills"><StepSkills /></FormSection>
                <FormSection title="Prompts"><StepPrompts /></FormSection>
                <FormSection title="Git"><StepGit /></FormSection>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-col gap-3 px-8 py-5 border-t border-beast-border shrink-0">
            {launchError && (
              <div className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-700 text-red-300 text-sm">
                {launchError}
              </div>
            )}
            <div className="flex items-center justify-between">
              {wizardMode === 'wizard' ? (
                <>
                  <button
                    type="button"
                    onClick={prevStep}
                    disabled={isFirstStep || launching}
                    className="px-5 py-2.5 rounded-lg text-sm font-medium text-beast-muted hover:text-beast-text
                      hover:bg-beast-elevated border border-beast-border disabled:opacity-50 disabled:cursor-not-allowed
                      transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={launching}
                    className="px-6 py-2.5 rounded-lg text-sm font-medium transition-colors
                      bg-beast-accent text-beast-bg hover:bg-beast-accent-strong disabled:opacity-50"
                  >
                    {launching ? 'Launching...' : isLastStep ? 'Launch Agent' : wizardStep === STEP_LABELS.length - 2 ? 'Review' : 'Next'}
                  </button>
                </>
              ) : (
                <>
                  <div />
                  <button
                    type="button"
                    onClick={buildAndLaunch}
                    disabled={launching}
                    className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors
                      bg-beast-accent text-beast-bg hover:bg-beast-accent-strong disabled:opacity-50"
                  >
                    {launching ? 'Launching...' : 'Launch Agent'}
                  </button>
                </>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-beast-border overflow-hidden">
      <h3 className="px-6 py-4 text-sm font-medium text-beast-accent bg-beast-elevated border-b border-beast-border">
        {title}
      </h3>
      <div className="p-2">{children}</div>
    </section>
  );
}
