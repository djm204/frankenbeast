/**
 * Shared stream-json utilities used by multiple CLI providers.
 *
 * Extracted to eliminate duplication across claude-provider, codex-provider,
 * and gemini-provider.
 */
/** Common rate-limit detection patterns shared across providers. */
export const BASE_RATE_LIMIT_PATTERNS = /rate.?limit|429|too many requests|retry.?after|overloaded|capacity|temporarily unavailable|out of extra usage|usage limit|resets?\s+\d|resets?\s+in\s+\d+\s*s/i;
/** Recursively extract text from a stream-json node. */
export function tryExtractTextFromNode(node, out) {
    if (typeof node === 'string') {
        if (node.trim().length > 0)
            out.push(node);
        return;
    }
    if (!node || typeof node !== 'object')
        return;
    if (Array.isArray(node)) {
        for (const item of node)
            tryExtractTextFromNode(item, out);
        return;
    }
    const obj = node;
    const directKeys = ['text', 'output_text', 'output'];
    for (const key of directKeys) {
        const value = obj[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            out.push(value);
        }
    }
    const nestedKeys = ['delta', 'content', 'parts', 'data', 'result', 'response', 'message', 'content_block'];
    for (const key of nestedKeys) {
        if (obj[key] !== undefined) {
            tryExtractTextFromNode(obj[key], out);
        }
    }
}
//# sourceMappingURL=stream-json-utils.js.map