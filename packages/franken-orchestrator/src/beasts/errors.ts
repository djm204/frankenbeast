export class UnknownTrackedAgentError extends Error {
  constructor(
    public readonly agentId: string,
  ) {
    super(`Unknown tracked agent: ${agentId}`);
  }
}

export class UnknownBeastDefinitionError extends Error {
  constructor(
    public readonly definitionId: string,
  ) {
    super(`Unknown Beast definition: ${definitionId}`);
  }
}

export class DeletedTrackedAgentError extends Error {
  constructor(
    public readonly agentId: string,
  ) {
    super(`Tracked agent '${agentId}' has been deleted`);
  }
}

export class RejectedTrackedAgentError extends Error {
  constructor(
    public readonly agentId: string,
  ) {
    super(`Tracked agent '${agentId}' was rejected and cannot be dispatched`);
    this.name = 'RejectedTrackedAgentError';
  }
}
