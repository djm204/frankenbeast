/**
 * Shared stream-json utilities used by multiple CLI providers.
 *
 * Extracted to eliminate duplication across claude-provider, codex-provider,
 * and gemini-provider.
 */
/** Common rate-limit detection patterns shared across providers. */
export declare const BASE_RATE_LIMIT_PATTERNS: RegExp;
/** Recursively extract text from a stream-json node. */
export declare function tryExtractTextFromNode(node: unknown, out: string[]): void;
//# sourceMappingURL=stream-json-utils.d.ts.map