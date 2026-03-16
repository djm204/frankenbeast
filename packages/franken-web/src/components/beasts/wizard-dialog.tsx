import * as Dialog from '@radix-ui/react-dialog';
import { useBeastStore } from '../../stores/beast-store';
import { WizardStepIndicator } from './wizard-step-indicator';
import { StepIdentity } from './steps/step-identity';
import { StepWorkflow } from './steps/step-workflow';
import { StepLlmTargets } from './steps/step-llm-targets';
import { StepModules } from './steps/step-modules';

const STEP_LABELS = ['Identity', 'Workflow', 'LLM Targets', 'Modules', 'Skills', 'Prompts', 'Git', 'Review'];

function StepPlaceholder({ label }: { label: string }) {
  return <div className="p-6 text-beast-muted text-center">{label} — coming soon</div>;
}

interface WizardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunch: (config: Record<string, unknown>) => void;
}

export function WizardDialog({ isOpen, onClose, onLaunch }: WizardDialogProps) {
  const { wizardStep, highestCompleted, wizardMode, nextStep, prevStep, setWizardStep, toggleWizardMode, stepValues } =
    useBeastStore();

  const isLastStep = wizardStep === STEP_LABELS.length - 1;
  const isFirstStep = wizardStep === 0;

  function handleNext() {
    if (isLastStep) {
      const sectionKeys = ['identity', 'workflow', 'llm', 'modules', 'skills', 'prompts', 'git', 'review'];
      const config: Record<string, unknown> = {};
      for (let i = 0; i < STEP_LABELS.length; i++) {
        if (stepValues[i]) config[sectionKeys[i]!] = stepValues[i];
      }
      onLaunch(config);
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
      default: return <StepPlaceholder label={STEP_LABELS[wizardStep] ?? ''} />;
    }
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-[70]" />
        <Dialog.Content
          className="fixed top-[15vh] left-[15vw] w-[70vw] h-[70vh] bg-beast-panel border border-beast-border rounded-xl z-[70] flex flex-col"
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-beast-border">
            <Dialog.Title className="text-beast-text font-semibold text-lg">Create Agent</Dialog.Title>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleWizardMode}
                aria-label="Toggle form mode"
                className="text-xs px-3 py-1 rounded-lg border border-beast-border text-beast-muted hover:text-beast-text hover:bg-beast-elevated transition-colors"
              >
                {wizardMode === 'wizard' ? 'Form View' : 'Wizard View'}
              </button>
              <Dialog.Close asChild>
                <button type="button" className="p-1.5 rounded-lg text-beast-subtle hover:text-beast-text hover:bg-beast-elevated" aria-label="Close">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Step indicator */}
          <WizardStepIndicator
            steps={STEP_LABELS}
            currentStep={wizardStep}
            highestCompleted={highestCompleted}
            onStepClick={setWizardStep}
          />

          {/* Step content */}
          <div className="flex-1 overflow-y-auto">
            {renderStep()}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-beast-border">
            <button
              type="button"
              onClick={prevStep}
              disabled={isFirstStep}
              className="px-4 py-2 rounded-lg text-sm font-medium text-beast-muted hover:text-beast-text
                hover:bg-beast-elevated border border-beast-border disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-beast-accent text-beast-bg hover:bg-beast-accent-strong"
            >
              {isLastStep ? 'Launch' : wizardStep === STEP_LABELS.length - 2 ? 'Review' : 'Next'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
