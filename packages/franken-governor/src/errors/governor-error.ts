export class GovernorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GovernorError';
    Object.setPrototypeOf(this, GovernorError.prototype);
  }
}
