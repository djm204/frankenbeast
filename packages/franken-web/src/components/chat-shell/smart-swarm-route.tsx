const SMART_SWARM_REPOSITORY = 'https://github.com/djm204/smart-swarm';

interface SmartSwarmRouteProps {
  baseUrl: string;
}

export function SmartSwarmRoute({ baseUrl: _baseUrl }: SmartSwarmRouteProps) {
  return (
    <main className="smart-swarm-page">
      <section aria-labelledby="smart-swarm-retirement-title" className="smart-swarm-state">
        <p className="eyebrow">Retired Frankenbeast surface</p>
        <h1 id="smart-swarm-retirement-title">Operational dashboard moved to Smart Swarm</h1>
        <p>
          Frankenbeast still provides deterministic guardrails. Smart Swarm now owns swarm topology,
          runtime Brain Pulse evidence, and approval operations.
        </p>
        <a href={SMART_SWARM_REPOSITORY} rel="noreferrer" target="_blank">
          Open Smart Swarm
        </a>
      </section>
    </main>
  );
}
