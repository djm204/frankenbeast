import { Hono } from 'hono';
import { z } from 'zod';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { OrchestratorConfigSchema, type OrchestratorConfig } from '../../config/orchestrator-config.js';
import { applyNetworkConfigSets } from '../../network/network-config-paths.js';
import { filterNetworkServices, resolveNetworkServices } from '../../network/network-registry.js';
import { NetworkLogStore } from '../../network/network-logs.js';
import { redactSensitiveConfig } from '../../network/network-secrets.js';
import { NetworkStateStore } from '../../network/network-state-store.js';
import { NetworkSupervisor } from '../../network/network-supervisor.js';
import { HttpError, parseJsonBody, validateBody } from '../middleware.js';

const TargetBody = z.object({
  target: z.string().min(1),
}).strict();

const ConfigBody = z.object({
  assignments: z.array(z.string()).default([]),
}).strict();

export interface NetworkRoutesDeps {
  root: string;
  frankenbeastDir: string;
  configFile: string;
  getConfig(): OrchestratorConfig;
  setConfig(config: OrchestratorConfig): void;
}

function createSupervisor(frankenbeastDir: string): NetworkSupervisor {
  return new NetworkSupervisor({
    stateStore: new NetworkStateStore(join(frankenbeastDir, 'network', 'state.json')),
    logStore: new NetworkLogStore(join(frankenbeastDir, 'network', 'logs')),
    startService: async (service, options) => {
      const processSpec = service.runtimeConfig.process;
      if (!processSpec) {
        throw new HttpError(400, 'NOT_RUNNABLE', `Service '${service.id}' does not have a runnable entrypoint yet`);
      }

      if (options.detached) {
        const handle = await open(options.logFile ?? '/dev/null', 'a');
        const child = spawn(processSpec.command, processSpec.args, {
          cwd: processSpec.cwd,
          env: {
            ...process.env,
            ...processSpec.env,
          },
          detached: true,
          stdio: ['ignore', handle.fd, handle.fd],
        });
        child.unref();
        await handle.close();
        if (!child.pid) {
          throw new HttpError(500, 'START_FAILED', `Failed to start '${service.id}'`);
        }
        return { pid: child.pid };
      }

      const child = spawn(processSpec.command, processSpec.args, {
        cwd: processSpec.cwd,
        env: {
          ...process.env,
          ...processSpec.env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (!child.pid) {
        throw new HttpError(500, 'START_FAILED', `Failed to start '${service.id}'`);
      }
      return { pid: child.pid };
    },
    stopService: async (serviceState) => {
      try {
        process.kill(serviceState.pid, 'SIGTERM');
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ESRCH') {
          throw error;
        }
      }
    },
    healthcheck: async (serviceState) => {
      try {
        process.kill(serviceState.pid, 0);
        return true;
      } catch {
        return false;
      }
    },
  });
}

export function networkRoutes(deps: NetworkRoutesDeps): Hono {
  const app = new Hono();

  app.get('/v1/network/status', async (c) => {
    const supervisor = createSupervisor(deps.frankenbeastDir);
    const status = await supervisor.status();
    const services = resolveNetworkServices(deps.getConfig(), { repoRoot: deps.root });
    return c.json({
      data: {
        ...status,
        services: status.services.map((service) => {
          const resolved = services.find((candidate) => candidate.id === service.id);
          return {
            ...service,
            explanation: resolved?.explanation,
            url: resolved?.runtimeConfig.url,
          };
        }),
      },
    });
  });

  app.post('/v1/network/up', async (c) => {
    const supervisor = createSupervisor(deps.frankenbeastDir);
    const services = resolveNetworkServices(deps.getConfig(), { repoRoot: deps.root });
    const state = await supervisor.up({
      services,
      detached: true,
      mode: deps.getConfig().network.mode,
      secureBackend: deps.getConfig().network.secureBackend,
    });
    return c.json({ data: state });
  });

  app.post('/v1/network/down', async (c) => {
    const supervisor = createSupervisor(deps.frankenbeastDir);
    await supervisor.down();
    return c.json({ data: { ok: true } });
  });

  app.post('/v1/network/start', async (c) => {
    const body = validateBody(TargetBody, await parseJsonBody(c));
    const supervisor = createSupervisor(deps.frankenbeastDir);
    const services = filterNetworkServices(
      resolveNetworkServices(deps.getConfig(), { repoRoot: deps.root }),
      body.target,
    );
    const state = await supervisor.up({
      services,
      detached: true,
      mode: deps.getConfig().network.mode,
      secureBackend: deps.getConfig().network.secureBackend,
    });
    return c.json({ data: state });
  });

  app.post('/v1/network/stop', async (c) => {
    const body = validateBody(TargetBody, await parseJsonBody(c));
    const supervisor = createSupervisor(deps.frankenbeastDir);
    await supervisor.stop(body.target);
    return c.json({ data: { ok: true } });
  });

  app.post('/v1/network/restart', async (c) => {
    const body = validateBody(TargetBody, await parseJsonBody(c));
    const supervisor = createSupervisor(deps.frankenbeastDir);
    await supervisor.stop(body.target);
    const services = filterNetworkServices(
      resolveNetworkServices(deps.getConfig(), { repoRoot: deps.root }),
      body.target,
    );
    const state = await supervisor.up({
      services,
      detached: true,
      mode: deps.getConfig().network.mode,
      secureBackend: deps.getConfig().network.secureBackend,
    });
    return c.json({ data: state });
  });

  app.get('/v1/network/logs/:service', async (c) => {
    const supervisor = createSupervisor(deps.frankenbeastDir);
    const target = c.req.param('service');
    const logs = await supervisor.logs(target);
    return c.json({ data: { logs } });
  });

  app.get('/v1/network/config', (c) => {
    return c.json({ data: redactSensitiveConfig(deps.getConfig()) });
  });

  app.post('/v1/network/config', async (c) => {
    const body = validateBody(ConfigBody, await parseJsonBody(c));
    const nextConfig = OrchestratorConfigSchema.parse(
      applyNetworkConfigSets(deps.getConfig(), body.assignments ?? []),
    );
    deps.setConfig(nextConfig);
    await mkdir(dirname(deps.configFile), { recursive: true });
    await writeFile(deps.configFile, JSON.stringify(nextConfig, null, 2), 'utf-8');
    return c.json({ data: redactSensitiveConfig(nextConfig) });
  });

  return app;
}
