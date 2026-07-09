export type VitestFlagName = 'INTEGRATION' | 'EVAL' | 'E2E' | 'DOCKER_BUILD';

export type VitestEnv = Readonly<Record<string, string | undefined>>;

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DISABLED_VALUES = new Set(['', '0', 'false', 'no', 'off']);
const ALLOWED_VALUES = 'true, false, 1, 0, yes, no, on, or off';

export function readVitestFlag(env: VitestEnv, name: VitestFlagName): boolean {
  const normalized = (env[name] ?? '').trim().toLowerCase();

  if (ENABLED_VALUES.has(normalized)) {
    return true;
  }

  if (DISABLED_VALUES.has(normalized)) {
    return false;
  }

  throw new Error(`${name} must be one of ${ALLOWED_VALUES}.`);
}

export function readVitestFlags<const Names extends readonly VitestFlagName[]>(
  names: Names,
  env: VitestEnv = process.env,
): Record<Names[number], boolean> {
  return Object.fromEntries(
    names.map((name) => [name, readVitestFlag(env, name)]),
  ) as Record<Names[number], boolean>;
}
