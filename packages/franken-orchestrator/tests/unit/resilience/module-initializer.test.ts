import { describe, it, expect } from 'vitest';
import { checkModuleHealth, allHealthy } from '../../../src/resilience/module-initializer.js';
import { makeDeps } from '../../helpers/stubs.js';

describe('ModuleInitializer', () => {
  it('reports all modules healthy with working deps', async () => {
    const deps = makeDeps();
    const results = await checkModuleHealth(deps);

    expect(results).toHaveLength(8);
    expect(allHealthy(results)).toBe(true);
    for (const r of results) {
      expect(r.healthy).toBe(true);
      expect(r.error).toBeUndefined();
    }
  });

  it('detects unhealthy firewall module', async () => {
    const deps = makeDeps({
      firewall: {
        runPipeline: async () => { throw new Error('Firewall down'); },
      },
    });

    const results = await checkModuleHealth(deps);
    const firewall = results.find(r => r.module === 'firewall');

    expect(firewall?.healthy).toBe(false);
    expect(firewall?.error).toContain('Firewall down');
    expect(allHealthy(results)).toBe(false);
  });

  it('detects unhealthy memory module', async () => {
    const deps = makeDeps({
      memory: {
        frontload: async () => {},
        getContext: async () => { throw new Error('Memory unavailable'); },
        recordTrace: async () => {},
      },
    });

    const results = await checkModuleHealth(deps);
    const memory = results.find(r => r.module === 'memory');

    expect(memory?.healthy).toBe(false);
    expect(memory?.error).toContain('Memory unavailable');
  });

  it('reports individual module status even when others fail', async () => {
    const deps = makeDeps({
      planner: {
        createPlan: async () => { throw new Error('Planner broken'); },
      },
    });

    const results = await checkModuleHealth(deps);
    const healthy = results.filter(r => r.healthy);
    const unhealthy = results.filter(r => !r.healthy);

    expect(healthy).toHaveLength(7);
    expect(unhealthy).toHaveLength(1);
    expect(unhealthy[0]!.module).toBe('planner');
  });

  it('returns false for allHealthy when any module fails', async () => {
    const deps = makeDeps({
      heartbeat: {
        pulse: async () => { throw new Error('Heartbeat timeout'); },
      },
    });

    const results = await checkModuleHealth(deps);
    expect(allHealthy(results)).toBe(false);
  });
});
