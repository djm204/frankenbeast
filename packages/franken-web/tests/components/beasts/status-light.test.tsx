import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StatusLight } from '../../../src/components/beasts/status-light';

afterEach(cleanup);

describe('StatusLight', () => {
  it('renders with running status and pulse class', () => {
    render(<StatusLight status="running" />);
    const light = screen.getByRole('status');
    expect(light.getAttribute('aria-label')).toBe('Agent status: running');
    expect(light.className).toContain('animate-pulse');
  });

  it('renders stopped with no glow', () => {
    render(<StatusLight status="stopped" />);
    const light = screen.getByRole('status');
    expect(light.className).toContain('bg-beast-subtle');
    expect(light.className).not.toContain('animate-pulse');
    expect(light.className).not.toContain('shadow');
  });

  it('renders failed with static red glow', () => {
    render(<StatusLight status="failed" />);
    const light = screen.getByRole('status');
    expect(light.className).toContain('bg-beast-danger');
    expect(light.className).toContain('shadow');
    expect(light.className).not.toContain('animate-pulse');
  });
});
