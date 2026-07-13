import { create } from 'zustand';
import type { DashboardSkill, DashboardSecurity, DashboardProvider } from '../lib/dashboard-api';

interface DashboardStore {
  skills: DashboardSkill[];
  security: DashboardSecurity | null;
  providers: DashboardProvider[];
  loading: boolean;
  error: string | null;

  setSnapshot: (snapshot: { skills: DashboardSkill[]; security: DashboardSecurity; providers: DashboardProvider[] }) => void;
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
  loading: true,
  error: null as string | null,
};

export const useDashboardStore = create<DashboardStore>()((set) => ({
  ...initialState,

  setSnapshot: (snapshot) =>
    set({
      skills: snapshot.skills,
      security: snapshot.security,
      providers: snapshot.providers,
      loading: false,
      error: null,
    }),

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
