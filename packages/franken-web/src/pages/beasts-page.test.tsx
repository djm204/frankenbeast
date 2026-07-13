// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BeastsPage } from './beasts-page';
import { useBeastStore } from '../stores/beast-store';
import { useDashboardStore } from '../stores/dashboard-store';
import type { DashboardApiClient, DashboardSnapshot } from '../lib/dashboard-api';

const snapshot: DashboardSnapshot = {
  skills: [],
  security: {
    profile: 'standard',
    injectionDetection: true,
    piiMasking: true,
    outputValidation: true,
  },
  providers: [
    {
      name: 'openai',
      type: 'openai-api',
      available: true,
      failoverOrder: 0,
      model: 'gpt-4.1',
    },
  ],
};

function renderBeastsPage(
  dashboardClient: DashboardApiClient,
  overrides: Partial<ComponentProps<typeof BeastsPage>> = {},
) {
  return render(
    <BeastsPage
      agents={[]}
      agentDetail={null}
      catalog={[]}
      runs={[]}
      disabled={false}
      error={null}
      logs={[]}
      selectedAgentId={null}
      dashboardClient={dashboardClient}
      onClose={() => undefined}
      onLaunch={vi.fn().mockResolvedValue(undefined)}
      onDelete={() => undefined}
      onKill={() => undefined}
      onRestart={() => undefined}
      onResume={() => undefined}
      onSaveAgentConfig={vi.fn().mockResolvedValue(undefined)}
      onSelectAgent={() => undefined}
      onStart={() => undefined}
      onStop={() => undefined}
      {...overrides}
    />,
  );
}

describe('BeastsPage', () => {
  afterEach(() => {
    cleanup();
    useBeastStore.getState().resetWizard();
    useDashboardStore.getState().reset();
  });

  it('loads the dashboard provider snapshot before showing wizard model selectors', async () => {
    const dashboardClient = {
      fetchSnapshot: vi.fn().mockResolvedValue(snapshot),
    } as unknown as DashboardApiClient;

    renderBeastsPage(dashboardClient);

    fireEvent.click(screen.getByRole('button', { name: '+ Create Agent' }));
    await waitFor(() => expect(dashboardClient.fetchSnapshot).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle form mode' }));

    expect(await screen.findByText('openai')).toBeTruthy();
    fireEvent.change(screen.getAllByLabelText('Provider')[0]!, { target: { value: 'openai' } });
    expect(screen.getByText('gpt-4.1')).toBeTruthy();
  });

  it('displays actionable backend launch errors from Beast API failures', async () => {
    const dashboardClient = {
      fetchSnapshot: vi.fn().mockResolvedValue(snapshot),
    } as unknown as DashboardApiClient;
    const onLaunch = vi.fn().mockRejectedValue(new Error(
      'Provider is required before launching an agent. (HTTP 400, VALIDATION_FAILED)',
    ));

    renderBeastsPage(dashboardClient, { onLaunch });
    fireEvent.click(screen.getByRole('button', { name: '+ Create Agent' }));

    act(() => {
      useBeastStore.setState({
        wizardMode: 'form',
        wizardStep: 7,
        highestCompleted: 7,
        stepValues: {
          0: { name: 'Validation Agent' },
          1: { workflowType: 'design-interview', goal: 'Ship a fix', outputPath: 'docs/fix.md' },
        },
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Launch Agent' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Provider is required before launching an agent.');
    expect(alert.textContent).toContain('HTTP 400, VALIDATION_FAILED');
    expect(onLaunch).toHaveBeenCalledTimes(1);
  });
});
