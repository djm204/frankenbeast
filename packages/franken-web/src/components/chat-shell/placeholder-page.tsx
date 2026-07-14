import { ROUTES, type PlaceholderRouteId } from './route-model';

export function PlaceholderPage({ routeId }: { routeId: PlaceholderRouteId }) {
  const route = ROUTES.find((item) => item.id === routeId)!;

  return (
    <section className="placeholder-page">
      <p className="eyebrow">Dashboard Module</p>
      <h2>{route.label}</h2>
      <p>{route.summary}</p>
    </section>
  );
}
