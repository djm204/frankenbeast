type ScriptMap = Record<string, unknown>;
type TurboTaskMap = Record<string, unknown>;

const REQUIRED_TASKS = ['build', 'test'] as const;

export const validateVerificationTaskWiring = (
  scripts: ScriptMap,
  turboTasks: TurboTaskMap,
): void => {
  for (const task of REQUIRED_TASKS) {
    const expectedScript = `turbo run ${task}`;
    if (scripts[task] !== expectedScript) {
      throw new Error(
        `Verification script "${task}" must be wired to "${expectedScript}"`,
      );
    }

    const turboTask = turboTasks[task];
    if (
      !Object.hasOwn(turboTasks, task) ||
      typeof turboTask !== 'object' ||
      turboTask === null ||
      Array.isArray(turboTask)
    ) {
      throw new Error(`Turbo task "${task}" must be defined as an object`);
    }
  }
};
