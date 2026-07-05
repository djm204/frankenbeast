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
  requireApproval?: string;
}

export interface DashboardProvider {
  name: string;
  type: string;
  available: boolean;
  failoverOrder: number;
}

export interface DashboardSnapshot {
  skills: DashboardSkill[];
  security: DashboardSecurity;
  providers: DashboardProvider[];
}

export class DashboardApiClient {
  constructor(
    private readonly baseUrl: string,
  ) {}

  async fetchSnapshot(): Promise<DashboardSnapshot> {
    const res = await fetch(`${this.baseUrl}/api/dashboard`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as DashboardSnapshot;
  }

  async toggleSkill(name: string, enabled: boolean): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/skills/${encodeURIComponent(name)}`, {
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

  // NOTE: EventSource cannot attach an Authorization header, so this stream is
  // not yet usable behind the operator-token gate. The repo's SSE-compatible
  // auth is the short-lived ticket pattern (SseConnectionTicketStore +
  // `/v1/beasts/events/ticket`, see beast-sse-routes.ts), NOT the raw
  // long-lived operator token in the URL (which would leak the secret into
  // access logs). The dashboard page is not currently mounted in the live
  // shell (not in ChatShell ROUTES); wire ticket-based auth here when it is.
  subscribeToDashboard(onSnapshot: (snapshot: DashboardSnapshot) => void): () => void {
    // EventSource may be mocked as a plain function in tests; prefer browser
    // constructor semantics, then fall back to callable test doubles.
    const EventSourceCtor: any = (globalThis as any).EventSource;
    const url = `${this.baseUrl}/api/dashboard/events`;
    let eventSource: EventSource;
    try {
      eventSource = new EventSourceCtor(url);
    } catch {
      eventSource = EventSourceCtor(url);
    }
    eventSource.addEventListener('snapshot', (event: any) => {
      const snapshot = JSON.parse(event.data) as DashboardSnapshot;
      onSnapshot(snapshot);
    });
    return () => eventSource.close();
  }

}
