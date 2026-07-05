interface WizardStepIndicatorProps {
  steps: string[];
  currentStep: number;
  highestCompleted: number;
  stepStatuses?: Record<number, 'complete' | 'error' | 'current' | 'locked'>;
  onStepClick: (step: number) => void;
}

export function WizardStepIndicator({ steps, currentStep, highestCompleted, stepStatuses = {}, onStepClick }: WizardStepIndicatorProps) {
  return (
    <div className="flex items-center gap-1 px-6 py-3 border-b border-beast-border overflow-x-auto shrink-0" role="navigation" aria-label="Wizard steps">
      {steps.map((label, i) => {
        const status = stepStatuses[i];
        const hasError = status === 'error';
        const isCompleted = i <= highestCompleted && !hasError;
        const isCurrent = i === currentStep;
        const isClickable = isCompleted || isCurrent || hasError;

        return (
          <button
            key={label}
            type="button"
            onClick={() => isClickable && onStepClick(i)}
            disabled={!isClickable}
            aria-current={isCurrent ? 'step' : undefined}
            aria-label={hasError ? `${label} has validation errors` : label}
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
  );
}
