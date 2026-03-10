import { ChatShell } from './components/chat-shell';

export function resolveBaseUrl(
  explicitBaseUrl: string | undefined,
  locationOrigin: string = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
): string {
  const trimmed = explicitBaseUrl?.trim();
  return trimmed ? trimmed : locationOrigin;
}

const BASE_URL = resolveBaseUrl(import.meta.env.VITE_API_URL as string | undefined);
const PROJECT_ID = import.meta.env.VITE_PROJECT_ID as string | undefined ?? 'default';
const VERSION = __FRANKENBEAST_VERSION__;

export function App() {
  return <ChatShell baseUrl={BASE_URL} projectId={PROJECT_ID} version={VERSION} />;
}
