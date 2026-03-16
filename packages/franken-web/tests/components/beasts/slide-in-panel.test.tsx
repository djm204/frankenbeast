import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SlideInPanel } from '../../../src/components/beasts/slide-in-panel';

afterEach(cleanup);

describe('SlideInPanel', () => {
  it('renders children when open', () => {
    render(
      <SlideInPanel isOpen={true} onClose={vi.fn()}>
        <div>Panel content</div>
      </SlideInPanel>
    );
    expect(screen.getByText('Panel content')).toBeTruthy();
  });

  it('applies translate-x-full when closed', () => {
    const { container } = render(
      <SlideInPanel isOpen={false} onClose={vi.fn()}>
        <div>Hidden</div>
      </SlideInPanel>
    );
    const aside = container.querySelector('aside');
    expect(aside?.className).toContain('translate-x-full');
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <SlideInPanel isOpen={true} onClose={onClose}>
        <div>Content</div>
      </SlideInPanel>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
