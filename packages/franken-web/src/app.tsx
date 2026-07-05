import { ChatShell } from './components/chat-shell';
import { resolveBaseUrl } from './lib/resolve-base-url';

export { resolveBaseUrl } from './lib/resolve-base-url';

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
