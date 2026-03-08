/**
 * Codex CLI provider implementation.
 *
 * Extracted from martin-loop.ts: buildCodexArgs, normalizeCodexOutput,
 * tryExtractTextFromNode.
 */
import type { ICliProvider, ProviderOpts } from './cli-provider.js';
export declare class CodexProvider implements ICliProvider {
    readonly name = "codex";
    readonly command = "codex";
    buildArgs(opts: ProviderOpts): string[];
    normalizeOutput(raw: string): string;
    estimateTokens(text: string): number;
    isRateLimited(stderr: string): boolean;
    parseRetryAfter(stderr: string): number | undefined;
    filterEnv(env: Record<string, string>): Record<string, string>;
    supportsStreamJson(): boolean;
}
//# sourceMappingURL=codex-provider.d.ts.map