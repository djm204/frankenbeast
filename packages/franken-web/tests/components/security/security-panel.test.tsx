import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SecurityPanel } from '../../../src/components/security/security-panel';

afterEach(cleanup);

describe('SecurityPanel', () => {
  const defaultProps = {
    profile: 'standard',
    injectionDetection: true,
    piiMasking: true,
    outputValidation: true,
    onProfileChange: vi.fn(),
  };

  it('renders current profile in select', () => {
    render(<SecurityPanel {...defaultProps} />);
    const select = screen.getByRole('combobox');
    expect((select as HTMLSelectElement).value).toBe('standard');
  });

  it('renders feature status indicators', () => {
    render(<SecurityPanel {...defaultProps} />);
    expect(screen.getByText('Injection Detection: [on]')).toBeDefined();
    expect(screen.getByText('PII Masking: [on]')).toBeDefined();
    expect(screen.getByText('Output Validation: [on]')).toBeDefined();
  });

  it('shows [off] for disabled features', () => {
    render(<SecurityPanel {...defaultProps} injectionDetection={false} piiMasking={false} />);
    expect(screen.getByText('Injection Detection: [off]')).toBeDefined();
    expect(screen.getByText('PII Masking: [off]')).toBeDefined();
  });

  it('calls onProfileChange when select changes', () => {
    const onProfileChange = vi.fn();
    render(<SecurityPanel {...defaultProps} onProfileChange={onProfileChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'strict' } });
    expect(onProfileChange).toHaveBeenCalledWith('strict');
  });

  it('renders requireApproval when present', () => {
    render(<SecurityPanel {...defaultProps} requireApproval="destructive" />);
    expect(screen.getByText('Approval Required: destructive')).toBeDefined();
  });

  it('does not render approval line when requireApproval is undefined', () => {
    render(<SecurityPanel {...defaultProps} />);
    expect(screen.queryByText(/Approval Required/)).toBeNull();
  });
});
