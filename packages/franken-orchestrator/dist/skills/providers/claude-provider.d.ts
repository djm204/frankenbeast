/**
 * Claude CLI provider implementation.
 *
 * Extracted from martin-loop.ts: buildClaudeArgs, RATE_LIMIT_PATTERNS,
 * parseResetTime, and env filtering logic.
 */
import type { ICliProvider, ProviderOpts } from './cli-provider.js';
export { tryExtractTextFromNode } from './stream-json-utils.js';
export declare class ClaudeProvider implements ICliProvider {
    readonly name = "claude";
    readonly command = "claude";
    buildArgs(opts: ProviderOpts): string[];
    normalizeOutput(raw: string): string;
    estimateTokens(text: string): number;
    isRateLimited(stderr: string): boolean;
    parseRetryAfter(stderr: string): number | undefined;
    filterEnv(env: Record<string, string>): Record<string, string>;
    supportsStreamJson(): boolean;
}
//# sourceMappingURL=claude-provider.d.ts.map