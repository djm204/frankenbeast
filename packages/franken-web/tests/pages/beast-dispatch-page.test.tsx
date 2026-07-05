import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BeastCatalogEntry } from '../../src/lib/beast-api';
import { BeastDispatchPage } from '../../src/pages/beast-dispatch-page';

const catalog: BeastCatalogEntry[] = [
  {
    id: 'design-interview',
    label: 'Design Interview',
    description: 'Collects design details',
    executionModeDefault: 'process',
    interviewPrompts: [
      {
        key: 'designFile',
        prompt: 'Design file path',
        kind: 'file',
        required: true,
      },
      {
        key: 'audience',
        prompt: 'Target audience',
        kind: 'string',
        required: true,
        options: ['Developers', 'Designers'],
      },
    ],
  },
];

function renderDispatchPage(overrides: Partial<React.ComponentProps<typeof BeastDispatchPage>> = {}) {
  return render(
    <BeastDispatchPage
      agentDetail={null}
      agents={[]}
      catalog={catalog}
      disabled={false}
      error={null}
      onDelete={vi.fn()}
      onDispatch={vi.fn()}
      onKill={vi.fn()}
      onRefresh={vi.fn()}
      onRestart={vi.fn()}
      onResume={vi.fn()}
      onSelectAgent={vi.fn()}
      onStart={vi.fn()}
      onStop={vi.fn()}
      selectedAgentId={null}
      {...overrides}
    />,
  );
}

afterEach(cleanup);

describe('BeastDispatchPage', () => {
  it('labels dispatch prompt controls with prompt text and connects validation errors to the invalid fields', () => {
    const onDispatch = vi.fn();
    renderDispatchPage({ onDispatch });

    const designFileInput = screen.getByLabelText('Design file path');
    const audienceSelect = screen.getByLabelText('Target audience');

    fireEvent.click(screen.getByRole('button', { name: 'Launch Design Interview' }));

    expect(onDispatch).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(designFileInput);
    expect(designFileInput.getAttribute('aria-invalid')).toBe('true');
    expect(audienceSelect.getAttribute('aria-invalid')).toBe('true');

    const designFileErrorId = designFileInput.getAttribute('aria-describedby');
    const audienceErrorId = audienceSelect.getAttribute('aria-describedby');

    expect(designFileErrorId).toBeTruthy();
    expect(audienceErrorId).toBeTruthy();
    expect(document.getElementById(designFileErrorId ?? '')?.textContent).toBe('This field is required.');
    expect(document.getElementById(audienceErrorId ?? '')?.textContent).toBe('This field is required.');
  });
});
