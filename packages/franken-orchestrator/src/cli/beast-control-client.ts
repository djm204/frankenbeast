import { createBeastServices } from '../beasts/create-beast-services.js';
import type { ProjectPaths } from './project-root.js';

export function createBeastControlClient(paths: ProjectPaths) {
  const services = createBeastServices(paths);
  return {
    listRuns: () => services.runs.listRuns(),
    getRun: (runId: string) => services.runs.getRun(runId),
    readLogs: (runId: string) => services.runs.readLogs(runId),
    stopRun: (runId: string, actor: string) => services.runs.stop(runId, actor),
    restartRun: (runId: string, actor: string) => services.runs.restart(runId, actor),
    resumeAgent: async (agentId: string, actor: string) => {
      const agent = services.agents.getAgent(agentId);
      if (!agent.dispatchRunId) {
        throw new Error(`Tracked agent '${agentId}' has no linked run to resume`);
      }
      services.agents.appendEvent(agentId, {
        level: 'info',
        type: 'agent.resume.requested',
        message: `Resume requested for linked run ${agent.dispatchRunId}`,
        payload: { runId: agent.dispatchRunId },
      });
      return services.runs.start(agent.dispatchRunId, actor);
    },
    deleteAgent: async (agentId: string) => {
      services.agents.appendEvent(agentId, {
        level: 'info',
        type: 'agent.delete.requested',
        message: 'Soft-deleted tracked agent from the CLI',
        payload: {},
      });
      return services.agents.softDeleteAgent(agentId);
    },
    createRun: (input: Parameters<typeof services.dispatch.createRun>[0]) =>
      services.dispatch.createRun(input),
  };
}
