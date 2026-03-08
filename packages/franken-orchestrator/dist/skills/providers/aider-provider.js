/**
 * Aider CLI provider implementation.
 *
 * NEW provider — follows design doc patterns.
 * Aider uses LiteLLM which handles rate-limit retries internally,
 * so isRateLimited() always returns false.
 */
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;
export class AiderProvider {
    name = 'aider';
    command = 'aider';
    buildArgs(opts) {
        const args = ['--message', '--yes-always', '--no-stream', '--no-auto-commits'];
        if (opts.extraArgs) {
            args.push(...opts.extraArgs);
        }
        return args;
    }
    normalizeOutput(raw) {
        return raw.replace(ANSI_PATTERN, '');
    }
    estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }
    isRateLimited(_stderr) {
        return false;
    }
    parseRetryAfter(_stderr) {
        return undefined;
    }
    filterEnv(env) {
        const filtered = { ...env };
        for (const key of Object.keys(filtered)) {
            if (key.startsWith('AIDER')) {
                delete filtered[key];
            }
        }
        return filtered;
    }
    supportsStreamJson() {
        return false;
    }
}
//# sourceMappingURL=aider-provider.js.map