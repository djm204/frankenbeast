/** Adds a unique request ID header to every request. */
export declare const requestId: import("hono").MiddlewareHandler<any, string, {}, Response>;
/** Global error handler — returns structured JSON error responses. */
export declare const errorHandler: import("hono").MiddlewareHandler<any, string, {}, Response | (Response & import("hono").TypedResponse<{
    error: {
        message: string;
        type: string;
        request_id: any;
    };
}, 500, "json">)>;
//# sourceMappingURL=middleware.d.ts.map