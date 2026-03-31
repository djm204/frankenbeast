import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SkillCatalogBrowser } from '../../../src/components/skills/skill-catalog-browser';

afterEach(cleanup);

const skills = [
  { name: 'github', enabled: true, hasContext: false, mcpServerCount: 1 },
  { name: 'linear', enabled: false, hasContext: true, mcpServerCount: 1 },
  { name: 'sentry', enabled: true, hasContext: false, mcpServerCount: 2 },
];

describe('SkillCatalogBrowser', () => {
  it('renders all skills', () => {
    render(<SkillCatalogBrowser skills={skills} onToggle={vi.fn()} />);
    expect(screen.getByText('github')).toBeDefined();
    expect(screen.getByText('linear')).toBeDefined();
    expect(screen.getByText('sentry')).toBeDefined();
  });

  it('filters skills by name', () => {
    render(<SkillCatalogBrowser skills={skills} onToggle={vi.fn()} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'git' } });
    expect(screen.getByText('github')).toBeDefined();
    expect(screen.queryByText('linear')).toBeNull();
    expect(screen.queryByText('sentry')).toBeNull();
  });

  it('shows empty message when no skills match filter', () => {
    render(<SkillCatalogBrowser skills={skills} onToggle={vi.fn()} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'nonexistent' } });
    expect(screen.getByText('No skills found.')).toBeDefined();
  });

  it('shows empty message when skills array is empty', () => {
    render(<SkillCatalogBrowser skills={[]} onToggle={vi.fn()} />);
    expect(screen.getByText('No skills found.')).toBeDefined();
  });
});
