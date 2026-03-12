export class UnknownTrackedAgentError extends Error {
  constructor(
    public readonly agentId: string,
  ) {
    super(`Unknown tracked agent: ${agentId}`);
  }
}
