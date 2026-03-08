import { Spinner } from '../cli/spinner.js';
export class ProgressLlmClient {
    inner;
    label;
    silent;
    write;
    constructor(inner, options = {}) {
        this.inner = inner;
        this.label = options.label ?? 'Thinking...';
        this.silent = options.silent ?? false;
        this.write = options.write ?? ((text) => process.stderr.write(text));
    }
    async complete(prompt) {
        const spinner = new Spinner({
            silent: this.silent,
            write: (text) => {
                try {
                    this.write(text);
                }
                catch {
                    // Progress output must never break the LLM call path.
                }
            },
        });
        spinner.start(this.label);
        try {
            const result = await this.inner.complete(prompt);
            const elapsedSeconds = (spinner.elapsed() / 1000).toFixed(1);
            const tokenCount = estimateTokens(result);
            spinner.stop(`  Done (${elapsedSeconds}s, ~${tokenCount} tokens)`);
            return result;
        }
        catch (error) {
            spinner.stop();
            throw error;
        }
    }
}
function estimateTokens(text) {
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.round(words * 1.3);
}
//# sourceMappingURL=progress-llm-client.js.map