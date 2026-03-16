interface WizardStepIndicatorProps {
  steps: string[];
  currentStep: number;
  highestCompleted: number;
  onStepClick: (step: number) => void;
}

export function WizardStepIndicator({ steps, currentStep, highestCompleted, onStepClick }: WizardStepIndicatorProps) {
  return (
    <div className="flex items-center gap-1 px-6 py-3 border-b border-beast-border overflow-x-auto" role="navigation" aria-label="Wizard steps">
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
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors
              ${isCurrent ? 'text-beast-accent-strong bg-beast-accent-soft' : ''}
              ${isCompleted && !isCurrent ? 'text-beast-accent hover:bg-beast-elevated cursor-pointer' : ''}
              ${!isClickable ? 'text-beast-subtle cursor-not-allowed opacity-50' : ''}
            `}
          >
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold
              ${isCurrent ? 'bg-beast-accent text-beast-bg ring-2 ring-beast-accent-strong' : ''}
              ${isCompleted && !isCurrent ? 'bg-beast-accent/30 text-beast-accent' : ''}
              ${!isClickable ? 'bg-beast-border text-beast-subtle' : ''}
            `}>
              {i + 1}
            </span>
            {label}
          </button>
        );
      })}
    </div>
  );
}
