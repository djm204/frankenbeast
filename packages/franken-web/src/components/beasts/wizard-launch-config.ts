export const WIZARD_SECTION_KEYS = ['identity', 'workflow', 'llm', 'modules', 'skills', 'prompts', 'git'] as const;

type WizardStepValues = Record<number, Record<string, unknown> | undefined>;

export function buildWizardLaunchConfig(stepValues: WizardStepValues): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  for (let i = 0; i < WIZARD_SECTION_KEYS.length; i += 1) {
    if (stepValues[i]) {
      config[WIZARD_SECTION_KEYS[i]!] = stepValues[i];
    }
  }

  const workflow = config.workflow as Record<string, unknown> | undefined;
  if (workflow?.workflowType === 'chunk-plan' && typeof workflow.docPath === 'string') {
    config.designDocPath = workflow.docPath;
  }

  if (workflow?.workflowType === 'chunk-plan' && typeof workflow.outputDir === 'string') {
    config.outputDir = workflow.outputDir;
  }

  return config;
}
