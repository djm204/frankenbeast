import * as Accordion from '@radix-ui/react-accordion';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { useBeastStore } from '../../stores/beast-store';
import { StepIdentity } from './steps/step-identity';
import { StepWorkflow } from './steps/step-workflow';
import { StepLlmTargets } from './steps/step-llm-targets';
import { StepModules } from './steps/step-modules';
import { StepSkills } from './steps/step-skills';
import { StepPrompts } from './steps/step-prompts';
import { StepGit } from './steps/step-git';
import { StepReview } from './steps/step-review';

const SECTIONS = [
  { id: 'identity', label: 'Identity', Component: StepIdentity },
  { id: 'workflow', label: 'Workflow', Component: StepWorkflow },
  { id: 'llm', label: 'LLM Targets', Component: StepLlmTargets },
  { id: 'modules', label: 'Modules', Component: StepModules },
  { id: 'skills', label: 'Skills', Component: StepSkills },
  { id: 'prompts', label: 'Prompts', Component: StepPrompts },
  { id: 'git', label: 'Git Workflow', Component: StepGit },
  { id: 'review', label: 'Review', Component: null }, // Review renders inline
];

interface SinglePageFormProps {
  onLaunch: (config: Record<string, unknown>) => void;
}

export function SinglePageForm({ onLaunch }: SinglePageFormProps) {
  const { stepValues } = useBeastStore();

  function handleLaunch() {
    const config: Record<string, unknown> = {};
    for (let i = 0; i < SECTIONS.length; i++) {
      if (stepValues[i]) {
        config[SECTIONS[i].id] = stepValues[i];
      }
    }
    onLaunch(config);
  }

  return (
    <ScrollArea.Root className="h-full overflow-hidden">
      <ScrollArea.Viewport className="h-full w-full">
        <Accordion.Root type="multiple" defaultValue={['identity']} className="p-6 space-y-2">
          {SECTIONS.map((section) => (
            <Accordion.Item key={section.id} value={section.id} className="border border-beast-border rounded-xl overflow-hidden">
              <Accordion.Header>
                <Accordion.Trigger className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-beast-text hover:text-beast-accent bg-beast-elevated transition-colors group">
                  <span>{section.label}</span>
                  <svg className="w-4 h-4 text-beast-subtle transition-transform group-data-[state=open]:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp overflow-hidden">
                {section.Component ? <section.Component /> : <StepReview onLaunch={handleLaunch} />}
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>

        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={handleLaunch}
            className="w-full px-4 py-3 rounded-lg bg-beast-accent text-beast-bg font-semibold text-sm hover:bg-beast-accent-strong transition-colors"
          >
            Launch
          </button>
        </div>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar orientation="vertical" className="w-2 p-0.5">
        <ScrollArea.Thumb className="bg-beast-border rounded-full" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}
