import { create } from 'zustand';
import type { DashboardSkill, DashboardSecurity, DashboardProvider, DashboardAvailability, DashboardMaintenanceMode } from '../lib/dashboard-api';

interface DashboardStore {
  skills: DashboardSkill[];
  security: DashboardSecurity | null;
  providers: DashboardProvider[];
  availability: DashboardAvailability | null;
  maintenance: DashboardMaintenanceMode | null;
  loading: boolean;
  error: string | null;

  setSnapshot: (snapshot: { skills: DashboardSkill[]; security: DashboardSecurity; providers: DashboardProvider[]; availability?: DashboardAvailability | undefined; maintenance?: DashboardMaintenanceMode | undefined }) => void;
  toggleSkill: (name: string) => void;
  setSkillEnabled: (name: string, enabled: boolean) => void;
  setSecurityProfile: (profile: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  skills: [] as DashboardSkill[],
  security: null as DashboardSecurity | null,
  providers: [] as DashboardProvider[],
  availability: null as DashboardAvailability | null,
  maintenance: null as DashboardMaintenanceMode | null,
  loading: true,
  error: null as string | null,
};

export const useDashboardStore = create<DashboardStore>()((set) => ({
  ...initialState,

  setSnapshot: (snapshot) =>
    set((current) => ({
      skills: snapshot.skills,
      security: snapshot.security,
      providers: snapshot.providers,
      availability: snapshot.availability ?? null,
      maintenance: snapshot.maintenance ?? current.maintenance,
      loading: false,
      error: null,
    })),

  toggleSkill: (name) =>
    set((s) => ({
      skills: s.skills.map((sk) =>
        sk.name === name ? { ...sk, enabled: !sk.enabled } : sk,
      ),
    })),

  setSkillEnabled: (name, enabled) =>
    set((s) => ({
      skills: s.skills.map((sk) =>
        sk.name === name ? { ...sk, enabled } : sk,
      ),
    })),

  setSecurityProfile: (profile) =>
    set((s) => ({
      security: s.security ? { ...s.security, profile } : null,
    })),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set(error === null ? { error } : { error, loading: false }),

  reset: () => set(initialState),
}));
