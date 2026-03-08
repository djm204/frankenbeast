export const SpanLifecycle = {
    setMetadata(span, data) {
        if (span.status !== 'active') {
            throw new Error(`Cannot set metadata on a ${span.status} span (id: ${span.id})`);
        }
        Object.assign(span.metadata, data);
    },
    addThoughtBlock(span, thought) {
        if (span.status !== 'active') {
            throw new Error(`Cannot add thought block to a ${span.status} span (id: ${span.id})`);
        }
        span.thoughtBlocks.push(thought);
    },
    recordTokenUsage(span, usage, counter) {
        const data = {
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.promptTokens + usage.completionTokens,
        };
        if (usage.model !== undefined) {
            data['model'] = usage.model;
        }
        SpanLifecycle.setMetadata(span, data);
        if (counter !== undefined && usage.model !== undefined) {
            counter.record({
                model: usage.model,
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
            });
        }
    },
};
//# sourceMappingURL=SpanLifecycle.js.map