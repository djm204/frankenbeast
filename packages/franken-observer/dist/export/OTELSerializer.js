// ── Serialiser ────────────────────────────────────────────────────────────────
function toAttributeValue(v) {
    if (typeof v === 'string')
        return { stringValue: v };
    if (typeof v === 'boolean')
        return { boolValue: v };
    if (typeof v === 'number') {
        return Number.isInteger(v) ? { intValue: v } : { doubleValue: v };
    }
    return { stringValue: String(v) };
}
function metadataToAttributes(metadata) {
    return Object.entries(metadata).map(([key, value]) => ({
        key,
        value: toAttributeValue(value),
    }));
}
function spanStatus(span) {
    if (span.status === 'error') {
        return { code: 'ERROR', message: span.errorMessage };
    }
    return { code: 'OK' };
}
function serializeSpan(span) {
    const attributes = metadataToAttributes(span.metadata);
    if (span.thoughtBlocks.length > 0) {
        attributes.push({
            key: 'thoughtBlocks',
            value: { stringValue: span.thoughtBlocks.join('\n') },
        });
    }
    return {
        traceId: span.traceId,
        spanId: span.id,
        parentSpanId: span.parentSpanId,
        name: span.name,
        startTimeUnixNano: span.startedAt * 1_000_000,
        endTimeUnixNano: (span.endedAt ?? span.startedAt) * 1_000_000,
        attributes,
        status: spanStatus(span),
    };
}
export const OTELSerializer = {
    serializeTrace(trace) {
        return {
            resourceSpans: [
                {
                    resource: {
                        attributes: [
                            { key: 'frankenbeast.trace.goal', value: { stringValue: trace.goal } },
                            { key: 'frankenbeast.trace.id', value: { stringValue: trace.id } },
                        ],
                    },
                    scopeSpans: [
                        {
                            scope: { name: '@frankenbeast/observer' },
                            spans: trace.spans.map(serializeSpan),
                        },
                    ],
                },
            ],
        };
    },
};
//# sourceMappingURL=OTELSerializer.js.map