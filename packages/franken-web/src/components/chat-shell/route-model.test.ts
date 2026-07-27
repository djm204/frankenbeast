import { describe, expect, it } from 'vitest';
import { PRIMARY_NAV_ROUTES, routeFromHash } from './route-model';

describe('smart-swarm route', () => {
  it('registers the canonical product route as live navigation', () => {
    expect(routeFromHash('#/smart-swarm')).toBe('smart-swarm');
    expect(PRIMARY_NAV_ROUTES).toContainEqual(expect.objectContaining({
      id: 'smart-swarm',
      label: 'smart-swarm',
      live: true,
    }));
    expect(PRIMARY_NAV_ROUTES.find((route) => route.id === 'smart-swarm')?.summary).not.toMatch(/PM[- ]swarm/i);
  });
});
