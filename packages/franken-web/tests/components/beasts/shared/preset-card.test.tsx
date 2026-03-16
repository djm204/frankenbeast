import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PresetCardGroup } from '../../../../src/components/beasts/shared/preset-card';

afterEach(cleanup);

const presets = [
  { id: 'one-shot', title: 'One-shot', description: 'Direct commit' },
  { id: 'feature-branch', title: 'Feature Branch', description: 'Create branch and PR' },
];

describe('PresetCardGroup', () => {
  it('renders all preset cards', () => {
    render(<PresetCardGroup presets={presets} selected="" onSelect={vi.fn()} />);
    expect(screen.getByText('One-shot')).toBeTruthy();
    expect(screen.getByText('Feature Branch')).toBeTruthy();
  });

  it('highlights selected card', () => {
    render(<PresetCardGroup presets={presets} selected="one-shot" onSelect={vi.fn()} />);
    const card = screen.getByText('One-shot').closest('button');
    expect(card?.className).toContain('border-beast-accent');
  });

  it('calls onSelect when card is clicked', () => {
    const onSelect = vi.fn();
    render(<PresetCardGroup presets={presets} selected="" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Feature Branch'));
    expect(onSelect).toHaveBeenCalledWith('feature-branch');
  });
});
