import { useState } from 'react';

interface NetworkServiceItem {
  id: string;
  status: string;
  explanation?: string;
  url?: string;
  inProcess?: boolean;
  channels?: Record<string, boolean>;
}

interface NetworkServiceListProps {
  services: NetworkServiceItem[];
  onStart(serviceId: string): Promise<void> | void;
  onStop(serviceId: string): Promise<void> | void;
  onRestart(serviceId: string): Promise<void> | void;
}

type ServiceAction = 'start' | 'stop' | 'restart';

interface ServiceActionState {
  status: 'pending' | 'success' | 'error';
  message: string;
}

const actionLabels: Record<ServiceAction, { present: string; past: string }> = {
  start: { present: 'Starting', past: 'Started' },
  stop: { present: 'Stopping', past: 'Stopped' },
  restart: { present: 'Restarting', past: 'Restarted' },
};

function normalizeServiceStatus(status: string): string {
  return status.trim().toLowerCase();
}

function canStartService(service: NetworkServiceItem): boolean {
  const status = normalizeServiceStatus(service.status);
  return status === 'stopped' || status === 'failed';
}

function canStopOrRestartService(service: NetworkServiceItem): boolean {
  return !service.inProcess && normalizeServiceStatus(service.status) === 'running';
}

export function NetworkServiceList({
  services,
  onStart,
  onStop,
  onRestart,
}: NetworkServiceListProps) {
  const [actionStateByService, setActionStateByService] = useState<Record<string, ServiceActionState>>({});

  const runAction = (
    service: NetworkServiceItem,
    action: ServiceAction,
    callback: (serviceId: string) => Promise<void> | void,
  ) => {
    const serviceId = service.id;
    const current = actionStateByService[serviceId];
    const isAllowed = action === 'start'
      ? canStartService(service)
      : canStopOrRestartService(service);
    if (current?.status === 'pending' || !isAllowed) {
      return;
    }
    setActionStateByService((states) => ({
      ...states,
      [serviceId]: {
        status: 'pending',
        message: `${actionLabels[action].present} ${serviceId}…`,
      },
    }));
    void Promise.resolve(callback(serviceId))
      .then(() => {
        setActionStateByService((states) => ({
          ...states,
          [serviceId]: {
            status: 'success',
            message: `${actionLabels[action].past} ${serviceId}.`,
          },
        }));
      })
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : 'Action failed.';
        setActionStateByService((states) => ({
          ...states,
          [serviceId]: {
            status: 'error',
            message: `Unable to ${action} ${serviceId}: ${detail}`,
          },
        }));
      });
  };

  return (
    <section className="rail-card network-services">
      <div className="rail-card__header">
        <p className="eyebrow">Services</p>
      </div>
      <div className="network-services__list">
        {services.map((service) => {
          const actionState = actionStateByService[service.id];
          const hasPendingAction = actionState?.status === 'pending';
          const startDisabled = hasPendingAction || !canStartService(service);
          const stopOrRestartDisabled = hasPendingAction || !canStopOrRestartService(service);
          return (
          <article key={service.id} className="network-services__item">
            <div>
              <strong>{service.id}</strong>
              <p>{service.status}</p>
              {service.inProcess && <small>in-process</small>}
              {service.explanation && <span>{service.explanation}</span>}
              {service.url && <small>{service.url}</small>}
              {service.channels && <small>{Object.entries(service.channels).map(([name, enabled]) => `${name}:${enabled ? 'on' : 'off'}`).join(' ')}</small>}
              {actionState && (
                <small
                  aria-live="polite"
                  role={actionState.status === 'error' ? 'alert' : undefined}
                >
                  {actionState.message}
                </small>
              )}
            </div>
            <div className="network-services__actions">
              <button className="button button--secondary button--small" type="button" onClick={() => runAction(service, 'start', onStart)} aria-label={`Start ${service.id}`} disabled={startDisabled}>Start</button>
              <button className="button button--secondary button--small" type="button" onClick={() => runAction(service, 'stop', onStop)} aria-label={`Stop ${service.id}`} disabled={stopOrRestartDisabled}>Stop</button>
              <button className="button button--secondary button--small" type="button" onClick={() => runAction(service, 'restart', onRestart)} aria-label={`Restart ${service.id}`} disabled={stopOrRestartDisabled}>Restart</button>
            </div>
          </article>
          );
        })}
      </div>
    </section>
  );
}
