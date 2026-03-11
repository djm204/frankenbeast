import { Hono } from 'hono';
import { z } from 'zod';
import type { AgentService } from '../../beasts/services/agent-service.js';

const CreateAgentBody = z.object({
  definitionId: z.string().min(1),
  initAction: z.object({
    kind: z.enum(['design-interview', 'chunk-plan', 'martin-loop']),
    command: z.string().min(1),
    config: z.record(z.string(), z.unknown()),
    chatSessionId: z.string().min(1).optional(),
  }).strict(),
  initConfig: z.record(z.string(), z.unknown()),
  chatSessionId: z.string().min(1).optional(),
}).strict();

export interface AgentRoutesDeps {
  agents: AgentService;
}

export function agentRoutes(deps: AgentRoutesDeps): Hono {
  const app = new Hono();

  app.post('/v1/beasts/agents', async (c) => {
    const raw = await c.req.json();
    const body = CreateAgentBody.parse(raw);
    const agent = deps.agents.createAgent({
      definitionId: body.definitionId,
      source: 'dashboard',
      createdByUser: 'operator',
      initAction: body.initAction,
      initConfig: body.initConfig,
      ...(body.chatSessionId ? { chatSessionId: body.chatSessionId } : {}),
    });
    deps.agents.appendEvent(agent.id, {
      level: 'info',
      type: 'agent.created',
      message: `Created tracked agent for ${agent.definitionId}`,
      payload: {
        source: agent.source,
      },
    });
    return c.json({ data: agent }, 201);
  });

  app.get('/v1/beasts/agents', (c) => {
    return c.json({
      data: {
        agents: deps.agents.listAgents(),
      },
    });
  });

  app.get('/v1/beasts/agents/:agentId', (c) => {
    return c.json({
      data: deps.agents.getAgentDetail(c.req.param('agentId')),
    });
  });

  return app;
}
