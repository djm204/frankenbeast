import type { Trace } from '../core/types.js';
export interface OTELAttributeValue {
    stringValue?: string;
    intValue?: number;
    doubleValue?: number;
    boolValue?: boolean;
}
export interface OTELAttribute {
    key: string;
    value: OTELAttributeValue;
}
export interface OTELStatus {
    code: 'UNSET' | 'OK' | 'ERROR';
    message?: string;
}
export interface OTELSpan {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    name: string;
    startTimeUnixNano: number;
    endTimeUnixNano: number;
    attributes: OTELAttribute[];
    status: OTELStatus;
}
export interface OTELScopeSpans {
    scope: {
        name: string;
    };
    spans: OTELSpan[];
}
export interface OTELResourceSpans {
    resource: {
        attributes: OTELAttribute[];
    };
    scopeSpans: OTELScopeSpans[];
}
export interface OTELPayload {
    resourceSpans: OTELResourceSpans[];
}
export declare const OTELSerializer: {
    serializeTrace(trace: Trace): OTELPayload;
};
//# sourceMappingURL=OTELSerializer.d.ts.map