/**
 * Codex CLI provider implementation.
 *
 * Extracted from martin-loop.ts: buildCodexArgs, normalizeCodexOutput,
 * tryExtractTextFromNode.
 */
import { tryExtractTextFromNode, BASE_RATE_LIMIT_PATTERNS } from './stream-json-utils.js';
const RATE_LIMIT_PATTERNS = BASE_RATE_LIMIT_PATTERNS;
export class CodexProvider {
    name = 'codex';
    command = 'codex';
    buildArgs(opts) {
        const args = ['exec', '--full-auto', '--json', '--color', 'never'];
        if (opts.extraArgs) {
            args.push(...opts.extraArgs);
        }
        return args;
    }
    normalizeOutput(raw) {
        const lines = raw
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        const extracted = [];
        let parsedJsonLines = 0;
        for (const line of lines) {
            try {
                const parsed = JSON.parse(line);
                parsedJsonLines++;
                tryExtractTextFromNode(parsed, extracted);
            }
            catch {
                extracted.push(line);
            }
        }
        if (parsedJsonLines > 0 && extracted.length === 0)
            return '';
        return extracted.join('\n').trim();
    }
    estimateTokens(text) {
        return Math.ceil(text.length / 16);
    }
    isRateLimited(stderr) {
        return RATE_LIMIT_PATTERNS.test(stderr);
    }
    parseRetryAfter(stderr) {
        // "resets in 30s"
        const resetsInMatch = stderr.match(/resets?\s+in\s+(\d+)\s*s/i);
        if (resetsInMatch?.[1]) {
            return parseInt(resetsInMatch[1], 10) * 1000;
        }
        // "retry-after: 30"
        const retryAfterMatch = stderr.match(/retry.?after:?\s*(\d+)\s*s?/i);
        if (retryAfterMatch?.[1]) {
            return parseInt(retryAfterMatch[1], 10) * 1000;
        }
        return undefined;
    }
    filterEnv(env) {
        return { ...env };
    }
    supportsStreamJson() {
        return false;
    }
}
//# sourceMappingURL=codex-provider.js.map