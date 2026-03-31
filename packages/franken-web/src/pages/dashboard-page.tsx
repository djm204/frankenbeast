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
    // Note: SSE snapshot events replace full store state. If the server pushes
    // a snapshot while an optimistic update is in-flight, the server state wins.
    // Currently only the initial snapshot is pushed (heartbeats carry no data).
    let stale = false;
    client.fetchSnapshot()
      .then((snap) => { if (!stale) setSnapshot(snap); })
      .catch(console.error);
    const unsub = client.subscribeToDashboard((snap) => { if (!stale) setSnapshot(snap); });
    return () => { stale = true; unsub(); };
  }, [client]); // eslint-disable-line react-hooks/exhaustive-deps — setSnapshot is stable (Zustand v5)

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
            requireApproval={security.requireApproval}
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
