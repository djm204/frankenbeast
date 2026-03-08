/**
 * Gemini CLI provider implementation.
 *
 * NEW provider — follows design doc patterns.
 * Uses stream-json output format like Claude.
 */
import { tryExtractTextFromNode } from './stream-json-utils.js';
// Gemini adds RESOURCE_EXHAUSTED to the shared base patterns
const RATE_LIMIT_PATTERNS = /RESOURCE_EXHAUSTED|rate.?limit|429|too many requests|retry.?after|overloaded|capacity|temporarily unavailable|out of extra usage|usage limit|resets?\s+\d|resets?\s+in\s+\d+\s*s/i;
export class GeminiProvider {
    name = 'gemini';
    command = 'gemini';
    buildArgs(opts) {
        const args = ['-p', '--yolo', '--output-format', 'stream-json'];
        if (opts.extraArgs) {
            args.push(...opts.extraArgs);
        }
        return args;
    }
    normalizeOutput(raw) {
        const lines = raw.split('\n');
        const extracted = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length === 0)
                continue;
            try {
                const obj = JSON.parse(trimmed);
                const parts = [];
                tryExtractTextFromNode(obj, parts);
                if (parts.length > 0) {
                    extracted.push(parts.join(''));
                }
            }
            catch {
                extracted.push(trimmed);
            }
        }
        return extracted.join('\n').trim();
    }
    estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }
    isRateLimited(stderr) {
        return RATE_LIMIT_PATTERNS.test(stderr);
    }
    parseRetryAfter(stderr) {
        // "retry-after: 60"
        const retryAfterMatch = stderr.match(/retry.?after:?\s*(\d+)\s*s?/i);
        if (retryAfterMatch?.[1]) {
            return parseInt(retryAfterMatch[1], 10) * 1000;
        }
        // "retry after 25s"
        const retryAfterPatternMatch = stderr.match(/retry.?after\s+(\d+)\s*s?/i);
        if (retryAfterPatternMatch?.[1]) {
            return parseInt(retryAfterPatternMatch[1], 10) * 1000;
        }
        // "resets in 30s"
        const resetsInMatch = stderr.match(/resets?\s+in\s+(\d+)\s*s/i);
        if (resetsInMatch?.[1]) {
            return parseInt(resetsInMatch[1], 10) * 1000;
        }
        return undefined;
    }
    filterEnv(env) {
        const filtered = { ...env };
        for (const key of Object.keys(filtered)) {
            if (key.startsWith('GEMINI') || key.startsWith('GOOGLE')) {
                delete filtered[key];
            }
        }
        return filtered;
    }
    supportsStreamJson() {
        return true;
    }
}
//# sourceMappingURL=gemini-provider.js.map