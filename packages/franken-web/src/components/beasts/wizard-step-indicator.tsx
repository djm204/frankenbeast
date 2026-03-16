interface WizardStepIndicatorProps {
  steps: string[];
  currentStep: number;
  highestCompleted: number;
  onStepClick: (step: number) => void;
}

export function WizardStepIndicator({ steps, currentStep, highestCompleted, onStepClick }: WizardStepIndicatorProps) {
  return (
    <div className="flex items-center gap-1 px-6 py-3 border-b border-beast-border overflow-x-auto shrink-0" role="navigation" aria-label="Wizard steps">
      {steps.map((label, i) => {
        const isCompleted = i <= highestCompleted;
        const isCurrent = i === currentStep;
        const isClickable = isCompleted || isCurrent;

        return (
          <button
            key={label}
            type="button"
            onClick={() => isClickable && onStepClick(i)}
            disabled={!isClickable}
            aria-current={isCurrent ? 'step' : undefined}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors
              ${isCurrent ? 'text-beast-accent-strong bg-beast-accent-soft' : ''}
              ${isCompleted && !isCurrent ? 'text-beast-accent hover:bg-beast-elevated cursor-pointer' : ''}
              ${!isClickable ? 'text-beast-subtle cursor-not-allowed opacity-40' : ''}
            `}
          >
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold shrink-0
              ${isCurrent ? 'bg-beast-accent text-beast-bg' : ''}
              ${isCompleted && !isCurrent ? 'bg-beast-accent/30 text-beast-accent' : ''}
              ${!isClickable ? 'bg-beast-border text-beast-subtle' : ''}
            `}>
              {isCompleted && !isCurrent ? '✓' : i + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
