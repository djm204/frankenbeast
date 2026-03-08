export class TokenCounter {
    counts = new Map();
    record(entry) {
        const existing = this.counts.get(entry.model) ?? { prompt: 0, completion: 0 };
        this.counts.set(entry.model, {
            prompt: existing.prompt + entry.promptTokens,
            completion: existing.completion + entry.completionTokens,
        });
    }
    totalsFor(model) {
        const entry = this.counts.get(model) ?? { prompt: 0, completion: 0 };
        return {
            promptTokens: entry.prompt,
            completionTokens: entry.completion,
            totalTokens: entry.prompt + entry.completion,
        };
    }
    grandTotal() {
        let prompt = 0;
        let completion = 0;
        for (const entry of this.counts.values()) {
            prompt += entry.prompt;
            completion += entry.completion;
        }
        return { promptTokens: prompt, completionTokens: completion, totalTokens: prompt + completion };
    }
    allModels() {
        return Array.from(this.counts.keys());
    }
    reset() {
        this.counts.clear();
    }
}
//# sourceMappingURL=TokenCounter.js.map