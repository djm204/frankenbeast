export type RouteId = 'dashboard' | 'chat' | 'beasts' | 'network' | 'sessions' | 'analytics' | 'costs' | 'safety' | 'settings';
export type PlaceholderRouteId = Exclude<RouteId, 'dashboard' | 'chat' | 'beasts' | 'network' | 'analytics'>;

export interface DashboardRoute {
  id: RouteId;
  label: string;
  summary: string;
  live: boolean;
}

export const ROUTES: DashboardRoute[] = [
  { id: 'dashboard', label: 'Overview', summary: 'Snapshot controls for skills, security, and providers', live: true },
  { id: 'chat', label: 'Chat', summary: 'Live CLI-parity operator console', live: true },
  { id: 'beasts', label: 'Beasts', summary: 'Dispatch, inspect, and control tracked beast runs', live: true },
  { id: 'network', label: 'Network', summary: 'Service controls and operator config', live: true },
  { id: 'sessions', label: 'Sessions', summary: 'Coming online once session explorer lands', live: false },
  { id: 'analytics', label: 'Analytics', summary: 'Observer, governor, security, and cost telemetry', live: true },
  { id: 'costs', label: 'Costs', summary: 'Token and provider reporting will live here', live: false },
  { id: 'safety', label: 'Safety', summary: 'Approvals, policy, and injection telemetry', live: false },
  { id: 'settings', label: 'Settings', summary: 'Operator configuration and launch profiles', live: false },
];

export const PRIMARY_NAV_ROUTES = ROUTES.filter((route) => route.live);

export function routeFromHash(hash: string): RouteId {
  const candidate = hash.replace(/^#\/?/, '') as RouteId;
  return PRIMARY_NAV_ROUTES.some((route) => route.id === candidate) ? candidate : 'chat';
}
