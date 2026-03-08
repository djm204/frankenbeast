import type { KnownError } from '../core/types.js';
export type ErrorClassification = {
    type: 'known';
    knownError: KnownError;
} | {
    type: 'unknown';
};
/**
 * Classifies a task error against a list of known error patterns from MOD-03.
 * Matching is case-insensitive substring search on the error message.
 */
export declare class ErrorIngester {
    classify(error: Error, knownErrors: KnownError[]): ErrorClassification;
}
//# sourceMappingURL=error-ingester.d.ts.map