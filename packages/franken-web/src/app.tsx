import { ChatShell } from './components/chat-shell';

export function resolveBaseUrl(
  locationOrigin: string = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
): string {
  return locationOrigin;
}

const BASE_URL = resolveBaseUrl();
const PROJECT_ID = import.meta.env.VITE_PROJECT_ID as string | undefined ?? 'default';
const VERSION = __FRANKENBEAST_VERSION__;

export function App() {
  return (
    <ChatShell
      baseUrl={BASE_URL}
      projectId={PROJECT_ID}
      version={VERSION}
    />
  );
}
