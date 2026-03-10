interface NetworkServiceItem {
  id: string;
  status: string;
  explanation?: string;
  url?: string;
}

interface NetworkServiceListProps {
  services: NetworkServiceItem[];
  onStart(serviceId: string): void;
  onStop(serviceId: string): void;
  onRestart(serviceId: string): void;
}

export function NetworkServiceList({
  services,
  onStart,
  onStop,
  onRestart,
}: NetworkServiceListProps) {
  return (
    <section className="rail-card network-services">
      <div className="rail-card__header">
        <p className="eyebrow">Services</p>
      </div>
      <div className="network-services__list">
        {services.map((service) => (
          <article key={service.id} className="network-services__item">
            <div>
              <strong>{service.id}</strong>
              <p>{service.status}</p>
              {service.explanation && <span>{service.explanation}</span>}
              {service.url && <small>{service.url}</small>}
            </div>
            <div className="network-services__actions">
              <button className="button button--secondary button--small" type="button" onClick={() => onStart(service.id)} aria-label={`Start ${service.id}`}>Start</button>
              <button className="button button--secondary button--small" type="button" onClick={() => onStop(service.id)} aria-label={`Stop ${service.id}`}>Stop</button>
              <button className="button button--secondary button--small" type="button" onClick={() => onRestart(service.id)} aria-label={`Restart ${service.id}`}>Restart</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
