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
    setSkillEnabled,
    setSecurityProfile,
    setLoading,
  } = useDashboardStore();
  const mountedRef = useRef(false);
  const clientGenerationRef = useRef(0);
  const loadSequenceRef = useRef(0);
  const skillMutationSequenceRef = useRef<Record<string, number>>({});
  const securityMutationSequenceRef = useRef(0);
  const confirmedSnapshotRef = useRef<DashboardSnapshot | null>(null);
  const serverSnapshotVersionRef = useRef(0);
  const confirmedSkillMutationSequenceRef = useRef<Record<string, number>>({});
  const confirmedSecurityMutationSequenceRef = useRef(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [skillErrors, setSkillErrors] = useState<Record<string, SkillMutationError>>({});
  const [securityError, setSecurityError] = useState<SecurityMutationError | null>(null);

  const setConfirmedSnapshot = useCallback((snapshot: DashboardSnapshot, applyToStore = true) => {
    confirmedSnapshotRef.current = snapshot;
    if (applyToStore) setSnapshot(snapshot);
  }, [setSnapshot]);

  const applyServerSnapshot = useCallback((snapshot: DashboardSnapshot) => {
    serverSnapshotVersionRef.current += 1;
    setConfirmedSnapshot(snapshot);
    setSkillErrors((currentErrors) => Object.fromEntries(
      Object.entries(currentErrors).filter(([name, error]) => {
        const skill = snapshot.skills.find((candidate) => candidate.name === name);
        return !skill || skill.enabled !== error.enabled;
      }),
    ));
    setSecurityError((currentError) => (
      currentError && snapshot.security.profile === currentError.profile ? null : currentError
    ));
  }, [setConfirmedSnapshot]);

  const confirmSkillState = useCallback((name: string, enabled: boolean, applyToStore = true) => {
    const confirmedSnapshot = confirmedSnapshotRef.current;
    if (!confirmedSnapshot) return;
    setConfirmedSnapshot({
      ...confirmedSnapshot,
      skills: confirmedSnapshot.skills.map((skill) => (
        skill.name === name ? { ...skill, enabled } : skill
      )),
    }, applyToStore);
  }, [setConfirmedSnapshot]);

  const confirmSecurityProfile = useCallback((profile: string, applyToStore = true) => {
    const confirmedSnapshot = confirmedSnapshotRef.current;
    if (!confirmedSnapshot) return;
    setConfirmedSnapshot({
      ...confirmedSnapshot,
      security: { ...confirmedSnapshot.security, profile },
    }, applyToStore);
  }, [setConfirmedSnapshot]);

  const restoreSkillState = useCallback((name: string) => {
    const confirmedSnapshot = confirmedSnapshotRef.current;
    const confirmedSkill = confirmedSnapshot?.skills.find((skill) => skill.name === name);
    if (!confirmedSnapshot || !confirmedSkill) return;
    const currentSnapshot = useDashboardStore.getState();
    setSnapshot({
      skills: currentSnapshot.skills.map((skill) => (skill.name === name ? confirmedSkill : skill)),
      security: currentSnapshot.security ?? confirmedSnapshot.security,
      providers: currentSnapshot.providers,
    });
  }, [setSnapshot]);

  const restoreSecurityProfile = useCallback(() => {
    const confirmedProfile = confirmedSnapshotRef.current?.security.profile;
    if (confirmedProfile) setSecurityProfile(confirmedProfile);
  }, [setSecurityProfile]);

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
    clientGenerationRef.current += 1;
    const subscriptionGeneration = clientGenerationRef.current;
    if (!confirmedSnapshotRef.current && security) {
      setConfirmedSnapshot({ skills, security, providers });
    }
    loadSnapshot();
    let unsub: (() => void) | undefined;
    client.subscribeToDashboard((snap) => {
      if (!mountedRef.current) return;
      if (clientGenerationRef.current !== subscriptionGeneration) return;
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
    const clientGeneration = clientGenerationRef.current;
    skillMutationSequenceRef.current[name] = sequence;
    setSkillEnabled(name, enabled);
    setSkillErrors((currentErrors) => {
      const { [name]: _cleared, ...remainingErrors } = currentErrors;
      return remainingErrors;
    });
    client.toggleSkill(name, enabled)
      .then(() => {
        if (!mountedRef.current) return;
        if (clientGenerationRef.current !== clientGeneration) return;
        if (serverSnapshotVersionRef.current !== serverSnapshotVersion) return;
        if (sequence < (confirmedSkillMutationSequenceRef.current[name] ?? 0)) return;
        confirmedSkillMutationSequenceRef.current[name] = sequence;
        const isLatestSkillRequest = skillMutationSequenceRef.current[name] === sequence;
        confirmSkillState(name, enabled, isLatestSkillRequest);
      })
      .catch((error) => {
        if (!mountedRef.current || clientGenerationRef.current !== clientGeneration || skillMutationSequenceRef.current[name] !== sequence) return;
        restoreSkillState(name);
        setSkillErrors((currentErrors) => ({
          ...currentErrors,
          [name]: {
            name,
            enabled,
            message: `Could not ${enabled ? 'enable' : 'disable'} ${name}; the switch was restored to the latest confirmed dashboard state. ${describeError(error)}`,
          },
        }));
      });
  }, [client, confirmSkillState, restoreSkillState, setSkillEnabled]);

  const handleSecurityProfileChange = useCallback((profile: string) => {
    const sequence = securityMutationSequenceRef.current + 1;
    const serverSnapshotVersion = serverSnapshotVersionRef.current;
    const clientGeneration = clientGenerationRef.current;
    securityMutationSequenceRef.current = sequence;
    setSecurityProfile(profile);
    setSecurityError(null);
    client.updateSecurityProfile(profile)
      .then(() => {
        if (!mountedRef.current) return;
        if (clientGenerationRef.current !== clientGeneration) return;
        if (serverSnapshotVersionRef.current !== serverSnapshotVersion) return;
        if (sequence < confirmedSecurityMutationSequenceRef.current) return;
        confirmedSecurityMutationSequenceRef.current = sequence;
        const isLatestSecurityRequest = securityMutationSequenceRef.current === sequence;
        confirmSecurityProfile(profile, isLatestSecurityRequest);
      })
      .catch((error) => {
        if (!mountedRef.current || clientGenerationRef.current !== clientGeneration || securityMutationSequenceRef.current !== sequence) return;
        restoreSecurityProfile();
        setSecurityError({
          profile,
          message: `Could not save security profile ${profile}; the profile was restored to the latest confirmed dashboard state. ${describeError(error)}`,
        });
      });
  }, [client, confirmSecurityProfile, restoreSecurityProfile, setSecurityProfile]);

  if (loading) return <div className="dashboard-loading">Loading dashboard...</div>;

  return (
    <div className="dashboard-page">
      <h2>Dashboard</h2>
      {(loadError || Object.keys(skillErrors).length > 0 || securityError) && (
        <section className="dashboard-alerts" aria-label="Dashboard errors" aria-live="assertive">
          {loadError && (
            <div className="analytics-alert dashboard-alert" role="alert">
              <span>{loadError}</span>
              <button type="button" onClick={loadSnapshot}>Retry loading dashboard</button>
            </div>
          )}
          {Object.values(skillErrors).map((skillError) => (
            <div className="analytics-alert dashboard-alert" role="alert" key={skillError.name}>
              <span>{skillError.message}</span>
              <button type="button" onClick={() => handleToggleSkill(skillError.name, skillError.enabled)}>
                Retry {skillError.enabled ? 'enabling' : 'disabling'} {skillError.name}
              </button>
            </div>
          ))}
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
