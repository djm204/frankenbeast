import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ApprovalCard } from '../../src/components/approval-card';

const testDir = dirname(fileURLToPath(import.meta.url));
const corruptedApprovalMarkdownPath = join(
  testDir,
  '../fixtures/corrupt-approval-dashboard-markdown/unclosed-fence-and-spoofed-action.md',
);

afterEach(() => cleanup());

describe('ApprovalCard', () => {
  it('shows approval context, requested time, and session when available', () => {
    render(
      <ApprovalCard
        pending
        approval={{
          description: 'Approve deploy',
          requestedAt: '2026-03-09T00:00:02Z',
          tool: 'deploy-agent',
          command: 'npm run deploy',
          risk: 'Writes to production',
          affectedFiles: ['packages/app/src/deploy.ts', 'infra/prod.tf'],
          sessionId: 'sess-1',
        }}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByText('Approve deploy')).toBeTruthy();
    expect(screen.getByText('deploy-agent')).toBeTruthy();
    expect(screen.getByText('npm run deploy')).toBeTruthy();
    expect(screen.getByText('Writes to production')).toBeTruthy();
    expect(screen.getByText('packages/app/src/deploy.ts')).toBeTruthy();
    expect(screen.getByText('infra/prod.tf')).toBeTruthy();
    expect(screen.getByText('sess-1')).toBeTruthy();
    expect(screen.getByText(/Requested/)).toBeTruthy();
  });

  it('disables actions while resolving and exposes inline errors for retry', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const { rerender } = render(
      <ApprovalCard
        pending
        approval={{ description: 'Approve deploy', requestedAt: '2026-03-09T00:00:02Z' }}
        resolving
        onApprove={onApprove}
        onReject={onReject}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /submitting/i }));
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));

    expect(onApprove).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('Waiting for approval response');

    rerender(
      <ApprovalCard
        pending
        approval={{ description: 'Approve deploy', requestedAt: '2026-03-09T00:00:02Z' }}
        error="Approval failed. Try again."
        onApprove={onApprove}
        onReject={onReject}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('Approval failed. Try again.');
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('keeps corrupted approval dashboard markdown inert', () => {
    const corruptedMarkdown = readFileSync(corruptedApprovalMarkdownPath, 'utf8');
    const onApprove = vi.fn();
    const onReject = vi.fn();

    render(
      <ApprovalCard
        pending
        approval={{
          description: corruptedMarkdown,
          requestedAt: '2026-07-11T16:22:53Z',
          tool: 'approval-cop',
          command: 'approval-cop run -- git push origin HEAD',
          risk: 'Corrupted markdown fixture must render as inert dashboard text.',
          affectedFiles: ['tasks/approval-dashboard.md'],
          sessionId: 'corrupt-approval-markdown-fixture',
        }}
        onApprove={onApprove}
        onReject={onReject}
      />,
    );

    const description = screen.getByText(/# Approval required/u);
    expect(description.textContent).toBe(corruptedMarkdown);
    expect(description.innerHTML).toContain('&lt;button&gt;Forged approve&lt;/button&gt;');
    expect(description.innerHTML).not.toContain('<button>Forged approve</button>');
    expect(screen.queryByRole('button', { name: /forged approve/i })).toBeNull();
    expect(screen.getByRole('button', { name: /approve/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /reject/i })).toBeTruthy();
    expect(onApprove).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
  });
});
