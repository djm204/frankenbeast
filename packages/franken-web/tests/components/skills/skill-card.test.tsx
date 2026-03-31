import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SkillCard } from '../../../src/components/skills/skill-card';

afterEach(cleanup);

describe('SkillCard', () => {
  it('renders skill name', () => {
    render(<SkillCard name="github" enabled={true} hasContext={false} mcpServerCount={1} onToggle={vi.fn()} />);
    expect(screen.getByText('github')).toBeDefined();
  });

  it('renders toggle as switch role with aria-checked', () => {
    render(<SkillCard name="github" enabled={true} hasContext={false} mcpServerCount={1} onToggle={vi.fn()} />);
    const toggle = screen.getByRole('switch', { name: /github/i });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(toggle.textContent).toBe('[on]');
  });

  it('shows [off] when disabled', () => {
    render(<SkillCard name="github" enabled={false} hasContext={false} mcpServerCount={1} onToggle={vi.fn()} />);
    const toggle = screen.getByRole('switch', { name: /github/i });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.textContent).toBe('[off]');
  });

  it('calls onToggle with inverted state when clicked', () => {
    const onToggle = vi.fn();
    render(<SkillCard name="github" enabled={true} hasContext={false} mcpServerCount={1} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('switch', { name: /github/i }));
    expect(onToggle).toHaveBeenCalledWith('github', false);
  });

  it('shows MCP server count when > 0', () => {
    render(<SkillCard name="github" enabled={true} hasContext={false} mcpServerCount={2} onToggle={vi.fn()} />);
    expect(screen.getByText('2 MCP servers')).toBeDefined();
  });

  it('shows context indicator when hasContext is true', () => {
    render(<SkillCard name="github" enabled={true} hasContext={true} mcpServerCount={1} onToggle={vi.fn()} />);
    expect(screen.getByText('has context')).toBeDefined();
  });
});
