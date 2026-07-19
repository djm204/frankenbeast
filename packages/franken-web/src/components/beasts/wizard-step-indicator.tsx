import { useId } from 'react';

interface WizardStepIndicatorProps {
  steps: string[];
  currentStep: number;
  highestCompleted: number;
  stepStatuses?: Record<number, 'complete' | 'error' | 'current' | 'locked'>;
  onStepClick: (step: number) => void;
}

export function WizardStepIndicator({ steps, currentStep, highestCompleted, stepStatuses = {}, onStepClick }: WizardStepIndicatorProps) {
  const lockedReasonId = useId();
  const firstIncompleteStep = steps[highestCompleted + 1];
  const hasLockedSteps = steps.some(
    (_, i) => i > highestCompleted && i !== currentStep && stepStatuses[i] !== 'error',
  );

  return (
    <div className="border-b border-beast-border shrink-0" role="navigation" aria-label="Wizard steps">
      <div className="flex items-center gap-1 px-6 py-3 overflow-x-auto">
        {steps.map((label, i) => {
          const status = stepStatuses[i];
          const hasError = status === 'error';
          const isCompleted = i <= highestCompleted && !hasError;
          const isCurrent = i === currentStep;
          const isClickable = isCompleted || isCurrent || hasError;
          const ariaLabel = hasError
            ? `${label}, validation errors`
            : isCurrent
              ? `${label}, current step`
              : isCompleted
                ? `${label}, completed`
                : `${label}, locked`;

          return (
            <button
              key={label}
              type="button"
              onClick={() => isClickable && onStepClick(i)}
              disabled={!isClickable}
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={ariaLabel}
              aria-describedby={!isClickable ? lockedReasonId : undefined}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors
                ${isCurrent && !hasError ? 'text-beast-accent-strong bg-beast-accent-soft' : ''}
                ${hasError ? 'text-beast-danger bg-red-900/20 border border-red-700/60' : ''}
                ${isCompleted && !isCurrent ? 'text-beast-accent hover:bg-beast-elevated cursor-pointer' : ''}
                ${!isClickable ? 'text-beast-subtle cursor-not-allowed opacity-40' : ''}
              `}
            >
              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold shrink-0
                ${isCurrent && !hasError ? 'bg-beast-accent text-beast-bg' : ''}
                ${hasError ? 'bg-red-900/50 text-red-200' : ''}
                ${isCompleted && !isCurrent ? 'bg-beast-accent/30 text-beast-accent' : ''}
                ${!isClickable ? 'bg-beast-border text-beast-subtle' : ''}
              `}>
                {hasError ? '!' : isCompleted && !isCurrent ? '✓' : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>
      {hasLockedSteps && (
        <p id={lockedReasonId} className="-mt-1 px-6 pb-3 text-xs text-beast-muted">
          Complete {firstIncompleteStep} to unlock later steps.
        </p>
      )}
    </div>
  );
}
