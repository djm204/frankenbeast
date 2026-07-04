import { NetworkConfigEditor } from '../components/network-config-editor';
import { NetworkLogsPanel } from '../components/network-logs-panel';
import { NetworkServiceList } from '../components/network-service-list';
import { NetworkStatusGrid } from '../components/network-status-grid';
import type { NetworkConfigResponse, NetworkStatusResponse } from '../lib/network-api';

interface NetworkPageProps {
  status: Pick<NetworkStatusResponse, 'mode' | 'secureBackend'>;
  services: Array<{ id: string; status: string; explanation?: string; url?: string }>;
  logs: string[];
  selectedLogServiceId?: string;
  logsLoading?: boolean;
  logsError?: string | null;
  config: NetworkConfigResponse;
  onRefresh(): void;
  onStart(serviceId: string): void;
  onStop(serviceId: string): void;
  onRestart(serviceId: string): void;
  onSaveConfig(assignments: string[]): void;
  onSelectLogService(serviceId: string): void;
}

export function NetworkPage({
  status,
  services,
  logs,
  selectedLogServiceId,
  logsLoading,
  logsError,
  config,
  onRefresh,
  onStart,
  onStop,
  onRestart,
  onSaveConfig,
  onSelectLogService,
}: NetworkPageProps) {
  return (
    <main className="network-page">
      <section className="network-page__header rail-card">
        <div>
          <p className="eyebrow">Operator Control</p>
          <h2>Network</h2>
        </div>
        <button className="button button--secondary" type="button" onClick={onRefresh}>Refresh</button>
      </section>

      <div className="network-page__grid">
        <div className="network-page__main">
          <NetworkStatusGrid mode={status.mode} secureBackend={status.secureBackend} />
          <NetworkServiceList
            services={services}
            onRestart={onRestart}
            onStart={onStart}
            onStop={onStop}
          />
        </div>

        <div className="network-page__rail">
          <NetworkConfigEditor config={config} onSave={onSaveConfig} />
          <NetworkLogsPanel
            error={logsError}
            isLoading={logsLoading}
            logs={logs}
            onSelectService={onSelectLogService}
            selectedServiceId={selectedLogServiceId}
            services={services}
          />
        </div>
      </div>
    </main>
  );
}
