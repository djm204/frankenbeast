export interface GovernorConfig {
    readonly timeoutMs: number;
    readonly requireSignedApprovals: boolean;
    readonly operatorName: string;
    readonly sessionTokenTtlMs: number;
    readonly signingSecret?: string;
}
export declare function defaultConfig(): GovernorConfig;
//# sourceMappingURL=config.d.ts.map