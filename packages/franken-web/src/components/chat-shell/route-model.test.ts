import { describe, expect, it } from 'vitest';
import { PRIMARY_NAV_ROUTES, routeFromHash } from './route-model';

describe('smart-swarm retirement route', () => {
  it('labels the Frankenbeast navigation entry as a successor handoff', () => {
    expect(routeFromHash('#/smart-swarm')).toBe('smart-swarm');
    expect(PRIMARY_NAV_ROUTES).toContainEqual(expect.objectContaining({
      id: 'smart-swarm',
      label: 'Smart Swarm',
      live: true,
    }));
    expect(PRIMARY_NAV_ROUTES.find((route) => route.id === 'smart-swarm')?.summary).toMatch(/moved|retired/i);
  });

  it('gates the retired Brain Vitals hash through the same Smart Swarm handoff', () => {
    expect(routeFromHash('#/brain-vitals')).toBe('smart-swarm');
    expect(PRIMARY_NAV_ROUTES.some((route) => route.id === ('brain-vitals' as never))).toBe(false);
  });
});
