export type VitestFlagName = 'INTEGRATION' | 'E2E';

export type VitestEnvironment = Readonly<Record<string, string | undefined>>;

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DISABLED_VALUES = new Set(['', '0', 'false', 'no', 'off']);
const ALLOWED_VALUES_DESCRIPTION = 'true, false, 1, 0, yes, no, on, or off';

export function readVitestFlag(env: VitestEnvironment, name: VitestFlagName): boolean {
  const normalized = (env[name] ?? '').trim().toLowerCase();

  if (ENABLED_VALUES.has(normalized)) {
    return true;
  }

  if (DISABLED_VALUES.has(normalized)) {
    return false;
  }

  throw new Error(`${name} must be one of ${ALLOWED_VALUES_DESCRIPTION}.`);
}

export function readVitestFlags(env: VitestEnvironment = process.env): Record<VitestFlagName, boolean> {
  return {
    INTEGRATION: readVitestFlag(env, 'INTEGRATION'),
    E2E: readVitestFlag(env, 'E2E'),
  };
}
