import { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';

interface NetworkServiceItem {
  id: string;
  status: string;
  explanation?: string;
  url?: string;
  inProcess?: boolean;
  hostServiceId?: string;
  channels?: Record<string, boolean>;
}

interface NetworkServiceListProps {
  services: NetworkServiceItem[];
  onSelectLogs(serviceId: string): void;
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
  const status = normalizeServiceStatus(service.status);
  return !service.inProcess && (status === 'running' || status === 'stale' || status === 'degraded');
}

function canViewServiceLogs(service: NetworkServiceItem): boolean {
  return !service.inProcess || Boolean(service.hostServiceId);
}

function ConfirmServiceAction({
  action,
  serviceId,
  disabled,
  onConfirm,
}: {
  action: 'stop' | 'restart';
  serviceId: string;
  disabled: boolean;
  onConfirm(): void;
}) {
  const actionLabel = action === 'stop' ? 'Stop' : 'Restart';
  const consequence = action === 'stop'
    ? 'Stopping this service will interrupt active sessions that depend on it. The service will remain unavailable until it is started again.'
    : 'Restarting this service will interrupt active sessions that depend on it while the service restarts.';

  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <button
          aria-label={`${actionLabel} ${serviceId}`}
          className="button button--secondary button--small"
          disabled={disabled}
          type="button"
        >
          {actionLabel}
        </button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/50 z-[60]" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-beast-panel border border-beast-border rounded-xl p-6 z-[60] max-w-md">
          <AlertDialog.Title className="text-beast-text font-semibold">
            {actionLabel} {serviceId}?
          </AlertDialog.Title>
          <AlertDialog.Description className="text-beast-muted text-sm mt-2">
            {consequence}
          </AlertDialog.Description>
          <div className="flex gap-3 mt-4 justify-end">
            <AlertDialog.Cancel asChild>
              <button className="button button--secondary button--small" type="button">Cancel</button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                aria-label={`Confirm ${action} ${serviceId}`}
                className="px-3 py-1.5 rounded-lg text-sm bg-beast-danger text-white"
                onClick={onConfirm}
                type="button"
              >
                {actionLabel} service
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function NetworkServiceList({
  services,
  onSelectLogs,
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
              {canViewServiceLogs(service) ? (
                <button
                  aria-label={`View logs for ${service.id}`}
                  className="button button--secondary button--small"
                  onClick={() => onSelectLogs(service.id)}
                  type="button"
                >
                  View logs
                </button>
              ) : null}
              <button className="button button--secondary button--small" type="button" onClick={() => runAction(service, 'start', onStart)} aria-label={`Start ${service.id}`} disabled={startDisabled}>Start</button>
              <ConfirmServiceAction
                action="stop"
                serviceId={service.id}
                disabled={stopOrRestartDisabled}
                onConfirm={() => runAction(service, 'stop', onStop)}
              />
              <ConfirmServiceAction
                action="restart"
                serviceId={service.id}
                disabled={stopOrRestartDisabled}
                onConfirm={() => runAction(service, 'restart', onRestart)}
              />
            </div>
          </article>
          );
        })}
      </div>
    </section>
  );
}
