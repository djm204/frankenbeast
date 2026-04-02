import { describe, it, expect, beforeEach } from 'vitest';
import { useDashboardStore } from './dashboard-store';
import type { DashboardSnapshot } from '../lib/dashboard-api';

function makeMockSnapshot(): DashboardSnapshot {
  return {
    skills: [
      { name: 'code-review', enabled: true, hasContext: true, mcpServerCount: 1 },
      { name: 'web-search', enabled: false, hasContext: false, mcpServerCount: 0 },
    ],
    security: {
      profile: 'standard',
      injectionDetection: true,
      piiMasking: false,
      outputValidation: true,
    },
    providers: [
      { name: 'anthropic', type: 'llm', available: true, failoverOrder: 0 },
    ],
  };
}

describe('dashboard-store', () => {
  beforeEach(() => {
    useDashboardStore.getState().reset();
  });

  it('initializes with empty state and loading true', () => {
    const state = useDashboardStore.getState();
    expect(state.skills).toEqual([]);
    expect(state.security).toBeNull();
    expect(state.providers).toEqual([]);
    expect(state.loading).toBe(true);
  });

  describe('setSnapshot', () => {
    it('populates skills, security, and providers from snapshot', () => {
      const snapshot = makeMockSnapshot();
      useDashboardStore.getState().setSnapshot(snapshot);

      const state = useDashboardStore.getState();
      expect(state.skills).toEqual(snapshot.skills);
      expect(state.security).toEqual(snapshot.security);
      expect(state.providers).toEqual(snapshot.providers);
    });

    it('sets loading to false', () => {
      useDashboardStore.getState().setSnapshot(makeMockSnapshot());
      expect(useDashboardStore.getState().loading).toBe(false);
    });
  });

  describe('toggleSkill', () => {
    it('flips enabled flag for matching skill', () => {
      useDashboardStore.getState().setSnapshot(makeMockSnapshot());

      useDashboardStore.getState().toggleSkill('code-review');
      const skills = useDashboardStore.getState().skills;
      const codeReview = skills.find((s) => s.name === 'code-review');
      expect(codeReview?.enabled).toBe(false);
    });

    it('does not affect other skills', () => {
      useDashboardStore.getState().setSnapshot(makeMockSnapshot());

      useDashboardStore.getState().toggleSkill('code-review');
      const skills = useDashboardStore.getState().skills;
      const webSearch = skills.find((s) => s.name === 'web-search');
      expect(webSearch?.enabled).toBe(false); // was already false
    });

    it('toggles back to original state on double toggle', () => {
      useDashboardStore.getState().setSnapshot(makeMockSnapshot());

      useDashboardStore.getState().toggleSkill('code-review');
      useDashboardStore.getState().toggleSkill('code-review');
      const skills = useDashboardStore.getState().skills;
      const codeReview = skills.find((s) => s.name === 'code-review');
      expect(codeReview?.enabled).toBe(true);
    });
  });

  describe('setSecurityProfile', () => {
    it('updates the profile on existing security', () => {
      useDashboardStore.getState().setSnapshot(makeMockSnapshot());

      useDashboardStore.getState().setSecurityProfile('strict');
      const security = useDashboardStore.getState().security;
      expect(security?.profile).toBe('strict');
    });

    it('preserves other security fields', () => {
      useDashboardStore.getState().setSnapshot(makeMockSnapshot());

      useDashboardStore.getState().setSecurityProfile('permissive');
      const security = useDashboardStore.getState().security;
      expect(security?.injectionDetection).toBe(true);
      expect(security?.piiMasking).toBe(false);
      expect(security?.outputValidation).toBe(true);
    });

    it('is a no-op when security is null', () => {
      // security is null in initial state
      useDashboardStore.getState().setSecurityProfile('strict');
      expect(useDashboardStore.getState().security).toBeNull();
    });
  });

  describe('setLoading', () => {
    it('sets loading state', () => {
      useDashboardStore.getState().setLoading(false);
      expect(useDashboardStore.getState().loading).toBe(false);

      useDashboardStore.getState().setLoading(true);
      expect(useDashboardStore.getState().loading).toBe(true);
    });
  });

  describe('reset', () => {
    it('restores initial state', () => {
      useDashboardStore.getState().setSnapshot(makeMockSnapshot());
      useDashboardStore.getState().reset();

      const state = useDashboardStore.getState();
      expect(state.skills).toEqual([]);
      expect(state.security).toBeNull();
      expect(state.providers).toEqual([]);
      expect(state.loading).toBe(true);
    });
  });
});
