export interface DashboardSkill {
  name: string;
  enabled: boolean;
  hasContext: boolean;
  mcpServerCount: number;
}

export interface DashboardSecurity {
  profile: string;
  injectionDetection: boolean;
  piiMasking: boolean;
  outputValidation: boolean;
}

export interface DashboardProvider {
  name: string;
  type: string;
}

export interface DashboardSnapshot {
  skills: DashboardSkill[];
  security: DashboardSecurity;
  providers: DashboardProvider[];
}

export class DashboardApiClient {
  constructor(private readonly baseUrl: string) {}

  async fetchSnapshot(): Promise<DashboardSnapshot> {
    const res = await fetch(`${this.baseUrl}/api/dashboard`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as DashboardSnapshot;
  }

  async toggleSkill(name: string, enabled: boolean): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/skills/${name}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async updateSecurityProfile(profile: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/security`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  subscribeToDashboard(onSnapshot: (snapshot: DashboardSnapshot) => void): () => void {
    const eventSource = new EventSource(`${this.baseUrl}/api/dashboard/events`);
    eventSource.addEventListener('snapshot', (event) => {
      const snapshot = JSON.parse(event.data) as DashboardSnapshot;
      onSnapshot(snapshot);
    });
    return () => eventSource.close();
  }
}
