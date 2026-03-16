import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { GapBanner } from '../../../../src/components/beasts/shared/gap-banner';

afterEach(cleanup);

describe('GapBanner', () => {
  it('renders message text', () => {
    render(<GapBanner message="Per-action routing not yet wired" />);
    expect(screen.getByText(/per-action routing not yet wired/i)).toBeTruthy();
  });

  it('has info styling', () => {
    const { container } = render(<GapBanner message="Test message" />);
    const banner = container.firstChild as HTMLElement;
    expect(banner.className).toContain('border');
    expect(banner.className).toContain('rounded');
  });
});
