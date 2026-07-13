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
  model?: string;
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
    const res = await fetch(`${this.baseUrl}/api/skills/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async updateSecurityProfile(profile: string): Promise<DashboardSecurity> {
    const res = await fetch(`${this.baseUrl}/api/security`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as DashboardSecurity;
  }

  // NOTE: EventSource cannot attach an Authorization header. Browser clients
  // first mint a short-lived, one-shot stream ticket with normal authenticated
  // fetch, then put only that ticket in the EventSource URL.
  async subscribeToDashboard(
    onSnapshot: (snapshot: DashboardSnapshot) => void,
    onError?: (error: Error) => void,
  ): Promise<() => void> {
    let eventSource: EventSource | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const closeActiveSource = () => {
      eventSource?.close();
      eventSource = undefined;
    };

    const scheduleReconnect = () => {
      if (closed || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        void connect().catch((err) => {
          if (closed) return;
          const error = toError(err);
          console.error(error);
          onError?.(new Error(`Dashboard stream reconnect failed. ${error.message}`));
          scheduleReconnect();
        });
      }, 1_000);
    };

    const connect = async () => {
      const ticketRes = await fetch(`${this.baseUrl}/api/dashboard/events/ticket`, { method: 'POST' });
      if (!ticketRes.ok) throw new Error(`HTTP ${ticketRes.status}`);
      const { ticket } = await ticketRes.json() as { ticket?: string | null };

      if (closed) return;

      // EventSource may be mocked as a plain function in tests; prefer browser
      // constructor semantics, then fall back to callable test doubles.
      const EventSourceCtor: any = (globalThis as any).EventSource;
      const url = ticket
        ? `${this.baseUrl}/api/dashboard/events?${new URLSearchParams({ ticket }).toString()}`
        : `${this.baseUrl}/api/dashboard/events`;
      let nextEventSource: EventSource;
      try {
        nextEventSource = new EventSourceCtor(url);
      } catch {
        nextEventSource = EventSourceCtor(url);
      }
      eventSource = nextEventSource;
      nextEventSource.addEventListener('snapshot', (event: any) => {
        try {
          const snapshot = JSON.parse(event.data) as DashboardSnapshot;
          onSnapshot(snapshot);
        } catch (error) {
          onError?.(toError(error));
        }
      });
      nextEventSource.addEventListener('error', () => {
        if (!closed) {
          onError?.(new Error('Dashboard stream connection lost. Reconnecting.'));
        }
        closeActiveSource();
        scheduleReconnect();
      });
    };

    await connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      closeActiveSource();
    };
  }

}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
