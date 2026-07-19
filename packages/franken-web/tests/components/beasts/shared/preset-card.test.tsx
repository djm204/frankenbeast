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
    const card = screen.getByText('One-shot').closest('label');
    expect(card?.className).toContain('border-beast-accent');
  });

  it('exposes the mutually exclusive selection as native grouped radios', () => {
    render(<PresetCardGroup presets={presets} selected="one-shot" onSelect={vi.fn()} />);

    expect(screen.getByRole('group', { name: /preset options/i })).toBeTruthy();
    const selected = screen.getByRole('radio', { name: /one-shot/i }) as HTMLInputElement;
    const unselected = screen.getByRole('radio', { name: /feature branch/i }) as HTMLInputElement;
    expect(selected.checked).toBe(true);
    expect(unselected.checked).toBe(false);
    expect(selected.name).toBe(unselected.name);
  });

  it('calls onSelect when card is clicked', () => {
    const onSelect = vi.fn();
    render(<PresetCardGroup presets={presets} selected="" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Feature Branch'));
    expect(onSelect).toHaveBeenCalledWith('feature-branch');
  });
});
