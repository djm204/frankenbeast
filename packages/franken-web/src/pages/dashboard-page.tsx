import { useEffect } from 'react';
import { useDashboardStore } from '../stores/dashboard-store';
import { SkillCatalogBrowser } from '../components/skills/skill-catalog-browser';
import { SecurityPanel } from '../components/security/security-panel';
import { ProviderPanel } from '../components/providers/provider-panel';
import type { DashboardApiClient } from '../lib/dashboard-api';

interface DashboardPageProps {
  client: DashboardApiClient;
}

export function DashboardPage({ client }: DashboardPageProps) {
  const { skills, security, providers, loading, setSnapshot, toggleSkill, setSecurityProfile } =
    useDashboardStore();

  useEffect(() => {
    client.fetchSnapshot().then(setSnapshot).catch(console.error);
    const unsub = client.subscribeToDashboard(setSnapshot);
    return unsub;
  }, [client, setSnapshot]);

  if (loading) return <div className="dashboard-loading">Loading dashboard...</div>;

  return (
    <div className="dashboard-page">
      <h2>Dashboard</h2>
      <div className="dashboard-page__grid">
        <SkillCatalogBrowser
          skills={skills}
          onToggle={(name, enabled) => {
            toggleSkill(name);
            client.toggleSkill(name, enabled).catch(console.error);
          }}
        />
        {security && (
          <SecurityPanel
            profile={security.profile}
            injectionDetection={security.injectionDetection}
            piiMasking={security.piiMasking}
            outputValidation={security.outputValidation}
            onProfileChange={(profile) => {
              setSecurityProfile(profile);
              client.updateSecurityProfile(profile).catch(console.error);
            }}
          />
        )}
        <ProviderPanel providers={providers} />
      </div>
    </div>
  );
}
