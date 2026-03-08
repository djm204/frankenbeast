/**
 * Pluggable CLI provider interface and registry.
 *
 * ICliProvider abstracts CLI agent differences (claude, codex, etc.)
 * so the Martin-loop can work with any provider without hardcoding.
 *
 * ProviderRegistry holds named providers and validates on lookup.
 */
export interface ProviderOpts {
    readonly maxTurns?: number | undefined;
    readonly timeoutMs?: number | undefined;
    readonly workingDir?: string | undefined;
    readonly model?: string | undefined;
    readonly extraArgs?: readonly string[] | undefined;
    readonly commandOverride?: string | undefined;
}
export interface ICliProvider {
    readonly name: string;
    readonly command: string;
    buildArgs(opts: ProviderOpts): string[];
    normalizeOutput(raw: string): string;
    estimateTokens(text: string): number;
    isRateLimited(stderr: string): boolean;
    parseRetryAfter(stderr: string): number | undefined;
    filterEnv(env: Record<string, string>): Record<string, string>;
    supportsStreamJson(): boolean;
}
export declare class ProviderRegistry {
    private readonly providers;
    register(provider: ICliProvider): void;
    get(name: string): ICliProvider;
    has(name: string): boolean;
    names(): string[];
}
export declare function createDefaultRegistry(): ProviderRegistry;
//# sourceMappingURL=cli-provider.d.ts.map