import { useCallback, useEffect, useRef, useState } from 'react';
import { useDashboardStore } from '../stores/dashboard-store';
import { SkillCatalogBrowser } from '../components/skills/skill-catalog-browser';
import { SecurityPanel } from '../components/security/security-panel';
import { ProviderPanel } from '../components/providers/provider-panel';
import type { DashboardApiClient, DashboardSnapshot } from '../lib/dashboard-api';

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
  const loadSequenceRef = useRef(0);
  const skillMutationSequenceRef = useRef<Record<string, number>>({});
  const securityMutationSequenceRef = useRef(0);
  const confirmedSnapshotRef = useRef<DashboardSnapshot | null>(null);
  const serverSnapshotVersionRef = useRef(0);
  const confirmedSkillMutationSequenceRef = useRef<Record<string, number>>({});
  const confirmedSecurityMutationSequenceRef = useRef(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [skillError, setSkillError] = useState<SkillMutationError | null>(null);
  const [securityError, setSecurityError] = useState<SecurityMutationError | null>(null);

  const setConfirmedSnapshot = useCallback((snapshot: DashboardSnapshot) => {
    confirmedSnapshotRef.current = snapshot;
    setSnapshot(snapshot);
  }, [setSnapshot]);

  const applyServerSnapshot = useCallback((snapshot: DashboardSnapshot) => {
    serverSnapshotVersionRef.current += 1;
    setConfirmedSnapshot(snapshot);
  }, [setConfirmedSnapshot]);

  const restoreConfirmedSnapshot = useCallback(() => {
    const confirmedSnapshot = confirmedSnapshotRef.current;
    if (confirmedSnapshot) setConfirmedSnapshot(confirmedSnapshot);
  }, [setConfirmedSnapshot]);

  const confirmSkillState = useCallback((name: string, enabled: boolean) => {
    const confirmedSnapshot = confirmedSnapshotRef.current;
    if (!confirmedSnapshot) return;
    setConfirmedSnapshot({
      ...confirmedSnapshot,
      skills: confirmedSnapshot.skills.map((skill) => (
        skill.name === name ? { ...skill, enabled } : skill
      )),
    });
  }, [setConfirmedSnapshot]);

  const confirmSecurityProfile = useCallback((profile: string) => {
    const confirmedSnapshot = confirmedSnapshotRef.current;
    if (!confirmedSnapshot) return;
    setConfirmedSnapshot({
      ...confirmedSnapshot,
      security: { ...confirmedSnapshot.security, profile },
    });
  }, [setConfirmedSnapshot]);

  const loadSnapshot = useCallback(() => {
    const sequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = sequence;
    setLoadError(null);
    if (!confirmedSnapshotRef.current) setLoading(true);
    client.fetchSnapshot()
      .then((snap) => {
        if (!mountedRef.current || loadSequenceRef.current !== sequence) return;
        applyServerSnapshot(snap);
      })
      .catch((error) => {
        if (!mountedRef.current || loadSequenceRef.current !== sequence) return;
        if (confirmedSnapshotRef.current) {
          setLoading(false);
          return;
        }
        setLoadError(`Unable to load dashboard. ${describeError(error)}`);
        setLoading(false);
      });
  }, [applyServerSnapshot, client, setLoading]);

  useEffect(() => {
    // Note: SSE snapshot events replace full store state. If the server pushes
    // a snapshot while an optimistic update is in-flight, the server state wins.
    // Currently only the initial snapshot is pushed (heartbeats carry no data).
    mountedRef.current = true;
    if (!confirmedSnapshotRef.current && security) {
      setConfirmedSnapshot({ skills, security, providers });
    }
    loadSnapshot();
    let unsub: (() => void) | undefined;
    client.subscribeToDashboard((snap) => {
      if (!mountedRef.current) return;
      setLoadError(null);
      applyServerSnapshot(snap);
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
  }, [applyServerSnapshot, client, loadSnapshot, setConfirmedSnapshot]);

  const handleToggleSkill = useCallback((name: string, enabled: boolean) => {
    const sequence = (skillMutationSequenceRef.current[name] ?? 0) + 1;
    const serverSnapshotVersion = serverSnapshotVersionRef.current;
    skillMutationSequenceRef.current[name] = sequence;
    toggleSkill(name);
    setSkillError(null);
    client.toggleSkill(name, enabled)
      .then(() => {
        if (!mountedRef.current) return;
        if (serverSnapshotVersionRef.current !== serverSnapshotVersion) return;
        if (sequence < (confirmedSkillMutationSequenceRef.current[name] ?? 0)) return;
        confirmedSkillMutationSequenceRef.current[name] = sequence;
        confirmSkillState(name, enabled);
      })
      .catch((error) => {
        if (!mountedRef.current || skillMutationSequenceRef.current[name] !== sequence) return;
        restoreConfirmedSnapshot();
        setSkillError({
          name,
          enabled,
          message: `Could not ${enabled ? 'enable' : 'disable'} ${name}; the switch was restored to the latest confirmed dashboard state. ${describeError(error)}`,
        });
      });
  }, [client, confirmSkillState, restoreConfirmedSnapshot, toggleSkill]);

  const handleSecurityProfileChange = useCallback((profile: string) => {
    const sequence = securityMutationSequenceRef.current + 1;
    const serverSnapshotVersion = serverSnapshotVersionRef.current;
    securityMutationSequenceRef.current = sequence;
    setSecurityProfile(profile);
    setSecurityError(null);
    client.updateSecurityProfile(profile)
      .then(() => {
        if (!mountedRef.current) return;
        if (serverSnapshotVersionRef.current !== serverSnapshotVersion) return;
        if (sequence < confirmedSecurityMutationSequenceRef.current) return;
        confirmedSecurityMutationSequenceRef.current = sequence;
        confirmSecurityProfile(profile);
      })
      .catch((error) => {
        if (!mountedRef.current || securityMutationSequenceRef.current !== sequence) return;
        restoreConfirmedSnapshot();
        setSecurityError({
          profile,
          message: `Could not save security profile ${profile}; the profile was restored to the latest confirmed dashboard state. ${describeError(error)}`,
        });
      });
  }, [client, confirmSecurityProfile, restoreConfirmedSnapshot, setSecurityProfile]);

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
