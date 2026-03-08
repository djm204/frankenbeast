/**
 * Classifies a task error against a list of known error patterns from MOD-03.
 * Matching is case-insensitive substring search on the error message.
 */
export class ErrorIngester {
    classify(error, knownErrors) {
        const msg = error.message.toLowerCase();
        const match = knownErrors.find((ke) => msg.includes(ke.pattern.toLowerCase()));
        if (match !== undefined) {
            return { type: 'known', knownError: match };
        }
        return { type: 'unknown' };
    }
}
//# sourceMappingURL=error-ingester.js.map