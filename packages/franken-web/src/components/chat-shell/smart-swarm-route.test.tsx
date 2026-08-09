import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SmartSwarmRoute } from './smart-swarm-route';

const SMART_SWARM_REPOSITORY = 'https://github.com/djm204/smart-swarm';

describe('SmartSwarmRoute retirement gate', () => {
  it('hands operators to Smart Swarm without mounting the legacy operational dashboard', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    render(<SmartSwarmRoute baseUrl="http://127.0.0.1:3737" />);

    expect(screen.getByRole('heading', { name: 'Operational dashboard moved to Smart Swarm' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Smart Swarm' }).getAttribute('href')).toBe(SMART_SWARM_REPOSITORY);
    expect(screen.queryByRole('region', { name: 'Runtime topology' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Runtime brain pulse' })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
