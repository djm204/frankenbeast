/**
 * Gemini CLI provider implementation.
 *
 * NEW provider — follows design doc patterns.
 * Uses stream-json output format like Claude.
 */
import type { ICliProvider, ProviderOpts } from './cli-provider.js';
export declare class GeminiProvider implements ICliProvider {
    readonly name = "gemini";
    readonly command = "gemini";
    buildArgs(opts: ProviderOpts): string[];
    normalizeOutput(raw: string): string;
    estimateTokens(text: string): number;
    isRateLimited(stderr: string): boolean;
    parseRetryAfter(stderr: string): number | undefined;
    filterEnv(env: Record<string, string>): Record<string, string>;
    supportsStreamJson(): boolean;
}
//# sourceMappingURL=gemini-provider.d.ts.map