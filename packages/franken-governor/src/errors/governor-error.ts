export class GovernorError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GovernorError';
    Object.setPrototypeOf(this, GovernorError.prototype);
  }
}
