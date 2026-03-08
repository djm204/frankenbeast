/**
 * Aider CLI provider implementation.
 *
 * NEW provider — follows design doc patterns.
 * Aider uses LiteLLM which handles rate-limit retries internally,
 * so isRateLimited() always returns false.
 */
import type { ICliProvider, ProviderOpts } from './cli-provider.js';
export declare class AiderProvider implements ICliProvider {
    readonly name = "aider";
    readonly command = "aider";
    buildArgs(opts: ProviderOpts): string[];
    normalizeOutput(raw: string): string;
    estimateTokens(text: string): number;
    isRateLimited(_stderr: string): boolean;
    parseRetryAfter(_stderr: string): number | undefined;
    filterEnv(env: Record<string, string>): Record<string, string>;
    supportsStreamJson(): boolean;
}
//# sourceMappingURL=aider-provider.d.ts.map