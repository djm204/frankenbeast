import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WIZARD_STATE_CONSUMERS = [
  'src/components/beasts/wizard-dialog.tsx',
  'src/components/beasts/single-page-form.tsx',
  'src/components/beasts/steps/step-identity.tsx',
  'src/components/beasts/steps/step-workflow.tsx',
  'src/components/beasts/steps/step-llm-targets.tsx',
  'src/components/beasts/steps/step-modules.tsx',
  'src/components/beasts/steps/step-skills.tsx',
  'src/components/beasts/steps/step-prompts.tsx',
  'src/components/beasts/steps/step-git.tsx',
  'src/components/beasts/steps/step-review.tsx',
] as const;

const STEP_STATE_CONSUMERS = {
  'src/components/beasts/steps/step-identity.tsx': 0,
  'src/components/beasts/steps/step-workflow.tsx': 1,
  'src/components/beasts/steps/step-llm-targets.tsx': 2,
  'src/components/beasts/steps/step-modules.tsx': 3,
  'src/components/beasts/steps/step-skills.tsx': 4,
  'src/components/beasts/steps/step-prompts.tsx': 5,
  'src/components/beasts/steps/step-git.tsx': 6,
} as const;

describe('wizard Zustand architecture', () => {
  it('subscribes each wizard component through scoped selectors', () => {
    for (const sourcePath of WIZARD_STATE_CONSUMERS) {
      const source = readFileSync(join(process.cwd(), sourcePath), 'utf8');

      expect(source, sourcePath).toContain('useBeastStore(');
      expect(source, sourcePath).not.toMatch(/useBeastStore\(\s*\)/);
    }
  });

  it('does not subscribe the dialog shell to the complete form map', () => {
    const sourcePath = 'src/components/beasts/wizard-dialog.tsx';
    const source = readFileSync(join(process.cwd(), sourcePath), 'utf8');

    expect(source).not.toContain('useBeastStore((state) => state.stepValues);');
  });

  it('subscribes each step only to its own form values', () => {
    for (const [sourcePath, step] of Object.entries(STEP_STATE_CONSUMERS)) {
      const source = readFileSync(join(process.cwd(), sourcePath), 'utf8');

      expect(source, sourcePath).toContain(`state.stepValues[${step}]`);
      expect(source, sourcePath).not.toContain('state.stepValues);');
    }
  });
});
