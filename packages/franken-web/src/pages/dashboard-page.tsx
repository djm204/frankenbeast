import { useCallback, useEffect, useRef, useState } from 'react';
import { useDashboardStore } from '../stores/dashboard-store';
import { SkillCatalogBrowser } from '../components/skills/skill-catalog-browser';
import { SecurityPanel } from '../components/security/security-panel';
import { ProviderPanel } from '../components/providers/provider-panel';
import type { DashboardApiClient } from '../lib/dashboard-api';

interface DashboardPageProps {
  client: DashboardApiClient;
}

interface SkillMutationError {
  name: string;
  enabled: boolean;
  message: string;
}

interface SecurityMutationError {
  profile: string;
  message: string;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export function DashboardPage({ client }: DashboardPageProps) {
  const {
    skills,
    security,
    providers,
    loading,
    setSnapshot,
    toggleSkill,
    setSecurityProfile,
    setLoading,
  } = useDashboardStore();
  const mountedRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [skillError, setSkillError] = useState<SkillMutationError | null>(null);
  const [securityError, setSecurityError] = useState<SecurityMutationError | null>(null);

  const loadSnapshot = useCallback(() => {
    setLoadError(null);
    setLoading(true);
    client.fetchSnapshot()
      .then((snap) => {
        if (!mountedRef.current) return;
        setSnapshot(snap);
      })
      .catch((error) => {
        if (!mountedRef.current) return;
        setLoadError(`Unable to load dashboard. ${describeError(error)}`);
        setLoading(false);
      });
  }, [client, setLoading, setSnapshot]);

  useEffect(() => {
    // Note: SSE snapshot events replace full store state. If the server pushes
    // a snapshot while an optimistic update is in-flight, the server state wins.
    // Currently only the initial snapshot is pushed (heartbeats carry no data).
    mountedRef.current = true;
    loadSnapshot();
    let unsub: (() => void) | undefined;
    client.subscribeToDashboard((snap) => {
      if (!mountedRef.current) return;
      setLoadError(null);
      setSnapshot(snap);
    })
      .then((nextUnsub) => {
        if (!mountedRef.current) {
          nextUnsub();
          return;
        }
        unsub = nextUnsub;
      })
      .catch((error) => {
        if (!mountedRef.current) return;
        setLoadError(`Unable to stream dashboard updates. ${describeError(error)}`);
      });
    return () => { mountedRef.current = false; unsub?.(); };
  }, [client, loadSnapshot, setSnapshot]);

  const handleToggleSkill = useCallback((name: string, enabled: boolean) => {
    toggleSkill(name);
    setSkillError(null);
    client.toggleSkill(name, enabled).catch((error) => {
      if (!mountedRef.current) return;
      toggleSkill(name);
      setSkillError({
        name,
        enabled,
        message: `Could not ${enabled ? 'enable' : 'disable'} ${name}; the switch was rolled back. ${describeError(error)}`,
      });
    });
  }, [client, toggleSkill]);

  const handleSecurityProfileChange = useCallback((profile: string) => {
    const previousProfile = security?.profile;
    setSecurityProfile(profile);
    setSecurityError(null);
    client.updateSecurityProfile(profile).catch((error) => {
      if (!mountedRef.current) return;
      if (previousProfile) setSecurityProfile(previousProfile);
      setSecurityError({
        profile,
        message: `Could not save security profile ${profile}; the previous profile was restored. ${describeError(error)}`,
      });
    });
  }, [client, security?.profile, setSecurityProfile]);

  if (loading) return <div className="dashboard-loading">Loading dashboard...</div>;

  return (
    <div className="dashboard-page">
      <h2>Dashboard</h2>
      {(loadError || skillError || securityError) && (
        <section className="dashboard-alerts" aria-label="Dashboard errors" aria-live="assertive">
          {loadError && (
            <div className="analytics-alert dashboard-alert" role="alert">
              <span>{loadError}</span>
              <button type="button" onClick={loadSnapshot}>Retry loading dashboard</button>
            </div>
          )}
          {skillError && (
            <div className="analytics-alert dashboard-alert" role="alert">
              <span>{skillError.message}</span>
              <button type="button" onClick={() => handleToggleSkill(skillError.name, skillError.enabled)}>
                Retry {skillError.enabled ? 'enabling' : 'disabling'} {skillError.name}
              </button>
            </div>
          )}
          {securityError && (
            <div className="analytics-alert dashboard-alert" role="alert">
              <span>{securityError.message}</span>
              <button type="button" onClick={() => handleSecurityProfileChange(securityError.profile)}>
                Retry saving {securityError.profile}
              </button>
            </div>
          )}
        </section>
      )}
      <div className="dashboard-page__grid">
        <SkillCatalogBrowser
          skills={skills}
          onToggle={handleToggleSkill}
        />
        {security && (
          <SecurityPanel
            profile={security.profile}
            injectionDetection={security.injectionDetection}
            piiMasking={security.piiMasking}
            outputValidation={security.outputValidation}
            requireApproval={security.requireApproval}
            onProfileChange={handleSecurityProfileChange}
          />
        )}
        <ProviderPanel providers={providers} />
      </div>
    </div>
  );
}
