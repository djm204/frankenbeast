export interface GovernorConfig {
  readonly timeoutMs: number;
  readonly requireSignedApprovals: boolean;
  readonly operatorName: string;
  readonly sessionTokenTtlMs: number;
  readonly signingSecret?: string;
}

export type GovernorConfigOverrides = Partial<GovernorConfig>;

export const MAX_TIMEOUT_MS = 2_147_483_647;

export function defaultConfig(): GovernorConfig {
  return {
    timeoutMs: 300_000,
    requireSignedApprovals: false,
    operatorName: 'operator',
    sessionTokenTtlMs: 3_600_000,
  };
}

function assertPositiveFiniteNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${fieldName} must be a positive finite number`);
  }
}

function assertWithinTimerLimit(value: number, fieldName: string): void {
  if (value > MAX_TIMEOUT_MS) {
    throw new RangeError(`${fieldName} must be less than or equal to ${MAX_TIMEOUT_MS}`);
  }
}

export function validateGovernorConfig(config: GovernorConfig): GovernorConfig {
  assertPositiveFiniteNumber(config.timeoutMs, 'timeoutMs');
  assertWithinTimerLimit(config.timeoutMs, 'timeoutMs');
  assertPositiveFiniteNumber(config.sessionTokenTtlMs, 'sessionTokenTtlMs');
  return config;
}

export function normalizeGovernorConfig(overrides: GovernorConfigOverrides = {}): GovernorConfig {
  return validateGovernorConfig({
    ...defaultConfig(),
    ...overrides,
  });
}
