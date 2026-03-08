export class GovernorError extends Error {
    constructor(message) {
        super(message);
        this.name = 'GovernorError';
        Object.setPrototypeOf(this, GovernorError.prototype);
    }
}
//# sourceMappingURL=governor-error.js.map