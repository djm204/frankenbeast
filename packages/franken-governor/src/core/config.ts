export interface GovernorConfig {
  readonly timeoutMs: number;
  readonly requireSignedApprovals: boolean;
  readonly operatorName: string;
  readonly sessionTokenTtlMs: number;
  readonly signingSecret?: string;
}

export function defaultConfig(): GovernorConfig {
  return {
    timeoutMs: 300_000,
    requireSignedApprovals: false,
    operatorName: 'operator',
    sessionTokenTtlMs: 3_600_000,
  };
}
