export class UnknownTrackedAgentError extends Error {
  constructor(
    public readonly agentId: string,
  ) {
    super(`Unknown tracked agent: ${agentId}`);
  }
}

export class DeletedTrackedAgentError extends Error {
  constructor(
    public readonly agentId: string,
  ) {
    super(`Tracked agent '${agentId}' has been deleted`);
  }
}
