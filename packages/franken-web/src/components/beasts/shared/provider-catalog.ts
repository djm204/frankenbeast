import type { DashboardProvider } from '../../../lib/dashboard-api';
import type { ProviderOption } from './provider-model-select';

export function dashboardProvidersToModelOptions(providers: readonly DashboardProvider[]): ProviderOption[] {
  return [...providers]
    .filter((provider) => provider.type === 'llm' || provider.type.endsWith('-api') || provider.type.endsWith('-cli'))
    .sort((a, b) => a.failoverOrder - b.failoverOrder)
    .map((provider) => ({
      id: provider.name,
      name: provider.name,
      models: provider.model ? [{ id: provider.model, name: provider.model }] : [],
    }));
}
